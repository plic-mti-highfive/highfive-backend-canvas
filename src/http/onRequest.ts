import type { onRequestPayload } from '@hocuspocus/server'
import type { ServerResponse } from 'http'
import { env } from '../env'
import { readCanvasDocument } from '../canvas/export'

/**
 * Surface HTTP du serveur canvas, montee sur le serveur Hocuspocus existant via
 * le hook onRequest plutot que sur un serveur separe : WebSocket et HTTP
 * partagent ainsi le meme port et le meme cycle de vie.
 *
 *   GET /health
 *   GET /canvas/:canvasId/export   (interne, appelee par le core backend)
 *
 * L'export n'est pas destine aux clients : il est protege par un secret partage
 * avec le core. Le canvas n'a aucune notion des droits projet — c'est le core
 * qui les verifie avant d'appeler.
 */

const EXPORT_PATH = /^\/canvas\/([^/]+)\/export\/?$/

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

    // Le canvas ignore projet et tenant : ils vivent dans le token que le core
    // emet, et le core — seul appelant — les possede deja.
    send(response, 200, { canvasId, ...result })
  } catch (error) {
    console.error(`[EXPORT] Failed to export canvas ${canvasId}:`, error)
    send(response, 500, { message: 'Failed to export canvas' })
  }

  return handled()
}
