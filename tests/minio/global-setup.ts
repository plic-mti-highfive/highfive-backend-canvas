import { execFileSync } from 'child_process'
import { randomBytes } from 'crypto'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    s3Endpoint: string
  }
}

const IMAGE = process.env.TEST_MINIO_IMAGE ?? 'quay.io/minio/minio'

const docker = (...args: string[]): string =>
  execFileSync('docker', args, { encoding: 'utf8' }).trim()

const waitHealthy = async (endpoint: string): Promise<void> => {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${endpoint}/minio/health/live`)
      if (res.ok) return
    } catch {
      // MinIO demarre encore.
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`MinIO injoignable sur ${endpoint}`)
}

/**
 * Fournit `s3Endpoint` aux tests. Si TEST_S3_ENDPOINT est defini (CI), on s'en
 * sert tel quel ; sinon on demarre un MinIO jetable (`--rm`, donnees en tmpfs)
 * que le teardown arrete toujours, y compris quand les tests echouent.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const provided = process.env.TEST_S3_ENDPOINT
  if (provided) {
    await waitHealthy(provided)
    project.provide('s3Endpoint', provided)
    return async () => undefined
  }

  const name = `hf-canvas-test-${randomBytes(4).toString('hex')}`
  const stop = (): void => {
    try {
      docker('rm', '-f', name)
    } catch {
      // deja arrete (--rm)
    }
  }
  try {
    docker(
      'run', '-d', '--rm', '--tmpfs', '/data', '-p', '127.0.0.1::9000', '--name', name,
      '-e', 'MINIO_ROOT_USER=minioadmin', '-e', 'MINIO_ROOT_PASSWORD=minioadmin',
      IMAGE, 'server', '/data'
    )
    const mapping = docker('port', name, '9000/tcp').split('\n')[0]
    const port = mapping.slice(mapping.lastIndexOf(':') + 1)
    const endpoint = `http://127.0.0.1:${port}`
    await waitHealthy(endpoint)
    project.provide('s3Endpoint', endpoint)
  } catch (error) {
    stop()
    throw error
  }
  return async () => stop()
}
