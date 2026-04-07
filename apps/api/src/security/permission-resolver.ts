export const CAPABILITY_KEYS = [
  'export',
  'createBiz',
  'deleteArchive',
  'viewAllTasks',
  'assignTasks',
  'reassignTask',
  'bulkAssign',
  'closeDeal',
  'viewReports',
  'exportReports',
  'manageProjects',
  'createManualProject',
  'importCsv',
  'manageUsers',
  'manageRoles',
  'manageSettings',
  'viewAuditLogs',
] as const

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]

type ApiRole = 'ADMIN' | 'MANAGER' | 'TEAM_LEADER' | 'SALESPERSON'

const LEGACY_PERMISSION_ALIASES: Record<string, CapabilityKey[]> = {
  'rbac:manage': ['manageUsers', 'manageRoles', 'manageSettings', 'viewAuditLogs'],
  'reports.read': ['viewReports', 'exportReports'],
}

export function getDefaultPermissionsForApiRole(role?: string | null): Record<CapabilityKey, boolean> {
  const normalizedRole = String(role || '').toUpperCase() as ApiRole | ''
  const defaults: Record<CapabilityKey, boolean> = {
    export: false,
    createBiz: normalizedRole !== 'SALESPERSON',
    deleteArchive: false,
    viewAllTasks: normalizedRole !== 'SALESPERSON',
    assignTasks: normalizedRole !== 'SALESPERSON',
    reassignTask: normalizedRole === 'MANAGER' || normalizedRole === 'TEAM_LEADER' || normalizedRole === 'ADMIN',
    bulkAssign: normalizedRole === 'MANAGER' || normalizedRole === 'TEAM_LEADER' || normalizedRole === 'ADMIN',
    closeDeal: normalizedRole === 'MANAGER' || normalizedRole === 'TEAM_LEADER' || normalizedRole === 'ADMIN',
    viewReports: normalizedRole === 'MANAGER' || normalizedRole === 'TEAM_LEADER' || normalizedRole === 'ADMIN',
    exportReports: normalizedRole === 'MANAGER' || normalizedRole === 'TEAM_LEADER' || normalizedRole === 'ADMIN',
    manageProjects: normalizedRole === 'MANAGER' || normalizedRole === 'TEAM_LEADER' || normalizedRole === 'ADMIN',
    createManualProject: normalizedRole === 'MANAGER' || normalizedRole === 'TEAM_LEADER' || normalizedRole === 'ADMIN',
    importCsv: normalizedRole === 'MANAGER' || normalizedRole === 'TEAM_LEADER' || normalizedRole === 'ADMIN',
    manageUsers: normalizedRole === 'MANAGER' || normalizedRole === 'ADMIN',
    manageRoles: normalizedRole === 'MANAGER' || normalizedRole === 'ADMIN',
    manageSettings: normalizedRole === 'MANAGER' || normalizedRole === 'ADMIN',
    viewAuditLogs: normalizedRole === 'MANAGER' || normalizedRole === 'TEAM_LEADER' || normalizedRole === 'ADMIN',
  }

  if (normalizedRole === 'ADMIN' || normalizedRole === 'MANAGER') {
    CAPABILITY_KEYS.forEach((key) => {
      defaults[key] = true
    })
  }

  return defaults
}

export function resolveEffectivePermissions(input: {
  role?: string | null
  userSettingsPermissions?: Record<string, unknown> | null
  rolePermissionNames?: string[] | null
}) {
  const defaults = getDefaultPermissionsForApiRole(input.role)
  const granted = new Set<string>()

  CAPABILITY_KEYS.forEach((key) => {
    if (defaults[key]) granted.add(key)
  })

  for (const permissionName of input.rolePermissionNames || []) {
    if (!permissionName) continue
    granted.add(permissionName)
    for (const alias of LEGACY_PERMISSION_ALIASES[permissionName] || []) {
      granted.add(alias)
    }
  }

  for (const key of Object.keys(input.userSettingsPermissions || {})) {
    const rawValue = input.userSettingsPermissions?.[key]
    if (rawValue === true) {
      granted.add(key)
      continue
    }
    if (rawValue === false) granted.delete(key)
  }

  return granted
}

export function hasResolvedPermission(
  requiredPermission: string | undefined,
  grantedPermissions: Set<string>,
) {
  if (!requiredPermission) return true
  return grantedPermissions.has(requiredPermission)
}
