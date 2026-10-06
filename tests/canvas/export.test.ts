import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { CANVAS_KEYS, type CanvasChatMessage } from '../../src/contract'
import { extractElements, readCanvasDocument } from '../../src/canvas/export'

const shape = (id: string, type: string, props: Record<string, unknown> = {}) => ({
  id,
  typeName: 'shape',
  type,
  props,
})

describe('extractElements', () => {
  it('remonte le texte des post-its', () => {
    const elements = extractElements([shape('s1', 'note', { text: 'Auth OAuth' })])
    expect(elements).toEqual([{ id: 's1', kind: 'note', text: 'Auth OAuth' }])
  })

  it('ignore les post-its vides, qui n apporteraient rien au prompt', () => {
    expect(extractElements([shape('s1', 'note', { text: '   ' })])).toEqual([])
  })

  it('aplatit le richText ProseMirror en texte brut', () => {
    const richText = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Base' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'de donnees' }] },
      ],
    }
    const elements = extractElements([shape('s1', 'note', { richText })])
    expect(elements[0].text).toBe('Base de donnees')
  })

  it('conserve le type geometrique des formes', () => {
    const elements = extractElements([
      shape('s1', 'geo', { text: 'API', geo: 'ellipse' }),
    ])
    expect(elements[0]).toMatchObject({ kind: 'shape', text: 'API', geo: 'ellipse' })
  })

  it('resout les extremites d une fleche vers le texte des shapes liees', () => {
    const elements = extractElements([
      shape('a', 'note', { text: 'Frontend' }),
      shape('b', 'note', { text: 'API' }),
      shape('arr', 'arrow', {
        start: { type: 'binding', boundShapeId: 'a' },
        end: { type: 'binding', boundShapeId: 'b' },
      }),
    ])
    const arrow = elements.find((e) => e.kind === 'arrow')
    expect(arrow).toMatchObject({ from: 'Frontend', to: 'API' })
  })

  it('ecarte une fleche qui ne relie rien de nomme', () => {
    const elements = extractElements([
      shape('arr', 'arrow', { start: { type: 'point' }, end: { type: 'point' } }),
    ])
    expect(elements).toEqual([])
  })

  it('ignore les records qui ne sont pas des shapes', () => {
    const elements = extractElements([
      { id: 'c1', typeName: 'camera' },
      { id: 'p1', typeName: 'page', name: 'Page 1' },
      shape('s1', 'note', { text: 'Garde-moi' }),
    ])
    expect(elements).toHaveLength(1)
    expect(elements[0].text).toBe('Garde-moi')
  })
})

describe('readCanvasDocument', () => {
  it('compte les traces au stylo sans les lister', () => {
    const doc = new Y.Doc()
    const records = doc.getMap(CANVAS_KEYS.RECORDS)
    records.set('d1', shape('d1', 'draw'))
    records.set('d2', shape('d2', 'draw'))
    records.set('n1', shape('n1', 'note', { text: 'Idee' }))

    const result = readCanvasDocument(doc)
    expect(result.drawingCount).toBe(2)
    expect(result.elements).toHaveLength(1)
    expect(result.elements[0].kind).toBe('note')
  })

  it('remonte le chat persiste dans le document', () => {
    const doc = new Y.Doc()
    const message: CanvasChatMessage = {
      id: 'm1',
      authorId: 'u1',
      body: 'On part sur du JWT',
      sentAt: '2026-10-07T08:00:00.000Z',
      deleted: false,
    }
    doc.getArray<CanvasChatMessage>(CANVAS_KEYS.CHAT).push([message])

    expect(readCanvasDocument(doc).chat).toEqual([message])
  })

  it('lit un ancien message du document (text/timestamp)', () => {
    const doc = new Y.Doc()
    doc.getArray(CANVAS_KEYS.CHAT).push([{ id: 'o1', text: 'vieux', authorId: 'u1', timestamp: 1 }])

    expect(readCanvasDocument(doc).chat).toEqual([
      { id: 'o1', authorId: 'u1', body: 'vieux', sentAt: '1970-01-01T00:00:00.001Z', deleted: false },
    ])
  })

  it('rend un export vide sur un document vierge', () => {
    const result = readCanvasDocument(new Y.Doc())
    expect(result).toEqual({ elements: [], chat: [], drawingCount: 0 })
  })
})
