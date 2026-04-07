import { Module } from '@nestjs/common'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { TaskContactsController } from './task-contacts.controller'

@Module({
  imports: [NotificationsModule],
  controllers: [TasksController, TaskContactsController],
  providers: [TasksService],
})
export class TasksModule {}
