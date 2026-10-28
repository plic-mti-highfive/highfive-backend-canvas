import { defineConfig } from 'vitest/config'

// Tests d'integration avec un vrai MinIO (jetable, demarre par le globalSetup,
// ou fourni par TEST_S3_ENDPOINT). Lances par `pnpm test:int`, jamais par `vitest run`.
export default defineConfig({
  test: {
    include: ['tests/minio/**/*.int.ts'],
    globalSetup: ['tests/minio/global-setup.ts'],
    setupFiles: ['tests/minio/setup-env.ts'],
    testTimeout: 30000,
    hookTimeout: 90000,
    fileParallelism: false,
    env: {
      ENV: 'dev',
      JWT_SECRET: 'secret-de-test',
      INTERNAL_SECRET: 'secret-interne-de-test',
    },
  },
})
