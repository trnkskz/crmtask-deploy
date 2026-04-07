import crypto from 'crypto'

const enc = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url')
const dec = (b64: string) => JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'))

function hmacSHA256(secret: string, data: string) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url')
}

function getAuthSecret(override?: string) {
  const sec = override || process.env.AUTH_SECRET
  if (sec) return sec
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production')
  }
  return 'dev-secret'
}

export function signToken(payload: Record<string, any>, opts?: { expiresInSec?: number; secret?: string }) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const exp = now + (opts?.expiresInSec ?? 900) // default 15 minutes
  const body = { ...payload, iat: now, exp }
  const sec = getAuthSecret(opts?.secret)
  const unsigned = enc(header) + '.' + enc(body)
  const sig = hmacSHA256(sec, unsigned)
  return unsigned + '.' + sig
}

export function verifyToken(token: string, opts?: { secret?: string }) {
  const [h, p, s] = token.split('.')
  if (!h || !p || !s) throw new Error('Invalid token')
  const sec = getAuthSecret(opts?.secret)
  const sig = hmacSHA256(sec, h + '.' + p)
  if (sig !== s) throw new Error('Invalid signature')
  const payload = dec(p)
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) throw new Error('Token expired')
  return payload
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = crypto.scryptSync(plain, salt, 32).toString('hex')
  return `scrypt:${salt}:${derived}`
}

export async function comparePassword(plain: string, hashed?: string | null): Promise<boolean> {
  if (!hashed) return false
  if (!hashed.startsWith('scrypt:')) return false
  const [, salt, digest] = hashed.split(':')
  const derived = crypto.scryptSync(plain, salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(digest, 'hex'))
}
