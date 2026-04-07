import { Module } from '@nestjs/common'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { NotificationStreamService } from './stream.service'
import { NotificationsSseController } from './notifications.sse.controller'

@Module({
  controllers: [NotificationsController, NotificationsSseController],
  providers: [NotificationsService, NotificationStreamService],
  exports: [NotificationsService, NotificationStreamService],
})
export class NotificationsModule {}
