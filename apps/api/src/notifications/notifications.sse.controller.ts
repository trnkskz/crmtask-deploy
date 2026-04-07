import { Controller, Sse, Req, Header } from '@nestjs/common'
import type { Request } from 'express'
import { NotificationStreamService } from './stream.service'
import { Observable, map, interval, merge } from 'rxjs'

@Controller('notifications')
export class NotificationsSseController {
  constructor(private streams: NotificationStreamService) {}

  @Sse('stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  stream(@Req() req: Request): Observable<MessageEvent> {
    // Dev auth middleware also parses ?u= and ?role=
    const user = (req as any).user
    const userId = user?.id || 'dev-user'
    // Merge real notifications with a heartbeat to keep the SSE connection alive across proxies/browsers.
    const notifications$ = this.streams
      .getStream(userId)
      .pipe(map((evt) => ({ data: JSON.stringify(evt.data) } as any)))

    // Send a non-JSON heartbeat every 20s so client ignores it but connection stays open.
    const heartbeat$ = interval(20000).pipe(map(() => ({ data: ':keepalive' } as any)))

    return merge(heartbeat$, notifications$)
  }
}
