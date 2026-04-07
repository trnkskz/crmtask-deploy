import { getDefaultPermissionsForApiRole, hasResolvedPermission, resolveEffectivePermissions } from './permission-resolver'

describe('permission resolver', () => {
  it('grants manager defaults without requiring stored overrides', () => {
    const permissions = resolveEffectivePermissions({ role: 'MANAGER' })

    expect(hasResolvedPermission('manageProjects', permissions)).toBe(true)
    expect(hasResolvedPermission('viewReports', permissions)).toBe(true)
    expect(hasResolvedPermission('manageUsers', permissions)).toBe(true)
  })

  it('lets explicit user settings deny a default capability', () => {
    const permissions = resolveEffectivePermissions({
      role: 'MANAGER',
      userSettingsPermissions: { viewReports: false },
    })

    expect(hasResolvedPermission('viewReports', permissions)).toBe(false)
  })

  it('maps legacy app-role permissions to the new capability names', () => {
    const permissions = resolveEffectivePermissions({
      role: 'SALESPERSON',
      rolePermissionNames: ['rbac:manage', 'reports.read'],
    })

    expect(hasResolvedPermission('manageSettings', permissions)).toBe(true)
    expect(hasResolvedPermission('manageRoles', permissions)).toBe(true)
    expect(hasResolvedPermission('exportReports', permissions)).toBe(true)
  })

  it('keeps team leader defaults narrower than manager defaults', () => {
    const defaults = getDefaultPermissionsForApiRole('TEAM_LEADER')

    expect(defaults.manageUsers).toBe(false)
    expect(defaults.manageProjects).toBe(true)
    expect(defaults.createBiz).toBe(true)
  })
})
