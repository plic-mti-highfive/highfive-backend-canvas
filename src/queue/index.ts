import { Queue } from 'bullmq'
import { env } from '../env'
import { QUEUE_NAMES } from './queue.constants'

const connection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
}

export const canvasEventsQueue = new Queue(QUEUE_NAMES.CANVAS_EVENTS, { connection })

export async function closeQueue() {
  await canvasEventsQueue.close()
}
