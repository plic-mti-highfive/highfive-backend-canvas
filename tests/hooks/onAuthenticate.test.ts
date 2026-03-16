import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onAuthenticate } from '../../src/hooks/onAuthenticate'
import * as auth from '../../src/auth/jwt'

vi.useFakeTimers()

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

  it('Role viewer', async () => {
    vi.spyOn(auth, 'verifyCanvasToken').mockReturnValue({
      userId: '1',
      tenantId: 'ecole-1',
      projectId: 'doc-1',
      role: 'viewer',
    })

    const payload: any = {
      token: 'fake-token',
      documentName: 'doc-1',
      connectionConfig: mockConnection,
    }

    const result = await onAuthenticate(payload)

    expect(mockConnection.readOnly).toBe(true)
    expect(result.user.role).toBe('viewer')
  })

  it('TTL expiration', async () => {
    vi.spyOn(auth, 'verifyCanvasToken').mockReturnValue({
      userId: '1',
      tenantId: 'ecole-1',
      projectId: 'doc-1',
      role: 'editor',
    })

    await onAuthenticate({
      token: 'fake-token',
      documentName: 'doc-1',
      connectionConfig: mockConnection,
    } as any)

    vi.advanceTimersByTime(60 * 60 * 1000 + 1000)

    expect(mockConnection.isAuthenticated).toBe(false)
  })
})
