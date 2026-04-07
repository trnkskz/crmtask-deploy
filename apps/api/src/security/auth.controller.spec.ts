import { UnauthorizedException } from '@nestjs/common'
jest.mock('otplib', () => ({
  generateSecret: jest.fn(),
  verifySync: jest.fn(),
  generateURI: jest.fn(),
}))
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(),
}))
import { AuthController } from './auth.controller'

describe('AuthController.me', () => {
  it('returns the authenticated jwt user profile', async () => {
    const controller = new AuthController({
      me: jest.fn().mockResolvedValue({ id: 'admin_1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', isActive: true, team: null, phone: null, settings: null }),
    } as any)
    const result = await controller.me({ user: { id: 'admin_1', role: 'ADMIN' }, authMode: 'jwt' } as any)
    expect(result).toEqual({ user: { id: 'admin_1', name: 'Admin', email: 'admin@example.com', role: 'ADMIN', isActive: true, team: null, phone: null, settings: null } })
  })

  it('rejects dev fallback users for session validation', async () => {
    const controller = new AuthController({} as any)
    await expect(controller.me({ user: { id: 'dev-user', role: 'ADMIN' }, authMode: 'dev' } as any)).rejects.toThrow(UnauthorizedException)
  })

  it('rejects requests with no authenticated user', async () => {
    const controller = new AuthController({} as any)
    await expect(controller.me({} as any)).rejects.toThrow(UnauthorizedException)
  })
})
