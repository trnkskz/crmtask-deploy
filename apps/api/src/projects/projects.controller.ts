import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { MinRole } from '../security/roles.decorator'
import { Roles } from '../security/role.types'
import { CreateProjectDto, ProjectCreationModeDto, ProjectListQueryDto, UpdateProjectDto } from './dto/project.dto'
import { ProjectsService } from './projects.service'
import { RequirePermission } from '../security/permissions.decorator'
import { PrismaService } from '../infrastructure/prisma/prisma.service'
import { hasResolvedPermission, resolveEffectivePermissions } from '../security/permission-resolver'

@ApiTags('projects')
@Controller('projects')
@MinRole(Roles.TEAM_LEADER)
@RequirePermission('manageProjects')
export class ProjectsController {
  constructor(
    private readonly svc: ProjectsService,
    private readonly prisma: PrismaService,
  ) {}

  private async assertManualProjectPermission(reqUser: { id?: string; role?: string } | undefined) {
    if (!reqUser?.id || reqUser.role === Roles.ADMIN) return

    const user = await this.prisma.user.findUnique({
      where: { id: reqUser.id },
      select: {
        role: true,
        settings: true,
        appRole: { include: { permissions: { include: { permission: true } } } },
      },
    })

    const granted = resolveEffectivePermissions({
      role: user?.role || reqUser.role,
      userSettingsPermissions: (user?.settings as any)?.permissions || {},
      rolePermissionNames: (user?.appRole?.permissions || []).map((rp: any) => rp.permission.name),
    })

    if (!hasResolvedPermission('createManualProject', granted)) {
      throw new ForbiddenException('Missing permission')
    }
  }

  @Get()
  list(@Query() q: ProjectListQueryDto) {
    return this.svc.list(q)
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.svc.detail(id)
  }

  @Post()
  create(@Req() req: any, @Body() body: CreateProjectDto) {
    if (body.mode === ProjectCreationModeDto.MANUAL) {
      return this.assertManualProjectPermission(req.user).then(() => this.svc.create(body, req.user?.id))
    }
    return this.svc.create(body, req.user?.id)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateProjectDto) {
    return this.svc.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }
}
