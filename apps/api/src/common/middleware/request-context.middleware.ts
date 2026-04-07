import { Injectable, NestMiddleware } from '@nestjs/common'
import type { Request, Response, NextFunction } from 'express'

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    const rid = (globalThis as any).crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
    req.requestId = rid
    res.setHeader('x-request-id', rid)
    next()
  }
}

