import { HttpException, HttpStatus, Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common'
import type { Request, Response, NextFunction } from 'express'
import type { RoleString } from './role.types'
import { verifyToken } from './token.util'
import { PrismaService } from '../infrastructure/prisma/prisma.service'

declare global {
  // eslint-disable-next-line no-var
  var __devAuth__: boolean | undefined
}

type RateLimitBucket = { count: number; resetAt: number }
const rateLimitBuckets = new Map<string, RateLimitBucket>()

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

function parseRole(v?: string | null): RoleString | undefined {
  if (!v) return undefined
  const up = v.toUpperCase().trim()
  if (['ADMIN','MANAGER','TEAM_LEADER','SALESPERSON'].includes(up)) return up as RoleString
  return undefined
}

@Injectable()
export class DevUserMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  private getClientIp(req: Request) {
    const forwarded = req.header('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()
    return req.ip || req.socket?.remoteAddress || 'unknown'
  }

  private applyRateLimit(req: Request) {
    const path = req.originalUrl.split('?')[0]
    if (req.method !== 'POST') return

    const isProd = process.env.NODE_ENV === 'production'
    const ip = this.getClientIp(req)
    const body = (req as any).body || {}

    let key: string | null = null
    let windowMs = 0
    let maxAttempts = 0

    if (path === '/api/auth/login') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : 'unknown'
      key = `login:${ip}:${email}`
      windowMs = 60_000
      maxAttempts = Number(process.env.AUTH_LOGIN_MAX_ATTEMPTS || (isProd ? 10 : 60))
    } else if (path === '/api/auth/2fa/verify') {
      const tokenHint = typeof body.tempToken === 'string' ? body.tempToken.slice(0, 16) : 'unknown'
      key = `2fa:${ip}:${tokenHint}`
      windowMs = 5 * 60_000
      maxAttempts = Number(process.env.AUTH_2FA_VERIFY_MAX_ATTEMPTS || (isProd ? 20 : 120))
    }

    if (!key || maxAttempts <= 0) return

    const now = Date.now()

    // Opportunistic cleanup to keep memory bounded.
    if (rateLimitBuckets.size > 5000) {
      for (const [k, v] of rateLimitBuckets) {
        if (v.resetAt <= now) rateLimitBuckets.delete(k)
      }
    }

    const bucket = rateLimitBuckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs })
      return
    }

    bucket.count += 1
    if (bucket.count > maxAttempts) {
      throw new HttpException(
        'Too many authentication attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  async use(req: Request, _res: Response, next: NextFunction) {
    this.applyRateLimit(req)
    const isProd = process.env.NODE_ENV === 'production'
    const path = req.originalUrl.split('?')[0]
    const requiresRealAuth = /^\/api\/auth\/me$/.test(path) || /^\/api\/auth\/2fa\/(?:setup|enable|disable)$/.test(path)

    // Public endpoints that don't require authentication
    const publicPaths = [
      { method: 'GET', pattern: /^\/api\/invitations\/verify\// },
      { method: 'POST', pattern: /^\/api\/invitations\/accept$/ },
      { method: 'POST', pattern: /^\/api\/auth\/login$/ },
      { method: 'POST', pattern: /^\/api\/auth\/refresh$/ },
      { method: 'POST', pattern: /^\/api\/auth\/logout$/ },
      { method: 'POST', pattern: /^\/api\/auth\/2fa\/verify$/ },
    ]
    const isPublic = publicPaths.some((p) => req.method === p.method && p.pattern.test(path))
    if (isPublic) {
      if (!isProd) {
        ;(req as any).user = { id: 'anonymous', role: 'SALESPERSON' }
      }
      return next()
    }

    // If a real auth is later added, this middleware can be removed.
    const url = new URL(req.protocol + '://' + req.get('host') + req.originalUrl)

    // 1) If Authorization: Bearer <token> present, prefer JWT user
    const auth = req.header('authorization') || req.header('Authorization')
    const cookieToken = parseCookieHeader(req.header('cookie')).accessToken
    const bearerToken = auth && auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : undefined
    const tok = bearerToken || cookieToken
    if (tok) {
      try {
        const payload = verifyToken(tok)
        ;(req as any).user = { id: payload.sub, role: (payload.role as any) || 'SALESPERSON' }
        ;(req as any).authMode = 'jwt'
        return next()
      } catch {
        throw new UnauthorizedException('Invalid access token')
      }
    }

    if (requiresRealAuth) return next()
    if (isProd) return next()

    const qUser = url.searchParams.get('u') || undefined
    const qRole = url.searchParams.get('role') || undefined

    const id = (req.headers['x-user-id'] as string) || qUser || 'dev-user'
    const email = (req.headers['x-user-email'] as string) || 'dev@example.com'
    const defaultRole = parseRole(process.env.DEV_DEFAULT_ROLE || 'ADMIN') || 'ADMIN'
    const role = parseRole((req.headers['x-user-role'] as string) || qRole || defaultRole) ?? defaultRole

    ;(req as any).user = { id, email, role }
    ;(req as any).authMode = 'dev'

    // Ensure a corresponding user exists in DB for dev visibility (non-blocking best-effort)
    try {
      const normEmail = email ? String(email) : `${id}@dev.local`
      const isDefaultFallbackIdentity = id === 'dev-user' && normEmail === 'dev@example.com'
      if (!isDefaultFallbackIdentity) {
        const existingByEmail = await this.prisma.user.findUnique({ where: { email: normEmail } })
        if (!existingByEmail) {
          // Try create with provided id to make it deterministic in dev
          const data: any = { id, name: 'Sistem Yöneticisi', email: normEmail, role: (role as any) || 'SALESPERSON', isActive: true }
          await this.prisma.user.create({ data })
        } else if (existingByEmail.role !== (role as any)) {
          await this.prisma.user.update({ where: { email: normEmail }, data: { role: (role as any) } })
        }
      }
    } catch {
      // ignore dev upsert errors
    }
    // Remove dev auth query params to avoid DTO whitelist validation errors
    try {
      if ((req as any).query) {
        delete (req as any).query.u
        delete (req as any).query.role
      }
    } catch {}
    next()
  }
}
