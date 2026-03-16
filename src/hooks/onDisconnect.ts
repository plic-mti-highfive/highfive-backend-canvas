import { onDisconnectPayload } from '@hocuspocus/server'

export const onDisconnect = async (data: onDisconnectPayload) => {
  const timeoutId = data.context.timeoutId
  if (timeoutId) {
    clearTimeout(timeoutId as NodeJS.Timeout)
  }

  const user = data.context.user
  if (user) {
    console.log(`[AUTH] User ${user.userId} disconnected from ${data.documentName}.`)
  }
}
