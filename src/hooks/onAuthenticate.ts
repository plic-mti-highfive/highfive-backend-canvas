import { onAuthenticatePayload } from '@hocuspocus/server'
import { verifyCanvasToken } from '../auth/jwt'

const CONNECTION_TTL = 60 * 60 * 1000 // 1 heure

export const onAuthenticate = async (data: onAuthenticatePayload) => {
  const { token, documentName, connectionConfig } = data

  if (!token) throw new Error('Token manquant')

  const payload = verifyCanvasToken(token, documentName)
  console.log(
    `[AUTH] User ${payload.userId} authenticated with role ${payload.role} for project ${payload.projectId}.`
  )

  if (payload.role === 'viewer') {
    connectionConfig.readOnly = true
  }

  const timeoutId = setTimeout(() => {
    console.log(
      `[AUTH] Connection for user ${payload.userId} has expired after ${CONNECTION_TTL / (60 * 1000)} minutes.`
    )
    connectionConfig.isAuthenticated = false
  }, CONNECTION_TTL)

  return {
    user: payload,
    timeoutId,
  }
}
