import { SetMetadata } from '@nestjs/common'
import type { RoleString } from './role.types'

export const MIN_ROLE_KEY = 'min_role'
export const MinRole = (role: RoleString) => SetMetadata(MIN_ROLE_KEY, role)
