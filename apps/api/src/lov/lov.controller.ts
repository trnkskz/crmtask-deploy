import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { LovService } from './lov.service'
import { ApiTags } from '@nestjs/swagger'
import { MinRole } from '../security/roles.decorator'
import { Roles } from '../security/role.types'

@ApiTags('lov')
@Controller('lov')
export class LovController {
  constructor(private svc: LovService) {}

  @Get()
  @MinRole(Roles.SALESPERSON)
  list(@Query('type') type: string, @Query('code') code?: string) {
    return this.svc.list(type, code)
  }

  @Get('enums')
  @MinRole(Roles.SALESPERSON)
  enums() {
    return this.svc.enums()
  }

  @Get('lookups')
  @MinRole(Roles.SALESPERSON)
  lookups() {
    return this.svc.lookups()
  }

  // Admin Category Management on top of Lookup
  @Get('categories')
  @MinRole(Roles.SALESPERSON)
  listCategories(@Query('mode') mode?: 'TREE'|'MAIN'|'SUB') {
    return this.svc.listCategories(mode || 'TREE')
  }

  @Post('categories')
  @MinRole(Roles.ADMIN)
  createCategory(@Body() body: { name: string; type: 'MAIN'|'SUB'; parentId?: string; order?: number; active?: boolean }) {
    return this.svc.createCategory(body)
  }

  @Patch('categories/:id')
  @MinRole(Roles.ADMIN)
  updateCategory(@Param('id') id: string, @Body() body: Partial<{ name: string; parentId?: string|null; order?: number; active?: boolean }>) {
    return this.svc.updateCategory(id, body)
  }

  @Delete('categories/:id')
  @MinRole(Roles.ADMIN)
  deleteCategory(@Param('id') id: string) {
    return this.svc.deleteCategory(id)
  }
}
