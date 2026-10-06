import { describe, it, expect, vi } from 'vitest'
import * as Y from 'yjs'
import { injectAssistantMessage, normalizeChatMessage, parseAssistantChatInput } from '../../src/canvas/chat'
import { CANVAS_KEYS } from '../../src/contract'

const input = {
  id: 'a1',
  authorId: 'assistant',
  body: 'Bonjour',
  sentAt: '2026-10-07T08:00:00.000Z',
  deleted: false,
  isAssistant: true as const,
}

const makeDoc = () => {
  const doc = new Y.Doc() as Y.Doc & { broadcastStateless: ReturnType<typeof vi.fn> }
  doc.broadcastStateless = vi.fn()
  return doc
}

describe('injectAssistantMessage', () => {
  it('ajoute au chat du Y.Doc et diffuse', () => {
    const doc = makeDoc()
    expect(injectAssistantMessage(doc, 'canvas-1', input)).toBe(true)
    expect(doc.getArray(CANVAS_KEYS.CHAT).toArray()).toEqual([
      { ...input },
    ])
    const payload = JSON.parse(doc.broadcastStateless.mock.calls[0][0])
    expect(payload.type).toBe('chat')
    expect(payload.data).toMatchObject({ id: 'a1', canvasId: 'canvas-1', isAssistant: true })
  })

  it('est idempotent sur id', () => {
    const doc = makeDoc()
    injectAssistantMessage(doc, 'c', input)
    expect(injectAssistantMessage(doc, 'c', input)).toBe(false)
    expect(doc.getArray(CANVAS_KEYS.CHAT).length).toBe(1)
    expect(doc.broadcastStateless).toHaveBeenCalledOnce()
  })
})

describe('parseAssistantChatInput', () => {
  it('refuse un corps invalide', () => {
    expect(() => parseAssistantChatInput({ id: 'x' })).toThrow()
    expect(() => parseAssistantChatInput({ ...input, isAssistant: false })).toThrow()
  })
})

describe('normalizeChatMessage', () => {
  it('garde la forme du contrat telle quelle', () => {
    expect(normalizeChatMessage(input)).toEqual(input)
  })

  it('convertit un ancien message (text/timestamp)', () => {
    expect(
      normalizeChatMessage({ id: 'm', text: 'salut', authorId: 'u', timestamp: 1 })
    ).toEqual({
      id: 'm',
      authorId: 'u',
      body: 'salut',
      sentAt: '1970-01-01T00:00:00.001Z',
      deleted: false,
    })
  })

  it('conserve l indication assistant d un ancien message', () => {
    expect(
      normalizeChatMessage({ id: 'm', text: 't', authorId: 'a', timestamp: 0, isAssistant: true })
    ).toMatchObject({ isAssistant: true })
  })
})
