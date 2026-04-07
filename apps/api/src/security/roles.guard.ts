import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { MIN_ROLE_KEY } from './roles.decorator'
import type { RoleString } from './role.types'

const hierarchy: Record<RoleString, number> = {
  ADMIN: 4,
  MANAGER: 3,
  TEAM_LEADER: 2,
  SALESPERSON: 1,
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleString | undefined>(MIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!required) return true

    const req = context.switchToHttp().getRequest()
    const user = req.user as { id: string; role: RoleString } | undefined
    if (!user) throw new UnauthorizedException('Missing user')

    const allowed = hierarchy[user.role] >= hierarchy[required as RoleString]
    if (!allowed) throw new ForbiddenException('Insufficient role')
    return true
  }
}
