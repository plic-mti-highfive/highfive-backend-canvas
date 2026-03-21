import jwt from 'jsonwebtoken'
import { env } from '../env'
import { CanvasTokenPayload } from '@plic-mti-highfive/shared-types'

export const verifyCanvasToken = (token: string, expectedProjectId: string): CanvasTokenPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as CanvasTokenPayload

    if (decoded.projectId !== expectedProjectId) {
      throw new Error('Token does not match the expected project.')
    }

    return decoded
  } catch (error: any) {
    throw new Error(`Authentication failed: ${error.message}`, { cause: error })
  }
}
