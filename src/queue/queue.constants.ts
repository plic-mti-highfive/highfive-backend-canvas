export const QUEUE_NAMES = {
  CANVAS_EVENTS: 'canvas_events',
} as const

export const JOB_TYPES = {
  CANVAS_CHAT_MESSAGE: 'canvas_chat_message',
} as const

export interface ChatMessageJobData {
  id: string
  text: string
  authorId: string
  tenantId: string
  canvasId: string
  timestamp: number
}
