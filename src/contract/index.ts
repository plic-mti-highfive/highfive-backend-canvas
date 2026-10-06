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

/**
 * Message du chat du Mur : meme forme que le `Message` du contrat de la
 * messagerie (`id`, `conversationId`, `authorId`, `body`, `sentAt`, `editedAt`,
 * `deleted`), plus l'indication assistant. Champ optionnel = absent, jamais
 * `null`. C'est la forme stockee dans le Y.Doc, publiee sur `canvas_events`,
 * diffusee aux clients et exportee.
 */
export interface CanvasChatMessage {
  /** Identifiant du message ; devient l'id du `MessageEntity` cote core. */
  id: string
  /** Conversation `wall` du projet, quand on la connait (le core la pose). */
  conversationId?: string
  authorId: string
  body: string
  /** ISO 8601. */
  sentAt: string
  editedAt?: string
  deleted: boolean
  /** Vrai pour une reponse de l'assistant IA injectee par le core. */
  isAssistant?: boolean
}

/**
 * Message de chat publie par le canvas sur la file BullMQ `canvas_events`
 * (job `canvas_chat_message`). `canvasId` identifie le Mur.
 */
export interface CanvasChatJobData extends CanvasChatMessage {
  canvasId: string
}

/**
 * Corps de `POST /canvas/:canvasId/chat` (interne, `X-Internal-Secret`) : le
 * core y renvoie la reponse de l'assistant. `id` rend l'injection idempotente.
 */
export interface CanvasAssistantChatInput extends CanvasChatMessage {
  isAssistant: true
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
