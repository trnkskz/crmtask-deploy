import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { MinRole } from '../security/roles.decorator'
import { Roles } from '../security/role.types'

@Controller('tasks/:taskId/contacts')
export class TaskContactsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @MinRole(Roles.SALESPERSON)
  list(@Param('taskId') taskId: string) { return this.prisma.taskContact.findMany({ where: { taskId }, include: { contact: true }, orderBy: { isPrimary: 'desc' } }) }

  @Post()
  @MinRole(Roles.TEAM_LEADER)
  async add(@Param('taskId') taskId: string, @Body() body: { contactId: string; isPrimary?: boolean }) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } })
    if (!task) throw new Error('Task not found')
    if (body.isPrimary) await this.prisma.taskContact.updateMany({ where: { taskId }, data: { isPrimary: false } })
    return this.prisma.taskContact.create({ data: { taskId, contactId: body.contactId, isPrimary: !!body.isPrimary } })
  }

  @Patch(':id')
  @MinRole(Roles.TEAM_LEADER)
  async update(@Param('taskId') taskId: string, @Param('id') id: string, @Body() body: { isPrimary?: boolean }) {
    const tc = await this.prisma.taskContact.findUnique({ where: { id } })
    if (!tc || tc.taskId !== taskId) throw new Error('Contact not found for task')
    if (body.isPrimary) await this.prisma.taskContact.updateMany({ where: { taskId }, data: { isPrimary: false } })
    return this.prisma.taskContact.update({ where: { id }, data: { ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}) } })
  }

  @Delete(':id')
  @MinRole(Roles.TEAM_LEADER)
  async remove(@Param('taskId') taskId: string, @Param('id') id: string) {
    const tc = await this.prisma.taskContact.findUnique({ where: { id } })
    if (!tc || tc.taskId !== taskId) throw new Error('Contact not found for task')
    await this.prisma.taskContact.delete({ where: { id } })
    return { ok: true }
  }
}

