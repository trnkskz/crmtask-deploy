import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from '../security/auth.module';
import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { RequestContextMiddleware } from '../common/middleware/request-context.middleware';
import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { TaskListsModule } from '../tasklists/tasklists.module';
import { TasksModule } from '../tasks/tasks.module';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { LovController } from '../lov/lov.controller';
import { LovService } from '../lov/lov.service';
import { AdminModule } from '../security/admin.module';
import { AuditModule } from '../audit/audit.module';
import { PricingModule } from '../pricing/pricing.module';
import { ProjectsModule } from '../projects/projects.module';
import { RealtimeModule } from '../realtime/realtime.module';

const baseImports: any[] = [
  AuthModule,
  PrismaModule,
  AccountsModule,
  TaskListsModule,
  TasksModule,
  NotificationsModule,
  ReportsModule,
  AdminModule,
  AuditModule,
  PricingModule,
  ProjectsModule,
  RealtimeModule,
];
if (!process.env.DISABLE_JOBS) baseImports.push(JobsModule)

@Module({
  imports: baseImports,
  controllers: [AppController, UsersController, LovController],
  providers: [AppService, UsersService, LovService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
