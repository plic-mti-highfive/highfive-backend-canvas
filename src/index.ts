import { S3 } from '@hocuspocus/extension-s3'
import { env } from './env'
import { startServer } from './server'
import { ensureBucketExists } from './storage/bucket'
import { closeQueue } from './queue'

export let s3Config: ConstructorParameters<typeof S3>[0]

if (env.ENV === 'dev') {
  console.log('[SERVER] Development mode')
  s3Config = {
    bucket: env.BUCKET_NAME,
    endpoint: env.MINIO_ENDPOINT,
    credentials: {
      accessKeyId: env.MINIO_USERNAME,
      secretAccessKey: env.MINIO_PASSWORD,
    },
    forcePathStyle: true,
  }
} else {
  console.log('[SERVER] Production mode')
  s3Config = {
    bucket: env.BUCKET_NAME,
  }
}

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
