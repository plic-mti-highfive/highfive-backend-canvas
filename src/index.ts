import { s3Config } from './storage/config'
import { env } from './env'
import { startServer } from './server'
import { ensureBucketExists } from './storage/bucket'
import { closeQueue } from './queue'

export { s3Config }

if (env.ENV === 'dev') console.log('[SERVER] Development mode')
else console.log('[SERVER] Production mode')

async function start() {
  await ensureBucketExists()

  await startServer()
}

start().catch((err) => {
  console.error('[SERVER] Critical error occurred while starting the server :', err)
  process.exit(1)
})

process.on('SIGTERM', async () => {
  await closeQueue()
  process.exit(0)
})
