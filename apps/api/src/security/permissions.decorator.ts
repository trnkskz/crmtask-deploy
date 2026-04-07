import { SetMetadata } from '@nestjs/common'

export const PERMISSION_KEY = 'require_permission'
export const RequirePermission = (name: string) => SetMetadata(PERMISSION_KEY, name)

