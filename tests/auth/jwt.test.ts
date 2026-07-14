import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { verifyCanvasToken } from '../../src/auth/jwt'

vi.mock('../../src/env', () => ({
  env: { JWT_SECRET: 'secret-de-test' },
}))

describe('Auth: verifyCanvasToken', () => {
  const validPayload = {
    userId: 'user-123',
    tenantId: 'ecole-a',
    projectId: 'projet-456',
    canvasId: 'canvas-789',
    role: 'editor' as const,
  }

  const validToken = jwt.sign(validPayload, 'secret-de-test')

  it('token valide retourne le payload complet', () => {
    const result = verifyCanvasToken(validToken, 'canvas-789')
    expect(result.userId).toBe('user-123')
    expect(result.canvasId).toBe('canvas-789')
    expect(result.projectId).toBe('projet-456')
    expect(result.role).toBe('editor')
  })

  it('rejette si le canvasId ne correspond pas au document', () => {
    expect(() => verifyCanvasToken(validToken, 'canvas-hacker')).toThrow(
      'Token does not match the expected canvas.'
    )
  })

  it('rejette un token signé avec un mauvais secret', () => {
    const fakeToken = jwt.sign(validPayload, 'mauvais-secret')
    expect(() => verifyCanvasToken(fakeToken, 'canvas-789')).toThrow('Authentication failed')
  })

  it('rejette un token expiré', () => {
    const expiredToken = jwt.sign(validPayload, 'secret-de-test', { expiresIn: -1 })
    expect(() => verifyCanvasToken(expiredToken, 'canvas-789')).toThrow('Authentication failed')
  })

  it('accepte le rôle viewer', () => {
    const token = jwt.sign({ ...validPayload, role: 'viewer' }, 'secret-de-test')
    const result = verifyCanvasToken(token, 'canvas-789')
    expect(result.role).toBe('viewer')
  })
})
