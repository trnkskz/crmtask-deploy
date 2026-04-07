import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service'

function parseCookieHeader(raw?: string | null): Record<string, string> {
  if (!raw) return {}
  const out: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (!k) continue
    out[k] = decodeURIComponent(v)
  }
  return out
}

@Controller('auth')
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  private cookieBaseOptions() {
    const isProd = process.env.NODE_ENV === 'production'
    const secureOverride = (process.env.AUTH_COOKIE_SECURE || '').trim().toLowerCase()
    const secure = secureOverride
      ? ['1', 'true', 'yes', 'on'].includes(secureOverride)
      : isProd
    return {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/',
    }
  }

  private setAuthCookies(res: Response, data: { accessToken?: string; refreshToken?: string }) {
    const opts = this.cookieBaseOptions()
    if (data.accessToken) {
      res.cookie('accessToken', data.accessToken, { ...opts, maxAge: 15 * 60 * 1000 })
    }
    if (data.refreshToken) {
      res.cookie('refreshToken', data.refreshToken, { ...opts, maxAge: 7 * 24 * 3600 * 1000 })
    }
  }

  private clearAuthCookies(res: Response) {
    const opts = this.cookieBaseOptions()
    res.clearCookie('accessToken', opts)
    res.clearCookie('refreshToken', opts)
  }

  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.email || !body?.password) throw new UnauthorizedException('Missing credentials')
    const result = await this.svc.login(body.email, body.password)
    if (!(result as any)?.requiresTwoFactor) {
      this.setAuthCookies(res, result as any)
    }
    return result
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = parseCookieHeader(req.header('cookie'))
    const refreshToken = body?.refreshToken || cookies.refreshToken
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token')
    const result = await this.svc.refresh(refreshToken)
    this.setAuthCookies(res, result as any)
    return result
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Body() body: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = parseCookieHeader(req.header('cookie'))
    const refreshToken = body?.refreshToken || cookies.refreshToken
    if (!refreshToken) {
      this.clearAuthCookies(res)
      return { ok: true }
    }
    const result = await this.svc.logout(refreshToken)
    this.clearAuthCookies(res)
    return result
  }

  @Get('me')
  async me(@Req() req: Request) {
    const user = (req as any).user
    const authMode = (req as any).authMode
    if (!user || authMode !== 'jwt') throw new UnauthorizedException('Authentication required')
    return { user: await this.svc.me(user.id) }
  }

  // --- 2FA Endpoints ---

  @Post('2fa/setup')
  async setupTwoFactor(@Req() req: Request) {
    const user = (req as any).user
    return this.svc.setupTwoFactor(user.id)
  }

  @Post('2fa/enable')
  async enableTwoFactor(@Req() req: Request, @Body() body: { code: string }) {
    const user = (req as any).user
    if (!body?.code) throw new UnauthorizedException('Missing 2FA code')
    return this.svc.enableTwoFactor(user.id, body.code)
  }

  @Post('2fa/disable')
  async disableTwoFactor(@Req() req: Request, @Body() body: { code: string }) {
    const user = (req as any).user
    if (!body?.code) throw new UnauthorizedException('Missing 2FA code')
    return this.svc.disableTwoFactor(user.id, body.code)
  }

  @Post('2fa/verify')
  async verifyTwoFactor(
    @Body() body: { tempToken: string; code: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.tempToken || !body?.code) throw new UnauthorizedException('Missing temp token or code')
    const result = await this.svc.verifyTwoFactor(body.tempToken, body.code)
    this.setAuthCookies(res, result as any)
    return result
  }
}
