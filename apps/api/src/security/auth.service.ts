import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { comparePassword, hashPassword, signToken, verifyToken } from './token.util'
import { generateSecret, verifySync, generateURI } from 'otplib'
import * as QRCode from 'qrcode'
import { randomUUID } from 'crypto'

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  private hasLegacyProfileFieldError(error: any) {
    const msg = String(error?.message || '')
    return /User\.(team|phone|settings)/i.test(msg) || /Unknown (argument|field).*(team|phone|settings)/i.test(msg)
  }

  private normalizeAuthUser(user: any) {
    if (!user) return user
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      team: user.team ?? null,
      phone: user.phone ?? null,
      settings: user.settings ?? null,
    }
  }

  private async getProfileUserById(userId: string) {
    try {
      return await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, isActive: true, team: true, phone: true, settings: true },
      })
    } catch (e: any) {
      if (!this.hasLegacyProfileFieldError(e)) throw e
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      })
      return user ? { ...user, team: null, phone: null, settings: null } : user
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials')
    const ok = await comparePassword(password, (user as any).password)
    if (!ok) throw new UnauthorizedException('Invalid credentials')

    // If 2FA is enabled, return a temp token instead of real tokens
    if (user.twoFactorEnabled) {
      const tempToken = signToken(
        { sub: user.id, type: '2fa-temp' },
        { expiresInSec: 5 * 60 },
      )
      return {
        requiresTwoFactor: true,
        tempToken,
        user: this.normalizeAuthUser(user),
      }
    }

    const accessToken = signToken({ sub: user.id, role: user.role }, { expiresInSec: 15 * 60 })
    const refreshToken = signToken({ sub: user.id, type: 'refresh', jti: randomUUID() }, { expiresInSec: 7 * 24 * 3600 })
    const exp = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    await this.prisma.refreshToken.create({ data: { userId: user.id, token: refreshToken, expiresAt: exp } })
    return { accessToken, refreshToken, user: this.normalizeAuthUser(user) }
  }

  async verifyTwoFactor(tempToken: string, code: string) {
    let payload: any
    try {
      payload = verifyToken(tempToken)
    } catch {
      throw new UnauthorizedException('Invalid or expired temp token')
    }
    if (payload.type !== '2fa-temp') throw new UnauthorizedException('Invalid token type')

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.isActive || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException('Invalid user or 2FA not enabled')
    }

    const result = verifySync({ token: code, secret: user.twoFactorSecret })
    if (!result.valid) throw new UnauthorizedException('Invalid 2FA code')

    const accessToken = signToken({ sub: user.id, role: user.role }, { expiresInSec: 15 * 60 })
    const refreshToken = signToken({ sub: user.id, type: 'refresh', jti: randomUUID() }, { expiresInSec: 7 * 24 * 3600 })
    const exp = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    await this.prisma.refreshToken.create({ data: { userId: user.id, token: refreshToken, expiresAt: exp } })
    return { accessToken, refreshToken, user: this.normalizeAuthUser(user) }
  }

  async setupTwoFactor(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new BadRequestException('User not found')
    if (user.twoFactorEnabled) throw new BadRequestException('2FA is already enabled')

    const secret = generateSecret()
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret },
    })

    const otpauthUrl = generateURI({
      issuer: 'Grupanya',
      label: user.email,
      secret,
    })
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl)

    return { secret, qrCodeDataUrl }
  }

  async enableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.twoFactorSecret) throw new BadRequestException('Setup 2FA first')
    if (user.twoFactorEnabled) throw new BadRequestException('2FA is already enabled')

    const result = verifySync({ token: code, secret: user.twoFactorSecret })
    if (!result.valid) throw new BadRequestException('Invalid 2FA code')

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    })

    return { ok: true }
  }

  async disableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA is not enabled')
    }

    const result = verifySync({ token: code, secret: user.twoFactorSecret })
    if (!result.valid) throw new BadRequestException('Invalid 2FA code')

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    })

    return { ok: true }
  }

  async refresh(refreshToken: string) {
    const rec = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken } })
    if (!rec || rec.expiresAt < new Date()) throw new UnauthorizedException('Invalid refresh token')
    const user = await this.prisma.user.findUnique({ where: { id: rec.userId } })
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid user')
    const accessToken = signToken({ sub: user.id, role: user.role }, { expiresInSec: 15 * 60 })
    return { accessToken }
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } })
    return { ok: true }
  }

  async me(userId: string) {
    const user = await this.getProfileUserById(userId)
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid user')
    return user
  }

  // Utility for seeding a password (optional)
  async setPassword(userId: string, newPassword: string) {
    const hashed = await hashPassword(newPassword)
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } as any })
    return { ok: true }
  }
}
