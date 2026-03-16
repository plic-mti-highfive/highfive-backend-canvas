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
    role: 'editor',
  }

  const validToken = jwt.sign(validPayload, 'secret-de-test')

  it('Valid token and paylod', () => {
    const result = verifyCanvasToken(validToken, 'projet-456')

    expect(result.userId).toBe('user-123')
    expect(result.role).toBe('editor')
  })

  it('Invalid project ID', () => {
    expect(() => verifyCanvasToken(validToken, 'projet-hacker')).toThrow(
      'Token does not match the expected project.'
    )
  })

  it('Invalid token', () => {
    const fakeToken = jwt.sign(validPayload, 'mauvais-secret')

    expect(() => verifyCanvasToken(fakeToken, 'projet-456')).toThrow('Authentication failed')
  })
})
