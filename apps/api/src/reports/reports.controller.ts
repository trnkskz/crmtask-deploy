import { Controller, Get, Header, Query, Res, Req } from '@nestjs/common'
import { Response } from 'express'
import { MinRole } from '../security/roles.decorator'
import { Roles } from '../security/role.types'
import { ReportsService } from './reports.service'
import { ApiTags } from '@nestjs/swagger'
import { RequirePermission } from '../security/permissions.decorator'

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private svc: ReportsService) {}

  @Get('summary')
  @MinRole(Roles.SALESPERSON)
  @RequirePermission('viewReports')
  summary(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.summary(req.user, { from, to })
  }

  @Get('performance')
  @MinRole(Roles.SALESPERSON)
  @RequirePermission('viewReports')
  performance(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.performance(req.user, { from, to })
  }

  @Get('task-status')
  @MinRole(Roles.SALESPERSON)
  @RequirePermission('viewReports')
  taskStatus(@Req() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.taskStatus(req.user, { from, to })
  }

  @Get('tasks.csv')
  @MinRole(Roles.SALESPERSON)
  @RequirePermission('exportReports')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  tasksCsv(@Req() req: any, @Query() q: any, @Res() res: Response) {
    return this.svc.tasksCsv(q, req.user).then(csv => {
      res.setHeader('Content-Disposition', 'attachment; filename="tasks.csv"')
      res.send(csv)
    })
  }

  @Get('accounts.csv')
  @MinRole(Roles.SALESPERSON)
  @RequirePermission('exportReports')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  accountsCsv(@Req() req: any, @Query() q: any, @Res() res: Response) {
    return this.svc.accountsCsv(q, req.user).then(csv => {
      res.setHeader('Content-Disposition', 'attachment; filename="accounts.csv"')
      res.send(csv)
    })
  }
}
