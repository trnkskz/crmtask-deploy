import { Controller, Get } from '@nestjs/common';
import { MinRole } from '../security/roles.decorator';
import { Roles } from '../security/role.types';
import { AppService } from './app.service';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

@ApiTags('root')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService, private prisma: PrismaService) {}

  @Get('health')
  health() {
    return { ok: true, service: 'api', time: new Date().toISOString() };
  }

  @Get('admin/ping')
  @MinRole(Roles.ADMIN)
  adminPing() {
    return { ok: true, scope: 'admin' };
  }

  @Get('debug/db')
  @MinRole(Roles.ADMIN)
  async debugDb() {
    const [leads, accounts, tasksOpen, tasksClosed] = await this.prisma.$transaction([
      this.prisma.lead.count(),
      this.prisma.account.count(),
      this.prisma.task.count({ where: { generalStatus: 'OPEN' } }),
      this.prisma.task.count({ where: { generalStatus: 'CLOSED' } }),
    ])
    const db = process.env.DATABASE_URL || ''
    return { db, counts: { leads, accounts, tasksOpen, tasksClosed } }
  }
}
