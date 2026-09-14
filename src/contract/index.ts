/**
 * Contrat partage avec le core (`core_backend/src/modules/wall/canvas.types.ts`).
 *
 * Ces types vivaient dans le paquet publie `@plic-mti-highfive/shared-types`,
 * supprime : publier une version de paquet a chaque changement de forme, des
 * deux cotes, coutait plus cher que le couplage qu'il evitait. Ils sont
 * desormais declares a l'identique ici et dans le core — toute modification
 * doit etre faite dans les deux depots.
 *
 * Le canvas ne connait ni tenant ni droits projet : c'est le core qui les
 * detient et qui signe le jeton.
 */

/** Cles des structures portees par le document Yjs d'un Mur. */
export const CANVAS_KEYS = {
  /** Y.Map<string, unknown> : recordId -> record tldraw */
  RECORDS: 'tl_records',
  /** Y.Array<CanvasChatMessage> */
  CHAT: 'chat',
} as const

/** Jeton emis par le core, verifie ici contre le nom du document demande. */
export interface CanvasTokenPayload {
  userId: string
  projectId: string
  canvasId: string
  role: 'admin' | 'editor' | 'viewer'
}

export interface CanvasChatMessage {
  id: string
  text: string
  authorId: string
  timestamp: number
}

/** Nature semantique d'un element du Mur, apres traduction des shapes tldraw. */
export type CanvasElementKind = 'note' | 'text' | 'shape' | 'arrow' | 'drawing'

export interface CanvasElement {
  id: string
  kind: CanvasElementKind
  /** Texte porte par l'element (contenu d'un post-it, label d'une forme...). */
  text: string
  /** Pour `shape` : rectangle, ellipse, diamond... */
  geo?: string
  /** Pour `arrow` : texte des elements relies, quand la fleche est liee. */
  from?: string
  to?: string
}

export interface CanvasExport {
  canvasId: string
  elements: CanvasElement[]
  chat: CanvasChatMessage[]
  /** Les traces au stylo n'ont pas de texte : on n'en garde que le volume. */
  drawingCount: number
}
