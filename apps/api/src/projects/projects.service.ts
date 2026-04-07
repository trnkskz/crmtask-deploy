import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { CreateProjectDto, ProjectListQueryDto, UpdateProjectDto } from './dto/project.dto'

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ProjectListQueryDto) {
    const where: any = {}
    if (q.q?.trim()) where.name = { contains: q.q.trim(), mode: 'insensitive' }
    if (q.status) where.status = q.status

    const page = Number(q.page || 1)
    const take = Math.min(Number(q.limit || 20), 100)
    const skip = (page - 1) * take

    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.project.count({ where }),
    ])

    return { items, total, page, limit: take }
  }

  async detail(id: string) {
    const item = await this.prisma.project.findUnique({ where: { id } })
    if (!item) throw new NotFoundException('Project not found')
    return item
  }

  create(body: CreateProjectDto, userId?: string) {
    return this.prisma.project.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        status: (body.status || 'PLANNED') as any,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        createdById: userId || null,
      },
    })
  }

  async update(id: string, body: UpdateProjectDto) {
    await this.detail(id)
    return this.prisma.project.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        status: body.status as any,
        startDate: body.startDate ? new Date(body.startDate) : body.startDate === '' ? null : undefined,
        endDate: body.endDate ? new Date(body.endDate) : body.endDate === '' ? null : undefined,
      },
    })
  }

  async remove(id: string) {
    await this.detail(id)
    await this.prisma.project.delete({ where: { id } })
    return { ok: true }
  }
}
