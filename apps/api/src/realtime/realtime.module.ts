import { Module } from '@nestjs/common'
import { RealtimeEventsController } from './realtime.controller'
import { RealtimeEventsService } from './realtime.service'

@Module({
  controllers: [RealtimeEventsController],
  providers: [RealtimeEventsService],
  exports: [RealtimeEventsService],
})
export class RealtimeModule {}
