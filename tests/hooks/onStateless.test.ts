import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as Y from 'yjs'
import { CANVAS_KEYS, type CanvasChatMessage } from '@plic-mti-highfive/shared-types'

vi.mock('../../src/queue', () => ({
  canvasEventsQueue: { add: vi.fn().mockResolvedValue(undefined) },
}))

import { onStateless } from '../../src/hooks/onStateless'
import { canvasEventsQueue } from '../../src/queue'

const mockUser = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  canvasId: 'canvas-abc',
  role: 'editor',
}

// Un vrai Y.Doc plutot qu'un mock : le hook persiste desormais le chat dans le
// document (Y.Array), et on veut le verifier pour de bon.
const makePayload = (payload: string) => {
  const document = new Y.Doc() as Y.Doc & { broadcastStateless: ReturnType<typeof vi.fn> }
  document.broadcastStateless = vi.fn()
  return {
    payload,
    documentName: 'canvas-abc',
    document: document as any,
    connection: { context: { user: mockUser } } as any,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('Hook: onStateless — chat', () => {
  it('enqueue le message et le broadcast à tous les clients', async () => {
    const data = makePayload(JSON.stringify({ type: 'chat', text: 'Hello' }))
    await onStateless(data)

    expect(canvasEventsQueue.add).toHaveBeenCalledOnce()
    const [jobType, jobData] = (canvasEventsQueue.add as any).mock.calls[0]
    expect(jobType).toBe('canvas_chat_message')
    expect(jobData.text).toBe('Hello')
    expect(jobData.authorId).toBe('user-1')
    expect(jobData.canvasId).toBe('canvas-abc')
    expect(data.document.broadcastStateless).toHaveBeenCalledOnce()
  })

  it('le broadcast contient le type "chat" et les données enrichies', async () => {
    const data = makePayload(JSON.stringify({ type: 'chat', text: 'Bonjour' }))
    await onStateless(data)

    const broadcast = data.document.broadcastStateless as any
    const broadcastPayload = JSON.parse(broadcast.mock.calls[0][0])
    expect(broadcastPayload.type).toBe('chat')
    expect(broadcastPayload.data.text).toBe('Bonjour')
    expect(broadcastPayload.data.id).toBeDefined()
    expect(broadcastPayload.data.timestamp).toBeTypeOf('number')
  })

  it('ignore un JSON invalide sans lever d\'erreur', async () => {
    const data = makePayload('not-json{{{')
    await onStateless(data)
    expect(canvasEventsQueue.add).not.toHaveBeenCalled()
  })

  it('ignore un type de message inconnu', async () => {
    const data = makePayload(JSON.stringify({ type: 'ping', text: 'hi' }))
    await onStateless(data)
    expect(canvasEventsQueue.add).not.toHaveBeenCalled()
  })

  it('ignore un message chat avec texte vide ou espaces', async () => {
    const data = makePayload(JSON.stringify({ type: 'chat', text: '   ' }))
    await onStateless(data)
    expect(canvasEventsQueue.add).not.toHaveBeenCalled()
  })

  it('trim le texte avant de l\'enqueue', async () => {
    const data = makePayload(JSON.stringify({ type: 'chat', text: '  Bonjour  ' }))
    await onStateless(data)
    const jobData = (canvasEventsQueue.add as any).mock.calls[0][1]
    expect(jobData.text).toBe('Bonjour')
  })

  it('persiste le message dans le document, pour survivre a la reconnexion et nourrir l export IA', async () => {
    const data = makePayload(JSON.stringify({ type: 'chat', text: 'On part sur du JWT' }))
    await onStateless(data)

    const chat = (data.document as unknown as Y.Doc)
      .getArray<CanvasChatMessage>(CANVAS_KEYS.CHAT)
      .toArray()

    expect(chat).toHaveLength(1)
    expect(chat[0]).toMatchObject({ text: 'On part sur du JWT', authorId: 'user-1' })
  })

  it('ne persiste rien quand le message est ignore', async () => {
    const data = makePayload(JSON.stringify({ type: 'chat', text: '  ' }))
    await onStateless(data)

    const chat = (data.document as unknown as Y.Doc).getArray(CANVAS_KEYS.CHAT).toArray()
    expect(chat).toHaveLength(0)
  })
})
