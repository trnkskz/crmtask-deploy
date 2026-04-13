import { RealtimeEventsService } from './realtime.service'

describe('RealtimeEventsService', () => {
  it('replays only the events newer than the provided event id', () => {
    const service = new RealtimeEventsService()

    service.publish({ type: 'TASK_UPDATED', taskId: 'task_1' })
    service.publish({ type: 'ACCOUNT_UPDATED', accountId: 'acc_1' })
    service.publish({ type: 'NOTIFICATIONS_CHANGED' })

    const replay = service.getReplayState('1')

    expect(replay.resetRequired).toBe(false)
    expect(replay.events).toEqual([
      { id: '2', data: { type: 'ACCOUNT_UPDATED', accountId: 'acc_1' } },
      { id: '3', data: { type: 'NOTIFICATIONS_CHANGED' } },
    ])
  })

  it('requests a full sync when the requested event id falls outside the buffer window', () => {
    const service = new RealtimeEventsService()

    for (let index = 0; index < 505; index += 1) {
      service.publish({ type: 'TASK_UPDATED', taskId: `task_${index}` })
    }

    const replay = service.getReplayState('1')

    expect(replay.resetRequired).toBe(true)
    expect(replay.events).toEqual([])
  })
})
