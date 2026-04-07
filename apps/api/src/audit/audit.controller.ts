import { Controller, Get, Query } from '@nestjs/common'
import { AuditService } from './audit.service'
import { ApiTags } from '@nestjs/swagger'
import { MinRole } from '../security/roles.decorator'
import { Roles } from '../security/role.types'

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private svc: AuditService) {}

  @Get()
  @MinRole(Roles.ADMIN)
  list(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string, @Query('userId') userId?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.svc.list({ entityType, entityId, userId, from, to, page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined })
  }
}

