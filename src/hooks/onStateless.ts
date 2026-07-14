import { randomUUID } from 'crypto'
import { onStatelessPayload } from '@hocuspocus/server'
import { canvasEventsQueue } from '../queue'
import { JOB_TYPES, type ChatMessageJobData } from '../queue/queue.constants'
import type { CanvasTokenPayload } from '@plic-mti-highfive/shared-types'

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
    text: message.text.trim(),
    authorId: user.userId,
    tenantId: user.tenantId,
    canvasId: documentName,
    timestamp: Date.now(),
  }

  await canvasEventsQueue.add(JOB_TYPES.CANVAS_CHAT_MESSAGE, chatMessage)

  document.broadcastStateless(JSON.stringify({ type: 'chat', data: chatMessage }))

  console.log(`[CHAT] User ${user.userId} → project ${documentName}: "${chatMessage.text}"`)
}
