import { Server } from '@hocuspocus/server'
import { Logger } from '@hocuspocus/extension-logger'
import { S3 } from '@hocuspocus/extension-s3'
import { s3Config } from './index'
import { env } from './env'
import * as hooks from './hooks'
import { onRequest } from './http/onRequest'

export const startServer = async () => {
  console.log(`[SERVER] Starting server...`)

  const server = new Server({
    // Settings
    name: env.SERVER_NAME,
    port: env.PORT,
    timeout: 30000,
    debounce: 5000,
    maxDebounce: 30000,
    extensions: [new Logger(), new S3(s3Config)],

    // onFunction
    onAuthenticate: hooks.onAuthenticate,
    onDisconnect: hooks.onDisconnect,
    onStateless: hooks.onStateless,
    onRequest,
  })

  await server.listen()
}
