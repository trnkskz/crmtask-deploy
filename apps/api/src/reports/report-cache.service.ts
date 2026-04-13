import { Injectable, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'

type MemoryCacheEntry = { expiresAt: number; value: any }

@Injectable()
export class ReportCacheService implements OnModuleDestroy {
  private readonly memoryCache = new Map<string, MemoryCacheEntry>()
  private readonly memoryCap = 200
  private readonly redisUrl = String(process.env.REDIS_URL || '').trim()
  private redisClient: Redis | null = null
  private redisConnectPromise: Promise<Redis | null> | null = null
  private redisDisabledUntil = 0

  async onModuleDestroy() {
    await this.disposeRedisClient()
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

  private shouldUseRedis() {
    return Boolean(this.redisUrl) && Date.now() >= this.redisDisabledUntil
  }

  private async disposeRedisClient() {
    if (!this.redisClient) return
    try {
      await this.redisClient.quit()
    } catch {
      try {
        this.redisClient.disconnect(false)
      } catch {
        // ignore disconnect races
      }
    }
    this.redisClient = null
    this.redisConnectPromise = null
  }

  private async disableRedisTemporarily() {
    this.redisDisabledUntil = Date.now() + 30_000
    await this.disposeRedisClient()
  }

  private async ensureRedisClient() {
    if (!this.shouldUseRedis()) return null
    if (this.redisClient && this.redisClient.status !== 'end') return this.redisClient
    if (this.redisConnectPromise) return this.redisConnectPromise

    const client = new Redis(this.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    client.on('error', () => {
      this.disableRedisTemporarily().catch(() => {})
    })
    client.on('end', () => {
      this.redisClient = null
    })

    this.redisConnectPromise = client.connect()
      .then(() => {
        this.redisClient = client
        return client
      })
      .catch(async () => {
        await this.disableRedisTemporarily()
        return null
      })
      .finally(() => {
        this.redisConnectPromise = null
      })

    return this.redisConnectPromise
  }

  private async getRedisValue<T>(key: string) {
    const client = await this.ensureRedisClient()
    if (!client) return undefined
    try {
      const raw = await client.get(key)
      if (raw == null || raw === '') return undefined
      return JSON.parse(String(raw)) as T
    } catch {
      await this.disableRedisTemporarily()
      return undefined
    }
  }

  private async setRedisValue(key: string, value: any, ttlMs: number) {
    const client = await this.ensureRedisClient()
    if (!client) return
    try {
      await client.set(key, JSON.stringify(value), 'PX', ttlMs)
    } catch {
      await this.disableRedisTemporarily()
    }
  }
}
