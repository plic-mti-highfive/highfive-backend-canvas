export const QUEUE_NAMES = {
  CANVAS_EVENTS: 'canvas_events',
} as const

export const JOB_TYPES = {
  CANVAS_CHAT_MESSAGE: 'canvas_chat_message',
} as const

/**
 * Message de chat publie sur la file. Plus de `tenantId` : la plateforme est
 * mono-instance depuis la refonte v2 (voir `core_backend/docs/REFACTO-V2.md`).
 */
export interface ChatMessageJobData {
  id: string
  text: string
  authorId: string
  canvasId: string
  timestamp: number
}
