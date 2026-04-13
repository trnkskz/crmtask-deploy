import { Controller, Header, Headers, Query, Sse } from '@nestjs/common'
import { RealtimeEventsService } from './realtime.service'
import { from, interval, map, merge, Observable } from 'rxjs'

@Controller('events')
export class RealtimeEventsController {
  constructor(private realtime: RealtimeEventsService) {}

  @Sse('stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  stream(@Query('lastEventId') lastEventId?: string, @Headers('last-event-id') lastEventHeader?: string): Observable<MessageEvent> {
    const replayState = this.realtime.getReplayState(lastEventHeader || lastEventId)
    const backlogEvents = replayState.resetRequired
      ? [{ data: JSON.stringify({ type: 'SYNC_REQUIRED', reason: 'EVENT_BUFFER_MISS', ts: Date.now() }) } as any]
      : replayState.events.map((evt) => ({ id: evt.id, data: JSON.stringify(evt.data) } as any))

    const events$ = this.realtime
      .getStream()
      .pipe(map((evt) => ({ id: evt.id, data: JSON.stringify(evt.data) } as any)))

    const heartbeat$ = interval(20000).pipe(map(() => ({ data: ':keepalive' } as any)))

    return merge(from(backlogEvents), heartbeat$, events$)
  }
}
