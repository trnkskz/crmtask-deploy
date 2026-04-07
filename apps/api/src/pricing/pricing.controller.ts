import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { MinRole } from '../security/roles.decorator'
import { Roles } from '../security/role.types'
import {
  CreatePricingDto,
  PricingListQueryDto,
  UpdatePricingDto,
  UpdatePricingRulesDto,
} from './dto/pricing.dto'
import { PricingService } from './pricing.service'

@ApiTags('pricing')
@Controller('pricing')
@MinRole(Roles.SALESPERSON)
export class PricingController {
  constructor(private readonly svc: PricingService) {}

  @Get()
  list(@Query() q: PricingListQueryDto) {
    return this.svc.list(q)
  }

  @Get('rules')
  rules() {
    return this.svc.getRules()
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.svc.detail(id)
  }

  @Post()
  @MinRole(Roles.MANAGER)
  create(@Body() body: CreatePricingDto) {
    return this.svc.create(body)
  }

  @Patch(':id')
  @MinRole(Roles.MANAGER)
  update(@Param('id') id: string, @Body() body: UpdatePricingDto) {
    return this.svc.update(id, body)
  }

  @Post('rules')
  @MinRole(Roles.MANAGER)
  saveRules(@Body() body: UpdatePricingRulesDto) {
    return this.svc.saveRules(body)
  }

  @Delete(':id')
  @MinRole(Roles.MANAGER)
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }
}
