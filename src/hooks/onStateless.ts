import { randomUUID } from 'crypto'
import { onStatelessPayload } from '@hocuspocus/server'
import { canvasEventsQueue } from '../queue'
import { JOB_TYPES, type ChatMessageJobData } from '../queue/queue.constants'
import {
  CANVAS_KEYS,
  type CanvasChatMessage,
  type CanvasTokenPayload,
} from '../contract'

interface IncomingChatMessage {
  type: 'chat'
  text: string
}

export const onStateless = async (data: onStatelessPayload) => {
  const { payload, documentName, document, connection } = data

  let message: IncomingChatMessage
  try {
    message = JSON.parse(payload)
  } catch {
    return
  }

  if (message.type !== 'chat' || !message.text?.trim()) return

  const user = connection.context.user as CanvasTokenPayload

  const chatMessage: ChatMessageJobData = {
    id: randomUUID(),
    authorId: user.userId,
    body: message.text.trim(),
    sentAt: new Date().toISOString(),
    deleted: false,
    canvasId: documentName,
  }

  await canvasEventsQueue.add(JOB_TYPES.CANVAS_CHAT_MESSAGE, chatMessage)

  // Le chat vit dans le document Yjs, pas seulement dans le broadcast : sans ca
  // il serait perdu a la reconnexion et absent de l'export envoye a l'IA.
  const persisted: CanvasChatMessage = {
    id: chatMessage.id,
    authorId: chatMessage.authorId,
    body: chatMessage.body,
    sentAt: chatMessage.sentAt,
    deleted: chatMessage.deleted,
  }
  document.getArray<CanvasChatMessage>(CANVAS_KEYS.CHAT).push([persisted])

  document.broadcastStateless(JSON.stringify({ type: 'chat', data: chatMessage }))

  console.log(`[CHAT] User ${user.userId} → project ${documentName}: "${chatMessage.body}"`)
}
