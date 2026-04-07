export const Roles = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  TEAM_LEADER: 'TEAM_LEADER',
  SALESPERSON: 'SALESPERSON',
} as const

export type RoleString = keyof typeof Roles

