import type { onRequestPayload } from '@hocuspocus/server'
import type { ServerResponse } from 'http'
import { env } from '../env'
import { readCanvasDocument } from '../canvas/export'
import { injectAssistantMessage, parseAssistantChatInput } from '../canvas/chat'

/**
 * Surface HTTP du serveur canvas, montee sur le serveur Hocuspocus existant via
 * le hook onRequest plutot que sur un serveur separe : WebSocket et HTTP
 * partagent ainsi le meme port et le meme cycle de vie.
 *
 *   GET /health
 *   GET /canvas/:canvasId/export   (interne, appelee par le core backend)
 *   POST /canvas/:canvasId/chat    (interne : reponse de l'assistant IA, via le core)
 *
 * L'export n'est pas destine aux clients : il est protege par un secret partage
 * avec le core. Le canvas n'a aucune notion des droits projet — c'est le core
 * qui les verifie avant d'appeler.
 */

const EXPORT_PATH = /^\/canvas\/([^/]+)\/export\/?$/

const CHAT_PATH = /^\/canvas\/([^/]+)\/chat\/?$/
const MAX_BODY_BYTES = 64 * 1024

const readBody = (request: onRequestPayload['request']): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })

const send = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

/**
 * Hocuspocus enchaine sur son handler par defaut ("Welcome to Hocuspocus!") si le
 * hook resout. Rejeter avec une erreur vide est la facon prevue de signaler que
 * la requete est deja traitee.
 */
const handled = (): Promise<never> => Promise.reject()

export const onRequest = async (data: onRequestPayload): Promise<void> => {
  const { request, response, instance } = data
  const path = (request.url ?? '').split('?')[0]

  if (request.method === 'GET' && path === '/health') {
    send(response, 200, { status: 'ok' })
    return handled()
  }

  const chatMatch = request.method === 'POST' ? CHAT_PATH.exec(path) : null
  if (chatMatch) {
    if (request.headers['x-internal-secret'] !== env.INTERNAL_SECRET) {
      send(response, 401, { message: 'Invalid internal secret' })
      return handled()
    }

    const canvasId = decodeURIComponent(chatMatch[1])
    let input
    try {
      input = parseAssistantChatInput(await readBody(request))
    } catch {
      send(response, 400, { message: 'Invalid chat message' })
      return handled()
    }

    try {
      const connection = await instance.openDirectConnection(canvasId, {})
      let created = false
      await connection.transact((document) => {
        created = injectAssistantMessage(document, canvasId, input)
      })
      await connection.disconnect()
      send(response, created ? 201 : 200, { id: input.id, created })
    } catch (error) {
      console.error(`[CHAT] Failed to inject message into canvas ${canvasId}:`, error)
      send(response, 500, { message: 'Failed to inject chat message' })
    }
    return handled()
  }

  const match = request.method === 'GET' ? EXPORT_PATH.exec(path) : null
  if (!match) return

  if (request.headers['x-internal-secret'] !== env.INTERNAL_SECRET) {
    send(response, 401, { message: 'Invalid internal secret' })
    return handled()
  }

  const canvasId = decodeURIComponent(match[1])

  try {
    // openDirectConnection charge le document depuis S3 s'il n'est pas deja en
    // memoire : l'export fonctionne donc meme si plus personne n'est connecte.
    const connection = await instance.openDirectConnection(canvasId, {})

    let result = { elements: [], chat: [], drawingCount: 0 } as ReturnType<
      typeof readCanvasDocument
    >
    await connection.transact((document) => {
      result = readCanvasDocument(document)
    })
    await connection.disconnect()

    // Le canvas ignore le projet : il vit dans le jeton que le core emet, et
    // le core — seul appelant — le possede deja.
    send(response, 200, { canvasId, ...result })
  } catch (error) {
    console.error(`[EXPORT] Failed to export canvas ${canvasId}:`, error)
    send(response, 500, { message: 'Failed to export canvas' })
  }

  return handled()
}
