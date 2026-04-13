import { ReportCacheService } from './report-cache.service'

describe('ReportCacheService', () => {
  const originalRedisUrl = process.env.REDIS_URL

  beforeEach(() => {
    delete process.env.REDIS_URL
  })

  afterAll(() => {
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = originalRedisUrl
  })

  it('reuses memory cache values when redis is not configured', async () => {
    const cache = new ReportCacheService()
    const builder = jest.fn()
      .mockResolvedValueOnce({ total: 12 })

    const first = await cache.remember('report:test', 1000, builder)
    const second = await cache.remember('report:test', 1000, builder)

    expect(first).toEqual({ total: 12 })
    expect(second).toEqual({ total: 12 })
    expect(builder).toHaveBeenCalledTimes(1)
  })
})
