import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import * as Y from 'yjs'
import { CANVAS_KEYS, type CanvasChatMessage } from '../../src/contract'
import { onRequest } from '../../src/http/onRequest'

const SECRET = 'secret-interne-de-test'
const CANVAS = 'canvas-abc'

interface FakeResponse {
  status?: number
  body?: unknown
  writeHead: ReturnType<typeof vi.fn>
  end: ReturnType<typeof vi.fn>
}

const run = async (opts: {
  method: string
  url: string
  headers?: Record<string, string>
  body?: unknown
  rawBody?: string
  docs?: Map<string, Y.Doc & { broadcastStateless?: (p: string) => void }>
  failOpen?: boolean
  /** Le document est deja charge en memoire (des clients sont connectes). */
  loaded?: boolean
}) => {
  const request = new EventEmitter() as EventEmitter & {
    method: string
    url: string
    headers: Record<string, string>
    destroy: () => void
  }
  request.method = opts.method
  request.url = opts.url
  request.headers = opts.headers ?? {}
  request.destroy = vi.fn()

  const response: FakeResponse = {
    writeHead: vi.fn((status: number) => {
      response.status = status
    }),
    end: vi.fn((raw: string) => {
      response.body = JSON.parse(raw)
    }),
  }

  const docs = opts.docs ?? new Map()
  const instance = {
    documents: opts.loaded ? docs : new Map(),
    openDirectConnection: vi.fn(async (name: string) => {
      if (opts.failOpen) throw new Error('boom')
      if (!docs.has(name)) docs.set(name, new Y.Doc())
      return {
        transact: async (fn: (d: Y.Doc) => void) => fn(docs.get(name)!),
        disconnect: vi.fn(),
      }
    }),
  }

  const promise = onRequest({ request, response, instance } as never)
  const raw = opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body))
  queueMicrotask(() => {
    if (raw !== undefined) request.emit('data', Buffer.from(raw))
    request.emit('end')
  })
  // Le hook rejette (volontairement, sans erreur) quand il a traite la requete.
  await promise.then(
    () => undefined,
    () => undefined
  )
  return { response, instance, docs, request }
}

const message = {
  id: 'a1',
  authorId: '00000000-0000-4000-8000-0000000000a1',
  body: 'Salut',
  sentAt: '2026-10-07T08:00:00.000Z',
  deleted: false,
  isAssistant: true,
}

describe('GET /health', () => {
  it('repond 200 ok', async () => {
    const { response } = await run({ method: 'GET', url: '/health' })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })
})

