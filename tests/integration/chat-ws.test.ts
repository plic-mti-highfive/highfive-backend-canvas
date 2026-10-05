import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { Server } from '@hocuspocus/server'
import { HocuspocusProvider } from '@hocuspocus/provider'
import WebSocket from 'ws'
import jwt from 'jsonwebtoken'
import * as Y from 'yjs'

// Seule la file Redis est remplacée : serveur Hocuspocus, hooks, WebSocket et
// HTTP interne sont les vrais.
vi.mock('../../src/queue', () => ({
  canvasEventsQueue: { add: vi.fn().mockResolvedValue(undefined) },
}))

import { canvasEventsQueue } from '../../src/queue'
import * as hooks from '../../src/hooks'
import { onRequest } from '../../src/http/onRequest'
import { CANVAS_KEYS, type CanvasChatMessage } from '../../src/contract'

const PORT = 18000 + Math.floor(Math.random() * 1000)
const CANVAS = 'canvas-ws'
const SECRET = 'secret-de-test'
const INTERNAL = 'secret-interne-de-test'

let server: Server
const keep: HocuspocusProvider[] = []

const token = (role: 'editor' | 'viewer' = 'editor', canvasId = CANVAS) =>
  jwt.sign({ userId: `user-${role}`, projectId: 'p1', canvasId, role }, SECRET)

interface Client {
  provider: HocuspocusProvider
  chats: Array<{ type: string; data: CanvasChatMessage & { canvasId?: string } }>
}

const connect = async (tok: string, name = CANVAS): Promise<Client> => {
  const chats: Client['chats'] = []
  const provider = await new Promise<HocuspocusProvider>((resolve, reject) => {
    const p = new HocuspocusProvider({
      url: `ws://127.0.0.1:${PORT}`,
      name,
      token: tok,
      document: new Y.Doc(),
      WebSocketPolyfill: WebSocket as never,
      onSynced: () => resolve(p),
      onAuthenticationFailed: () => reject(new Error('auth failed')),
      onStateless: ({ payload }) => chats.push(JSON.parse(payload)),
    })
    setTimeout(() => reject(new Error('timeout connexion')), 5000)
  })
  return { provider, chats }
}

const waitFor = async (cond: () => boolean, ms = 3000) => {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout')
    await new Promise((r) => setTimeout(r, 20))
  }
}

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  server = new Server({
    port: PORT,
    quiet: true,
    onAuthenticate: hooks.onAuthenticate,
    onDisconnect: hooks.onDisconnect,
    onStateless: hooks.onStateless,
    onRequest,
  })
  await server.listen()
})

afterAll(async () => {
  keep.forEach((p) => p.destroy())
  await server.destroy()
})

describe('canvas — chat par WebSocket (serveur réel, file mockée)', () => {
  it('refuse un jeton signé pour un autre Mur', async () => {
    await expect(connect(token('editor', 'autre-mur'))).rejects.toThrow('auth failed')
  })

  it('un message stateless est publié sur la file, diffusé à tous et gardé dans le document', async () => {
    const a = await connect(token())
    const b = await connect(token('viewer'))

    a.provider.sendStateless(JSON.stringify({ type: 'chat', text: '@ia résume' }))
    await waitFor(() => a.chats.length > 0 && b.chats.length > 0)

    expect(b.chats[0].data).toMatchObject({ text: '@ia résume', authorId: 'user-editor' })
    expect(canvasEventsQueue.add).toHaveBeenCalledWith(
      'canvas_chat_message',
      expect.objectContaining({ text: '@ia résume', canvasId: CANVAS, authorId: 'user-editor' })
    )
    // On garde `a` connecte : sans stockage (S3), le document disparait avec le dernier client.
    keep.push(a.provider)
    b.provider.destroy()
  })

  it('la réponse de l assistant POSTée par le core arrive aux clients et dans l export', async () => {
    const a = await connect(token())
    const reply = {
      id: 'reply-1',
      text: 'Voici le résumé',
      authorId: '00000000-0000-4000-8000-0000000000a1',
      timestamp: Date.now(),
      isAssistant: true,
    }
    const post = () =>
      fetch(`http://127.0.0.1:${PORT}/canvas/${CANVAS}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL },
        body: JSON.stringify(reply),
      })

    expect((await post()).status).toBe(201)
    await waitFor(() => a.chats.some((c) => c.data.id === 'reply-1'))
    expect(a.chats.find((c) => c.data.id === 'reply-1')?.data.isAssistant).toBe(true)
    expect((await post()).status).toBe(200) // rejeu : pas de doublon

    const exported = await fetch(`http://127.0.0.1:${PORT}/canvas/${CANVAS}/export`, {
      headers: { 'x-internal-secret': INTERNAL },
    })
    const body = (await exported.json()) as { chat: CanvasChatMessage[] }
    expect(body.chat.filter((m) => m.id === 'reply-1')).toHaveLength(1)
    expect(body.chat.some((m) => m.text === '@ia résume')).toBe(true)
    expect(a.provider.document.getArray(CANVAS_KEYS.CHAT).length).toBeGreaterThanOrEqual(2)
    a.provider.destroy()
  })
})
