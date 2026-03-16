import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3'
import { env } from '../env'
import { s3Config } from '../index'

export async function ensureBucketExists() {
  const s3Client = new S3Client(s3Config)
  const bucket = env.BUCKET_NAME
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }))
    console.log(`[S3] Bucket "${bucket}" ready`)
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.log(`[S3] Bucket "${bucket}" not found. Attempting to create it...`)
      await s3Client.send(new CreateBucketCommand({ Bucket: bucket }))
      console.log(`[S3] Bucket "${bucket}" created successfully`)
    } else {
      console.error(`[S3] Critical error occurred while accessing the bucket :`, error)
      process.exit(1)
    }
  }
}
