import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Server } from '@hocuspocus/server'
import { S3 } from '@hocuspocus/extension-s3'
import { S3Client, HeadBucketCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import * as Y from 'yjs'
import { s3Config } from '../../src/storage/config'
import { ensureBucketExists } from '../../src/storage/bucket'
import { env } from '../../src/env'
import { CANVAS_KEYS } from '../../src/contract'

const client = new S3Client(s3Config)
const servers: Server[] = []

// Un serveur par "vie" : en detruire un puis en creer un autre simule un redemarrage.
const newServer = async (config = s3Config): Promise<Server> => {
  const server = new Server({ port: 0, quiet: true, extensions: [new S3(config)] })
  servers.push(server)
  await server.listen()
  return server
}

const writeChat = async (server: Server, name: string, body: string): Promise<void> => {
  const connection = await server.hocuspocus.openDirectConnection(name, {})
  await connection.transact((doc) => {
    doc.getArray(CANVAS_KEYS.CHAT).push([{ id: '1', body }])
    doc.getMap(CANVAS_KEYS.RECORDS).set('shape:a', { id: 'shape:a', typeName: 'shape' })
  })
  await connection.disconnect() // declenche le store S3
}

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterAll(async () => {
  await Promise.all(servers.map((s) => s.destroy()))
})

describe('storage — bucket', () => {
  it('ensureBucketExists cree le bucket absent, puis est idempotent', async () => {
    await expect(client.send(new HeadBucketCommand({ Bucket: env.BUCKET_NAME }))).rejects.toThrow()
    await ensureBucketExists()
    await expect(client.send(new HeadBucketCommand({ Bucket: env.BUCKET_NAME }))).resolves.toBeDefined()
    await expect(ensureBucketExists()).resolves.toBeUndefined()
  })

  it('ensureBucketExists quitte le processus (code 1) si MinIO refuse les identifiants', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.resetModules()
    vi.stubEnv('MINIO_PASSWORD', 'mauvais-mot-de-passe')
    const { ensureBucketExists: ensureBad } = await import('../../src/storage/bucket')
    await ensureBad()
    expect(exit).toHaveBeenCalledWith(1)
    vi.unstubAllEnvs()
    exit.mockRestore()
  })
})

describe('storage — persistance Yjs (extension S3 + vrai MinIO)', () => {
  it('stocke le document a la deconnexion et le recharge apres un redemarrage', async () => {
    const first = await newServer()
    await writeChat(first, 'mur-persiste', 'bonjour')
    await first.destroy()

    const second = await newServer()
    const connection = await second.hocuspocus.openDirectConnection('mur-persiste', {})
    let chat: unknown[] = []
    let records: string[] = []
    await connection.transact((doc: Y.Doc) => {
      chat = doc.getArray(CANVAS_KEYS.CHAT).toArray()
      records = [...doc.getMap(CANVAS_KEYS.RECORDS).keys()]
    })
    await connection.disconnect()
    expect(chat).toEqual([{ id: '1', body: 'bonjour' }])
    expect(records).toEqual(['shape:a'])
  })

  it('range le document sous <prefix><nom>.bin', async () => {
    const res = await client.send(
      new GetObjectCommand({ Bucket: env.BUCKET_NAME, Key: 'hocuspocus-documents/mur-persiste.bin' })
    )
    expect((await res.Body!.transformToByteArray()).length).toBeGreaterThan(0)
  })

  it('un document absent se charge vide (pas d erreur)', async () => {
    const server = await newServer()
    const connection = await server.hocuspocus.openDirectConnection('mur-inconnu', {})
    let size = -1
    await connection.transact((doc: Y.Doc) => {
      size = doc.getArray(CANVAS_KEYS.CHAT).length + doc.getMap(CANVAS_KEYS.RECORDS).size
    })
    await connection.disconnect()
    expect(size).toBe(0)
  })

  it('erreur S3 au chargement : le chargement echoue au lieu de servir un Mur vide', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const server = await newServer({
      ...s3Config,
      credentials: { accessKeyId: 'mauvais', secretAccessKey: 'mauvais' },
    })
    await expect(server.hocuspocus.openDirectConnection('mur-persiste', {})).rejects.toBeDefined()
  })
})
