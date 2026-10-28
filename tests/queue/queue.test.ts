import { describe, it, expect, vi } from 'vitest'

const { Queue } = vi.hoisted(() => ({
  Queue: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.close = vi.fn().mockResolvedValue(undefined)
    this.add = vi.fn()
  }),
}))
vi.mock('bullmq', () => ({ Queue }))

import { canvasEventsQueue, closeQueue } from '../../src/queue'
import { QUEUE_NAMES, JOB_TYPES } from '../../src/queue/queue.constants'

describe('queue — canvas_events', () => {
  it('crée la file canvas_events sur la connexion Redis de l env', () => {
    expect(Queue).toHaveBeenCalledWith('canvas_events', {
      connection: { host: 'localhost', port: 6379 },
    })
    expect(QUEUE_NAMES.CANVAS_EVENTS).toBe('canvas_events')
    expect(JOB_TYPES.CANVAS_CHAT_MESSAGE).toBe('canvas_chat_message')
  })

  it('closeQueue ferme la file', async () => {
    await closeQueue()
    expect(canvasEventsQueue.close).toHaveBeenCalledTimes(1)
  })
})