describe('POST /canvas/:id/chat', () => {
  const headers = { 'x-internal-secret': SECRET }

  it('refuse sans secret (401) et ne touche pas au document', async () => {
    const { response, instance } = await run({
      method: 'POST',
      url: `/canvas/${CANVAS}/chat`,
      body: message,
    })
    expect(response.status).toBe(401)
    expect(instance.openDirectConnection).not.toHaveBeenCalled()
  })

  it('refuse un mauvais secret (401)', async () => {
    const { response } = await run({
      method: 'POST',
      url: `/canvas/${CANVAS}/chat`,
      headers: { 'x-internal-secret': 'nope' },
      body: message,
    })
    expect(response.status).toBe(401)
  })

  it('refuse un corps invalide (400) : champ manquant, JSON cassé, isAssistant faux', async () => {
    for (const opts of [
      { body: { id: 'x' } },
      { rawBody: '{pas du json' },
      { body: { ...message, isAssistant: false } },
      { body: { ...message, body: 'x'.repeat(4001) } },
    ]) {
      const { response } = await run({
        method: 'POST',
        url: `/canvas/${CANVAS}/chat`,
        headers,
        ...opts,
      })
      expect(response.status).toBe(400)
    }
  })

  it('crée le message (201), le diffuse et le range dans le Y.Doc', async () => {
    const broadcast = vi.fn()
    const doc = new Y.Doc() as Y.Doc & { broadcastStateless: typeof broadcast }
    doc.broadcastStateless = broadcast
    const docs = new Map([[CANVAS, doc]])

    const { response } = await run({
      method: 'POST',
      url: `/canvas/${CANVAS}/chat`,
      headers,
      body: message,
      docs,
    })
    expect(response.status).toBe(201)
    expect(response.body).toEqual({ id: 'a1', created: true })
    expect(doc.getArray<CanvasChatMessage>(CANVAS_KEYS.CHAT).toArray()).toHaveLength(1)
    expect(JSON.parse(broadcast.mock.calls[0][0])).toMatchObject({
      type: 'chat',
      data: { id: 'a1', canvasId: CANVAS, isAssistant: true },
    })
  })

  it('est idempotent : un rejeu renvoie 200 sans doublon ni nouveau broadcast', async () => {
    const broadcast = vi.fn()
    const doc = new Y.Doc() as Y.Doc & { broadcastStateless: typeof broadcast }
    doc.broadcastStateless = broadcast
    const docs = new Map([[CANVAS, doc]])
    const call = () =>
      run({ method: 'POST', url: `/canvas/${CANVAS}/chat`, headers, body: message, docs })

    expect((await call()).response.status).toBe(201)
    const second = await call()
    expect(second.response.status).toBe(200)
    expect(second.response.body).toEqual({ id: 'a1', created: false })
    expect(doc.getArray(CANVAS_KEYS.CHAT).length).toBe(1)
    expect(broadcast).toHaveBeenCalledOnce()
  })

  it('document déjà chargé : écrit dedans sans connexion directe (pas d écriture S3 forcée)', async () => {
    const broadcast = vi.fn()
    const doc = new Y.Doc() as Y.Doc & { broadcastStateless: typeof broadcast }
    doc.broadcastStateless = broadcast
    const docs = new Map([[CANVAS, doc]])
    const { response, instance } = await run({
      method: 'POST',
      url: `/canvas/${CANVAS}/chat`,
      headers,
      body: message,
      docs,
      loaded: true,
    })
    expect(response.status).toBe(201)
    expect(instance.openDirectConnection).not.toHaveBeenCalled()
    expect(doc.getArray(CANVAS_KEYS.CHAT).length).toBe(1)
    expect(broadcast).toHaveBeenCalledOnce()
  })

  it('décode le canvasId de l URL', async () => {
    const { instance } = await run({
      method: 'POST',
      url: '/canvas/mur%20un/chat',
      headers,
      body: message,
    })
    expect(instance.openDirectConnection).toHaveBeenCalledWith('mur un', {})
  })

  it('répond 500 si le document est inaccessible', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { response } = await run({
      method: 'POST',
      url: `/canvas/${CANVAS}/chat`,
      headers,
      body: message,
      failOpen: true,
    })
    expect(response.status).toBe(500)
  })
})

describe('GET /canvas/:id/export', () => {
  it('refuse sans secret (401)', async () => {
    const { response } = await run({ method: 'GET', url: `/canvas/${CANVAS}/export` })
    expect(response.status).toBe(401)
  })

  it('exporte le chat (utilisateur + assistant) avec le secret', async () => {
    const doc = new Y.Doc()
    doc.getArray(CANVAS_KEYS.CHAT).push([
      { id: 'u1', authorId: 'u', body: '@ia bonjour', sentAt: '2026-10-07T07:59:00.000Z', deleted: false },
      message,
    ])
    const { response } = await run({
      method: 'GET',
      url: `/canvas/${CANVAS}/export`,
      headers: { 'x-internal-secret': SECRET },
      docs: new Map([[CANVAS, doc]]),
    })
    expect(response.status).toBe(200)
    const body = response.body as { canvasId: string; chat: CanvasChatMessage[] }
    expect(body.canvasId).toBe(CANVAS)
    expect(body.chat.map((m) => m.id)).toEqual(['u1', 'a1'])
  })

  it('répond 500 si le document est inaccessible', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { response } = await run({
      method: 'GET',
      url: `/canvas/${CANVAS}/export`,
      headers: { 'x-internal-secret': SECRET },
      failOpen: true,
    })
    expect(response.status).toBe(500)
  })
})

describe('autres routes', () => {
  it('laisse Hocuspocus répondre (le hook résout)', async () => {
    const request = new EventEmitter() as never
    await expect(
      onRequest({
        request: Object.assign(request, { method: 'GET', url: '/' }),
        response: {},
        instance: {},
      } as never)
    ).resolves.toBeUndefined()
  })
})
