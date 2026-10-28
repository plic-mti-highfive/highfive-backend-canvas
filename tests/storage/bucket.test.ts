import { describe, it, expect, vi, beforeEach } from 'vitest'

const send = vi.fn()
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.send = send
  }),
  HeadBucketCommand: vi.fn().mockImplementation(function (this: Record<string, unknown>, i: unknown) {
    this.kind = 'head'
    this.input = i
  }),
  CreateBucketCommand: vi.fn().mockImplementation(function (this: Record<string, unknown>, i: unknown) {
    this.kind = 'create'
    this.input = i
  }),
}))

import { ensureBucketExists } from '../../src/storage/bucket'
import { buildS3Config } from '../../src/storage/config'

const kinds = () => send.mock.calls.map((c) => (c[0] as { kind: string }).kind)

beforeEach(() => {
  send.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('storage — ensureBucketExists (client S3 mocké)', () => {
  it('bucket présent : ne le recrée pas', async () => {
    send.mockResolvedValue({})
    await ensureBucketExists()
    expect(kinds()).toEqual(['head'])
  })

  it('bucket absent (NotFound) : le crée', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('nf'), { name: 'NotFound' })).mockResolvedValueOnce({})
    await ensureBucketExists()
    expect(kinds()).toEqual(['head', 'create'])
  })

  it('bucket absent (HTTP 404) : le crée', async () => {
    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } }).mockResolvedValueOnce({})
    await ensureBucketExists()
    expect(kinds()).toEqual(['head', 'create'])
  })

  it('autre erreur S3 (403) : arrête le processus avec le code 1', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    send.mockRejectedValue({ name: 'Forbidden', $metadata: { httpStatusCode: 403 } })
    await ensureBucketExists()
    expect(exit).toHaveBeenCalledWith(1)
    expect(kinds()).toEqual(['head'])
  })
})

describe('storage — buildS3Config', () => {
  it('en dev : endpoint MinIO, identifiants et path-style', () => {
    expect(buildS3Config()).toMatchObject({
      endpoint: 'http://localhost:9000',
      forcePathStyle: true,
      credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' },
    })
  })
})
