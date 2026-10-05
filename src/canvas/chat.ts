import { z } from 'zod'
import type * as Y from 'yjs'
import { CANVAS_KEYS, type CanvasAssistantChatInput, type CanvasChatMessage } from '../contract'

const assistantChatInputSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(4000),
  authorId: z.string().min(1).max(64),
  timestamp: z.number().int().nonnegative(),
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

  const message: CanvasChatMessage = {
    id: input.id,
    text: input.text,
    authorId: input.authorId,
    timestamp: input.timestamp,
    isAssistant: true,
  }
  chat.push([message])

  document.broadcastStateless?.(JSON.stringify({ type: 'chat', data: { ...message, canvasId } }))
  return true
}
