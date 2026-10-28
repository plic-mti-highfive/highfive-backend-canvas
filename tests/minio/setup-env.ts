import { inject } from 'vitest'

// Avant l'import de src/env.ts par les tests : le endpoint du MinIO jetable est dynamique.
process.env.MINIO_ENDPOINT = inject('s3Endpoint')
process.env.MINIO_USERNAME = process.env.TEST_S3_USER ?? 'minioadmin'
process.env.MINIO_PASSWORD = process.env.TEST_S3_PASSWORD ?? 'minioadmin'
process.env.BUCKET_NAME = `hf-test-${Math.random().toString(36).slice(2, 10)}`
process.env.AWS_REGION = 'us-east-1'
