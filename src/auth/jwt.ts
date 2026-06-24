import jwt from 'jsonwebtoken'
import { env } from '../env'

export interface CanvasTokenPayload {
  userId: string
  tenantId: string
  projectId: string
  canvasId: string
  role: 'admin' | 'editor' | 'viewer'
}

export const verifyCanvasToken = (token: string, expectedCanvasId: string): CanvasTokenPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as CanvasTokenPayload

    if (decoded.canvasId !== expectedCanvasId) {
      throw new Error('Token does not match the expected canvas.')
    }

    return decoded
  } catch (error: any) {
    throw new Error(`Authentication failed: ${error.message}`, { cause: error })
  }
}
