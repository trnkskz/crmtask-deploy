import { Controller, Header, Sse } from '@nestjs/common'
import { RealtimeEventsService } from './realtime.service'
import { interval, map, merge, Observable } from 'rxjs'

@Controller('events')
export class RealtimeEventsController {
  constructor(private realtime: RealtimeEventsService) {}

  @Sse('stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  stream(): Observable<MessageEvent> {
    const events$ = this.realtime
      .getStream()
      .pipe(map((evt) => ({ data: JSON.stringify(evt.data) } as any)))

    const heartbeat$ = interval(20000).pipe(map(() => ({ data: ':keepalive' } as any)))

    return merge(heartbeat$, events$)
  }
}
