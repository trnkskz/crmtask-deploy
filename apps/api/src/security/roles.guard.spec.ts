import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RolesGuard } from './roles.guard'

describe('RolesGuard', () => {
  function buildContext(user?: { id: string; role: 'ADMIN' | 'MANAGER' | 'TEAM_LEADER' | 'SALESPERSON' }) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => 'handler',
      getClass: () => 'class',
    } as any
  }

  it('allows request when no minimum role metadata is set', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector
    const guard = new RolesGuard(reflector)

    const allowed = guard.canActivate(buildContext({ id: 'u1', role: 'SALESPERSON' }))

    expect(allowed).toBe(true)
  })

  it('denies request when user is below required role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('ADMIN') } as unknown as Reflector
    const guard = new RolesGuard(reflector)

    expect(() => guard.canActivate(buildContext({ id: 'u1', role: 'SALESPERSON' }))).toThrow(ForbiddenException)
  })

  it('allows request when user meets required role', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('MANAGER') } as unknown as Reflector
    const guard = new RolesGuard(reflector)

    const allowed = guard.canActivate(buildContext({ id: 'u1', role: 'ADMIN' }))

    expect(allowed).toBe(true)
  })

  it('throws unauthorized when user is missing', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue('SALESPERSON') } as unknown as Reflector
    const guard = new RolesGuard(reflector)

    expect(() => guard.canActivate(buildContext(undefined))).toThrow(UnauthorizedException)
  })
})
