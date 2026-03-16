import { z } from 'zod'
import * as dotenv from 'dotenv'
import { de } from 'zod/v4/locales'

dotenv.config()

const devSchema = z.object({
  ENV: z.literal('dev'),
  SERVER_NAME: z.string().default('hocuspocus-server'),
  PORT: z.coerce.number().default(8585),
  BUCKET_NAME: z.string().default('hocuspocus-bucket-dev'),
  MINIO_ENDPOINT: z.string().default('http://localhost:9000'),
  MINIO_USERNAME: z.string().default('minioadmin'),
  MINIO_PASSWORD: z.string().default('minioadmin'),
  JWT_SECRET: z.string(),
})

const prodSchema = z.object({
  ENV: z.literal('prod'),
  SERVER_NAME: z.string().default('hocuspocus-server'),
  PORT: z.coerce.number().default(8585),
  BUCKET_NAME: z.string().default('hocuspocus-bucket-prod'),
  MINIO_ENDPOINT: z.string().optional(),
  MINIO_USERNAME: z.string().optional(),
  MINIO_PASSWORD: z.string().optional(),
  JWT_SECRET: z.string(),
})

const envSchema = z.discriminatedUnion('ENV', [devSchema, prodSchema])

export const env = envSchema.parse(process.env)
