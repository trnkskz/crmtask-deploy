import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { Socket, createConnection } from 'node:net'

type MemoryCacheEntry = { expiresAt: number; value: any }
type PendingRedisResponse = { resolve: (value: any) => void; reject: (error: Error) => void }
type ParsedRespResult = { value: any; bytesConsumed: number }

@Injectable()
export class ReportCacheService implements OnModuleDestroy {
  private readonly memoryCache = new Map<string, MemoryCacheEntry>()
  private readonly memoryCap = 200
  private readonly redisConfig = this.parseRedisUrl(process.env.REDIS_URL || '')
  private socket: Socket | null = null
  private connectPromise: Promise<void> | null = null
  private pendingResponses: PendingRedisResponse[] = []
  private buffer = Buffer.alloc(0)
  private redisDisabledUntil = 0

  async onModuleDestroy() {
    this.disposeSocket()
  }

  async remember<T>(key: string, ttlMs: number, builder: () => Promise<T>) {
    const cached = await this.get<T>(key)
    if (cached !== undefined) return cached

    const value = await builder()
    await this.set(key, value, ttlMs)
    return value
  }

  private getMemoryValue<T>(key: string) {
    const now = Date.now()
    const cached = this.memoryCache.get(key)
    if (cached && cached.expiresAt > now) return cached.value as T
    if (cached) this.memoryCache.delete(key)
    return undefined
  }

  private setMemoryValue(key: string, value: any, ttlMs: number) {
    const now = Date.now()
    this.memoryCache.set(key, { value, expiresAt: now + ttlMs })
    if (this.memoryCache.size > this.memoryCap) {
      for (const [cacheKey, entry] of this.memoryCache.entries()) {
        if (entry.expiresAt <= now) this.memoryCache.delete(cacheKey)
      }
      if (this.memoryCache.size > this.memoryCap) {
        const overflow = this.memoryCache.size - this.memoryCap
        let removed = 0
        for (const cacheKey of this.memoryCache.keys()) {
          this.memoryCache.delete(cacheKey)
          removed += 1
          if (removed >= overflow) break
        }
      }
    }
  }

  private async get<T>(key: string) {
    const memoryValue = this.getMemoryValue<T>(key)
    if (memoryValue !== undefined) return memoryValue
    const redisValue = await this.getRedisValue<T>(key)
    if (redisValue !== undefined) {
      this.setMemoryValue(key, redisValue, 10_000)
      return redisValue
    }
    return undefined
  }

  private async set(key: string, value: any, ttlMs: number) {
    this.setMemoryValue(key, value, ttlMs)
    await this.setRedisValue(key, value, ttlMs)
  }

  private parseRedisUrl(rawUrl: string) {
    if (!rawUrl) return null
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol !== 'redis:') return null
      return {
        host: parsed.hostname || '127.0.0.1',
        port: Number(parsed.port || 6379),
        password: parsed.password || '',
        db: Number((parsed.pathname || '/0').replace('/', '') || 0),
      }
    } catch {
      return null
    }
  }

  private shouldUseRedis() {
    return Boolean(this.redisConfig) && Date.now() >= this.redisDisabledUntil
  }

  private disableRedisTemporarily() {
    this.redisDisabledUntil = Date.now() + 30_000
    this.disposeSocket()
  }

  private disposeSocket() {
    if (this.socket) {
      try {
        this.socket.destroy()
      } catch {
        // ignore destroy races
      }
    }
    this.socket = null
    this.connectPromise = null
    while (this.pendingResponses.length > 0) {
      const pending = this.pendingResponses.shift()
      pending?.reject(new Error('Redis connection closed'))
    }
    this.buffer = Buffer.alloc(0)
  }

  private async ensureRedisConnection() {
    if (!this.redisConfig) throw new Error('Redis disabled')
    if (this.socket && !this.socket.destroyed) return
    if (this.connectPromise) return this.connectPromise

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const socket = createConnection({
        host: this.redisConfig!.host,
        port: this.redisConfig!.port,
      })

      const failConnection = (error: Error) => {
        this.disableRedisTemporarily()
        reject(error)
      }

      socket.once('error', failConnection)
      socket.once('connect', async () => {
        socket.off('error', failConnection)
        this.socket = socket
        socket.on('data', (chunk) => this.handleSocketData(chunk))
        socket.on('error', () => this.disableRedisTemporarily())
        socket.on('close', () => this.disposeSocket())
        try {
          if (this.redisConfig?.password) {
            await this.sendRedisCommand(['AUTH', this.redisConfig.password])
          }
          const dbIndex = this.redisConfig?.db || 0
          if (dbIndex > 0) {
            await this.sendRedisCommand(['SELECT', String(dbIndex)])
          }
          resolve()
        } catch (error: any) {
          this.disableRedisTemporarily()
          reject(error)
        }
      })
    }).finally(() => {
      this.connectPromise = null
    })

    return this.connectPromise
  }

  private handleSocketData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.pendingResponses.length > 0) {
      const parsed = this.tryParseResp(this.buffer)
      if (!parsed) return
      this.buffer = this.buffer.subarray(parsed.bytesConsumed)
      const next = this.pendingResponses.shift()
      if (!next) return
      if (parsed.value instanceof Error) next.reject(parsed.value)
      else next.resolve(parsed.value)
    }
  }

  private tryParseResp(buffer: Buffer): ParsedRespResult | null {
    if (!buffer.length) return null
    const prefix = String.fromCharCode(buffer[0])
    const lineEnd = buffer.indexOf('\r\n')
    if (lineEnd < 0) return null

    if (prefix === '+' || prefix === '-' || prefix === ':') {
      const raw = buffer.subarray(1, lineEnd).toString('utf8')
      if (prefix === '+') return { value: raw, bytesConsumed: lineEnd + 2 }
      if (prefix === '-') return { value: new Error(raw), bytesConsumed: lineEnd + 2 }
      return { value: Number(raw), bytesConsumed: lineEnd + 2 }
    }

    if (prefix === '$') {
      const size = Number(buffer.subarray(1, lineEnd).toString('utf8'))
      if (size === -1) return { value: null, bytesConsumed: lineEnd + 2 }
      const endIndex = lineEnd + 2 + size
      if (buffer.length < endIndex + 2) return null
      return {
        value: buffer.subarray(lineEnd + 2, endIndex).toString('utf8'),
        bytesConsumed: endIndex + 2,
      }
    }

    return null
  }

  private async sendRedisCommand(args: string[]) {
    await this.ensureRedisConnection()
    if (!this.socket) throw new Error('Redis socket unavailable')

    return new Promise<any>((resolve, reject) => {
      this.pendingResponses.push({ resolve, reject })
      const payload = `*${args.length}\r\n${args.map((arg) => {
        const value = String(arg)
        return `$${Buffer.byteLength(value)}\r\n${value}\r\n`
      }).join('')}`
      this.socket!.write(payload)
    })
  }

  private async getRedisValue<T>(key: string) {
    if (!this.shouldUseRedis()) return undefined
    try {
      const raw = await this.sendRedisCommand(['GET', key])
      if (raw == null || raw === '') return undefined
      return JSON.parse(String(raw)) as T
    } catch {
      this.disableRedisTemporarily()
      return undefined
    }
  }

  private async setRedisValue(key: string, value: any, ttlMs: number) {
    if (!this.shouldUseRedis()) return
    try {
      await this.sendRedisCommand(['SET', key, JSON.stringify(value), 'PX', String(ttlMs)])
    } catch {
      this.disableRedisTemporarily()
    }
  }
}
