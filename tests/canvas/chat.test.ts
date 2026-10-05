import { describe, it, expect, vi } from 'vitest'
import * as Y from 'yjs'
import { injectAssistantMessage, parseAssistantChatInput } from '../../src/canvas/chat'
import { CANVAS_KEYS } from '../../src/contract'

const input = {
  id: 'a1',
  text: 'Bonjour',
  authorId: 'assistant',
  timestamp: 1,
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
      { id: 'a1', text: 'Bonjour', authorId: 'assistant', timestamp: 1, isAssistant: true },
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
