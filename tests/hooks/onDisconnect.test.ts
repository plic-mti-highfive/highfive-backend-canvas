import { describe, it, expect, vi, afterEach } from 'vitest'
import { onDisconnect } from '../../src/hooks/onDisconnect'

afterEach(() => vi.restoreAllMocks())

describe('Hook: onDisconnect', () => {
  it('libère le minuteur d expiration', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const clear = vi.spyOn(global, 'clearTimeout')
    const timeoutId = setTimeout(() => undefined, 10000)
    await onDisconnect({ context: { timeoutId, user: { userId: 'u1' } }, documentName: 'c' } as never)
    expect(clear).toHaveBeenCalledWith(timeoutId)
  })

  it('trace la déconnexion de l utilisateur', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await onDisconnect({ context: { user: { userId: 'u1' } }, documentName: 'canvas-1' } as never)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('u1'))
  })

  it('sans minuteur ni utilisateur : ne fait rien et ne lève pas', async () => {
    const clear = vi.spyOn(global, 'clearTimeout')
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    await expect(onDisconnect({ context: {}, documentName: 'c' } as never)).resolves.toBeUndefined()
    expect(clear).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })
})
