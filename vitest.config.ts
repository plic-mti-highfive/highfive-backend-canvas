import { defineConfig } from 'vitest/config'

// Les tests n'exigent aucun .env : l'env est fourni ici (src/env.ts le parse a l'import).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: {
      ENV: 'dev',
      JWT_SECRET: 'secret-de-test',
      INTERNAL_SECRET: 'secret-interne-de-test',
    },
  },
})
