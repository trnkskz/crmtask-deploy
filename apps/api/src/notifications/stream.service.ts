import { Injectable } from '@nestjs/common'
import { Observable, Subject } from 'rxjs'

@Injectable()
export class NotificationStreamService {
  private streams = new Map<string, Subject<MessageEvent>>()

  getStream(userId: string): Observable<MessageEvent> {
    if (!this.streams.has(userId)) this.streams.set(userId, new Subject<MessageEvent>())
    return this.streams.get(userId)!.asObservable()
  }

  publish(userId: string, data: any) {
    if (!this.streams.has(userId)) this.streams.set(userId, new Subject<MessageEvent>())
    const event: MessageEvent = { data } as any
    this.streams.get(userId)!.next(event)
  }
}

