import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { OverdueCloserService } from './overdue-closer.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { DiscoveryModule } from '@nestjs/core'
import { Reflector } from '@nestjs/core'

@Module({
  imports: [DiscoveryModule, ScheduleModule.forRoot(), NotificationsModule],
  providers: [OverdueCloserService, Reflector],
})
export class JobsModule {}
