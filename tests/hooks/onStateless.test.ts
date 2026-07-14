import { describe, it, expect, vi, beforeEach } from 'vitest'

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

const makePayload = (payload: string) => ({
  payload,
  documentName: 'canvas-abc',
  document: { broadcastStateless: vi.fn() } as any,
  connection: { context: { user: mockUser } } as any,
})

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
})
