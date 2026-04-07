import { Injectable } from '@nestjs/common'
import { Observable, Subject } from 'rxjs'

@Injectable()
export class RealtimeEventsService {
  private stream = new Subject<MessageEvent>()

  getStream(): Observable<MessageEvent> {
    return this.stream.asObservable()
  }

  publish(data: any) {
    const event: MessageEvent = { data } as any
    this.stream.next(event)
  }
}
