import { z } from 'zod'
import type * as Y from 'yjs'
import { CANVAS_KEYS, type CanvasAssistantChatInput, type CanvasChatMessage } from '../contract'

const assistantChatInputSchema = z.object({
  id: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(64).optional(),
  authorId: z.string().min(1).max(64),
  body: z.string().min(1).max(4000),
  sentAt: z.string().datetime(),
  editedAt: z.string().datetime().optional(),
  deleted: z.boolean(),
  isAssistant: z.literal(true),
})

export const parseAssistantChatInput = (raw: unknown): CanvasAssistantChatInput =>
  assistantChatInputSchema.parse(raw)

/** Document Hocuspocus : un Y.Doc qui sait diffuser un message stateless. */
type BroadcastingDoc = Y.Doc & { broadcastStateless?: (payload: string) => void }

/**
 * Ajoute la reponse de l'assistant au chat du Y.Doc et la diffuse aux clients
 * connectes, dans le meme format que les messages des utilisateurs
 * (`{ type: 'chat', data }`). Renvoie `false` sans rien faire si l'`id` est deja
 * present : le core peut rejouer l'appel sans doublon.
 *
 * Aucun job n'est publie sur la file : la reponse est deja sauvegardee cote
 * core, la republier boucle sur l'assistant.
 */
export const injectAssistantMessage = (
  document: BroadcastingDoc,
  canvasId: string,
  input: CanvasAssistantChatInput
): boolean => {
  const chat = document.getArray<CanvasChatMessage>(CANVAS_KEYS.CHAT)
  if (chat.toArray().some((message) => message.id === input.id)) return false

  const message: CanvasChatMessage = { ...input, isAssistant: true }
  chat.push([message])

  document.broadcastStateless?.(JSON.stringify({ type: 'chat', data: { ...message, canvasId } }))
  return true
}

/** Ancienne forme des messages deja stockes dans les Y.Doc (`text`, `timestamp`). */
interface LegacyChatMessage {
  id: string
  text: string
  authorId: string
  timestamp: number
  isAssistant?: boolean
}

/**
 * Lit un message du Y.Doc quelle que soit sa forme : les Murs ecrits avant
 * l'alignement sur le `Message` du contrat portent encore `text`/`timestamp`.
 */
export const normalizeChatMessage = (raw: CanvasChatMessage | LegacyChatMessage): CanvasChatMessage => {
  if ('body' in raw) return raw
  return {
    id: raw.id,
    authorId: raw.authorId,
    body: raw.text,
    sentAt: new Date(raw.timestamp).toISOString(),
    deleted: false,
    ...(raw.isAssistant ? { isAssistant: true } : {}),
  }
}
