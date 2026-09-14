import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onAuthenticate } from '../../src/hooks/onAuthenticate'
import * as auth from '../../src/auth/jwt'

vi.useFakeTimers()

const mockPayload = {
  userId: '1',
  projectId: 'project-1',
  canvasId: 'canvas-1',
  role: 'editor' as const,
}

describe('Hook: onAuthenticate', () => {
  let mockConnection: any

  beforeEach(() => {
    mockConnection = {
      readOnly: false,
      isAuthenticated: true,
      close: vi.fn(),
    }
    vi.restoreAllMocks()
  })

  it('viewer → connexion en lecture seule', async () => {
    vi.spyOn(auth, 'verifyCanvasToken').mockReturnValue({ ...mockPayload, role: 'viewer' })

    const result = await onAuthenticate({
      token: 'fake-token',
      documentName: 'canvas-1',
      connectionConfig: mockConnection,
    } as any)

    expect(mockConnection.readOnly).toBe(true)
    expect(result.user.role).toBe('viewer')
  })

  it('editor → connexion en lecture-écriture', async () => {
    vi.spyOn(auth, 'verifyCanvasToken').mockReturnValue(mockPayload)

    const result = await onAuthenticate({
      token: 'fake-token',
      documentName: 'canvas-1',
      connectionConfig: mockConnection,
    } as any)

    expect(mockConnection.readOnly).toBe(false)
    expect(result.user.role).toBe('editor')
  })

  it('token manquant → lève une erreur', async () => {
    await expect(
      onAuthenticate({ token: '', documentName: 'canvas-1', connectionConfig: mockConnection } as any)
    ).rejects.toThrow('Token manquant')
  })

  it('TTL expiré → connexion désauthentifiée', async () => {
    vi.spyOn(auth, 'verifyCanvasToken').mockReturnValue(mockPayload)

    await onAuthenticate({
      token: 'fake-token',
      documentName: 'canvas-1',
      connectionConfig: mockConnection,
    } as any)

    vi.advanceTimersByTime(60 * 60 * 1000 + 1000)

    expect(mockConnection.isAuthenticated).toBe(false)
  })
})
