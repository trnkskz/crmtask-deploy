import { Module } from '@nestjs/common'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'
import { ReportCacheService } from './report-cache.service'

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportCacheService],
})
export class ReportsModule {}
