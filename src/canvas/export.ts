import type * as Y from 'yjs'
import {
  CANVAS_KEYS,
  type CanvasChatMessage,
  type CanvasElement,
} from '@plic-mti-highfive/shared-types'

/**
 * Traduction des records tldraw en elements semantiques.
 *
 * tldraw stocke bien plus que ce qui nous interesse (camera, pages, instance
 * state, geometrie, style...). Pour generer des taches, seul le sens compte :
 * on ne garde que les shapes porteuses de texte ou de structure, et on jette
 * coordonnees, couleurs et etats d'edition.
 */

interface TldrawRecord {
  id?: string
  typeName?: string
  type?: string
  props?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Le texte d'une shape tldraw est soit une chaine (`props.text`), soit un
 * document riche ProseMirror (`props.richText`) selon la version et le type de
 * shape. On aplatit les deux vers du texte brut.
 */
const extractText = (props: Record<string, unknown> | undefined): string => {
  if (!props) return ''

  if (typeof props.text === 'string') return props.text.trim()

  const rich = props.richText
  if (rich && typeof rich === 'object') {
    const parts: string[] = []
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      const n = node as { type?: string; text?: string; content?: unknown[] }
      if (n.type === 'text' && typeof n.text === 'string') parts.push(n.text)
      if (Array.isArray(n.content)) n.content.forEach(walk)
    }
    walk(rich)
    return parts.join(' ').trim()
  }

  return ''
}

const isShape = (record: TldrawRecord): boolean =>
  record.typeName === 'shape' && typeof record.type === 'string'

export const extractElements = (records: TldrawRecord[]): CanvasElement[] => {
  const shapes = records.filter(isShape)

  // Une fleche liee pointe vers d'autres shapes : on resout leurs textes pour
  // que l'IA comprenne la relation ("Auth" -> "Base de donnees") plutot que de
  // voir des identifiants opaques.
  const textById = new Map<string, string>()
  for (const shape of shapes) {
    if (shape.id) textById.set(shape.id, extractText(shape.props))
  }

  const resolveEnd = (end: unknown): string | undefined => {
    if (!end || typeof end !== 'object') return undefined
    const e = end as { type?: string; boundShapeId?: string }
    if (e.type !== 'binding' || !e.boundShapeId) return undefined
    return textById.get(e.boundShapeId) || undefined
  }

  const elements: CanvasElement[] = []

  for (const shape of shapes) {
    const id = shape.id ?? ''
    const text = extractText(shape.props)

    switch (shape.type) {
      case 'note':
        // Un post-it vide n'apporte rien au prompt.
        if (text) elements.push({ id, kind: 'note', text })
        break

      case 'text':
        if (text) elements.push({ id, kind: 'text', text })
        break

      case 'geo':
        elements.push({
          id,
          kind: 'shape',
          text,
          geo: typeof shape.props?.geo === 'string' ? shape.props.geo : 'rectangle',
        })
        break

      case 'arrow': {
        const from = resolveEnd(shape.props?.start)
        const to = resolveEnd(shape.props?.end)
        // Une fleche qui ne relie rien de nomme n'exprime aucune relation.
        if (from || to || text) {
          elements.push({ id, kind: 'arrow', text, from, to })
        }
        break
      }

      case 'draw':
        elements.push({ id, kind: 'drawing', text: '' })
        break

      default:
        // Les autres shapes (frame, image, embed...) n'ont pas de sens
        // exploitable ici ; on ne les remonte que si elles portent du texte.
        if (text) elements.push({ id, kind: 'text', text })
    }
  }

  return elements
}

export const readCanvasDocument = (
  doc: Y.Doc,
): { elements: CanvasElement[]; chat: CanvasChatMessage[]; drawingCount: number } => {
  const records = [...doc.getMap(CANVAS_KEYS.RECORDS).values()] as TldrawRecord[]
  const chat = doc.getArray<CanvasChatMessage>(CANVAS_KEYS.CHAT).toArray()

  const all = extractElements(records)
  const drawingCount = all.filter((e) => e.kind === 'drawing').length

  return {
    // Les traces au stylo sont comptees, pas listees : sans texte, elles
    // n'ajouteraient que du bruit au prompt.
    elements: all.filter((e) => e.kind !== 'drawing'),
    chat,
    drawingCount,
  }
}
