import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { Server } from '@hocuspocus/server'
import { HocuspocusProvider } from '@hocuspocus/provider'
import WebSocket from 'ws'
import jwt from 'jsonwebtoken'
import * as Y from 'yjs'

vi.mock('../../src/queue', () => ({
  canvasEventsQueue: { add: vi.fn().mockResolvedValue(undefined) },
}))

import { canvasEventsQueue } from '../../src/queue'
import * as hooks from '../../src/hooks'
import { onRequest } from '../../src/http/onRequest'
import { CANVAS_KEYS } from '../../src/contract'

const PORT = 19000 + Math.floor(Math.random() * 1000)
const CANVAS = 'canvas-secu'
const SECRET = 'secret-de-test'
const INTERNAL = 'secret-interne-de-test'

let server: Server
const providers: HocuspocusProvider[] = []

const sign = (
  role: 'editor' | 'viewer' = 'editor',
  opts: { canvasId?: string; secret?: string; expiresIn?: number } = {}
) =>
  jwt.sign({ userId: `u-${role}`, projectId: 'p', canvasId: opts.canvasId ?? CANVAS, role }, opts.secret ?? SECRET, {
    expiresIn: opts.expiresIn ?? 3600,
  })

type Outcome = { provider: HocuspocusProvider; status: 'synced' | 'refused' }

/** Se connecte ; "refused" = echec d'authentification ou jamais synchronise. */
const connect = (token: string | undefined, name = CANVAS): Promise<Outcome> =>
  new Promise((resolve) => {
    const provider = new HocuspocusProvider({
      url: `ws://127.0.0.1:${PORT}`,
      name,
      token: token as string,
      document: new Y.Doc(),
      WebSocketPolyfill: WebSocket as never,
      onSynced: () => resolve({ provider, status: 'synced' }),
      onAuthenticationFailed: () => resolve({ provider, status: 'refused' }),
    })
    providers.push(provider)
    setTimeout(() => resolve({ provider, status: 'refused' }), 1500)
  })

const waitFor = async (cond: () => boolean, ms = 2000) => {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) return false
    await new Promise((r) => setTimeout(r, 20))
  }
  return true
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const base = () => `http://127.0.0.1:${PORT}`

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
  providers.forEach((p) => p.destroy())
  await server.destroy()
})

describe('sécurité — authentification WebSocket', () => {
  it('jeton valide : accepté', async () => {
    expect((await connect(sign())).status).toBe('synced')
  })
  it('jeton absent : refusé', async () => {
    expect((await connect(undefined)).status).toBe('refused')
  })
  it('jeton vide : refusé', async () => {
    expect((await connect('')).status).toBe('refused')
  })
  it('jeton expiré : refusé', async () => {
    expect((await connect(sign('editor', { expiresIn: -10 }))).status).toBe('refused')
  })
  it('jeton signé avec un mauvais secret : refusé', async () => {
    expect((await connect(sign('editor', { secret: 'pirate' }))).status).toBe('refused')
  })
  it('jeton valide pour un autre document : refusé', async () => {
    expect((await connect(sign('editor', { canvasId: 'autre' }))).status).toBe('refused')
  })
  it('jeton non JWT : refusé', async () => {
    expect((await connect('pas-un-jwt')).status).toBe('refused')
  })
})

describe('sécurité — lecture seule du viewer', () => {
  it('une écriture Yjs d un viewer n est pas appliquée au document serveur', async () => {
    const editor = await connect(sign('editor'))
    const viewer = await connect(sign('viewer'))
    expect(viewer.status).toBe('synced')

    viewer.provider.document.getMap(CANVAS_KEYS.RECORDS).set('shape:pirate', { id: 'shape:pirate' })
    editor.provider.document.getMap(CANVAS_KEYS.RECORDS).set('shape:ok', { id: 'shape:ok' })

    // L'écriture de l'éditeur arrive : on laisse alors le temps à celle du viewer de (ne pas) passer.
    const serverDoc = server.hocuspocus.documents.get(CANVAS)!
    expect(await waitFor(() => serverDoc.getMap(CANVAS_KEYS.RECORDS).has('shape:ok'))).toBe(true)
    await pause(200)
    expect(serverDoc.getMap(CANVAS_KEYS.RECORDS).has('shape:pirate')).toBe(false)
  })

  // BUG: la lecture seule de Hocuspocus ne couvre que les mises à jour Yjs ; les
  // messages stateless ne sont pas filtrés et onStateless ne contrôle pas le rôle.
  // Un viewer peut donc écrire dans le chat du Mur (et déclencher l'assistant IA).
  it.fails('un viewer ne peut pas poster dans le chat du Mur (stateless)', async () => {
    vi.mocked(canvasEventsQueue.add).mockClear()
    const viewer = await connect(sign('viewer'))
    viewer.provider.sendStateless(JSON.stringify({ type: 'chat', text: 'message de viewer' }))
    await pause(300)
    expect(canvasEventsQueue.add).not.toHaveBeenCalled()
  })

  it('un éditeur peut poster dans le chat du Mur (stateless)', async () => {
    vi.mocked(canvasEventsQueue.add).mockClear()
    const editor = await connect(sign('editor'))
    editor.provider.sendStateless(JSON.stringify({ type: 'chat', text: 'message d éditeur' }))
    expect(await waitFor(() => vi.mocked(canvasEventsQueue.add).mock.calls.length > 0)).toBe(true)
  })
})

describe('sécurité — HTTP interne protégé par INTERNAL_SECRET', () => {
  const chatBody = JSON.stringify({
    id: 'sec-1',
    authorId: 'a',
    body: 'x',
    sentAt: new Date().toISOString(),
    deleted: false,
    isAssistant: true,
  })

  it.each([
    ['sans en-tête', undefined],
    ['avec un mauvais secret', 'devine'],
    ['avec un secret vide', ''],
    ['avec le secret d un jeton JWT', SECRET],
  ])('export %s : 401', async (_label, secret) => {
    const headers: Record<string, string> = secret === undefined ? {} : { 'x-internal-secret': secret }
    const res = await fetch(`${base()}/canvas/${CANVAS}/export`, { headers })
    expect(res.status).toBe(401)
  })

  it.each([
    ['sans en-tête', undefined],
    ['avec un mauvais secret', 'devine'],
  ])('chat %s : 401 et rien n est écrit', async (_label, secret) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (secret !== undefined) headers['x-internal-secret'] = secret
    const res = await fetch(`${base()}/canvas/${CANVAS}/chat`, { method: 'POST', headers, body: chatBody })
    expect(res.status).toBe(401)
    const doc = server.hocuspocus.documents.get(CANVAS)
    expect(doc?.getArray(CANVAS_KEYS.CHAT).toArray().some((m) => (m as { id: string }).id === 'sec-1') ?? false).toBe(false)
  })

  it('export avec le bon secret : 200', async () => {
    const res = await fetch(`${base()}/canvas/${CANVAS}/export`, { headers: { 'x-internal-secret': INTERNAL } })
    expect(res.status).toBe(200)
  })

  it('/health est public', async () => {
    expect((await fetch(`${base()}/health`)).status).toBe(200)
  })
})
