import { Injectable } from '@nestjs/common'
import { Observable, Subject } from 'rxjs'

type RealtimeStreamEvent = {
  id: string
  data: any
}

@Injectable()
export class RealtimeEventsService {
  private stream = new Subject<RealtimeStreamEvent>()
  private readonly recentEvents: RealtimeStreamEvent[] = []
  private nextEventId = 0
  private readonly maxRecentEvents = 500

  getStream(): Observable<RealtimeStreamEvent> {
    return this.stream.asObservable()
  }

  getReplayState(lastEventId?: string | number | null) {
    const numericId = Number(lastEventId)
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return { resetRequired: false, events: [] as RealtimeStreamEvent[] }
    }

    if (!this.recentEvents.length) {
      return { resetRequired: false, events: [] as RealtimeStreamEvent[] }
    }

    const oldestBufferedId = Number(this.recentEvents[0]?.id || 0)
    if (numericId < (oldestBufferedId - 1)) {
      return { resetRequired: true, events: [] as RealtimeStreamEvent[] }
    }

    return {
      resetRequired: false,
      events: this.recentEvents.filter((event) => Number(event.id) > numericId),
    }
  }

  publish(data: any) {
    const event: RealtimeStreamEvent = {
      id: String(++this.nextEventId),
      data,
    }
    this.recentEvents.push(event)
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.splice(0, this.recentEvents.length - this.maxRecentEvents)
    }
    this.stream.next(event)
  }
}
