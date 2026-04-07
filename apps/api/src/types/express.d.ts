import type { RoleString } from '../security/role.types'

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string; role: RoleString }
    }
  }
}

export {}
