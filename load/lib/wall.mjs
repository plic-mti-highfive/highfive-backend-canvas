// Utilitaires partagés par e2e.mjs et load.mjs : appels à l'API du core et
// client WebSocket Hocuspocus se faisant passer pour le front.
import { HocuspocusProvider } from '@hocuspocus/provider'
import WebSocket from 'ws'
import * as Y from 'yjs'

export const API_URL = process.env.API_URL ?? 'http://localhost:3000'
export const CANVAS_URL = process.env.CANVAS_URL ?? 'http://localhost:8585'
export const INTERNAL_SECRET = process.env.CANVAS_INTERNAL_SECRET ?? 'dev-internal-secret'

// Le core limite (throttler) les routes d'auth : on patiente sur 429 plutôt que d'échouer.
export const api = async (method, path, options = {}, attempt = 0) => {
  const { token, body } = options
  const result = await rawApi(method, path, token, body)
  if (result.status === 429 && attempt < 60) {
    await new Promise((r) => setTimeout(r, 1000))
    return api(method, path, options, attempt + 1)
  }
  return result
}

const rawApi = async (method, path, token, body) => {
  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let json
  try {
    json = text ? JSON.parse(text) : undefined
  } catch {
    json = text
  }
  return { status: response.status, body: json }
}

const stamp = Date.now().toString(36).slice(-5)
let counter = 0

/** Crée un compte, un projet (donc son Mur) et renvoie une session Mur. */
export const createWall = async (label = 'w') => {
  const id = `${label}${stamp}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`
  const user = { email: `${id}@example.com`, password: 'demo1234', username: id }
  const reg = await api('POST', '/auth/register', { body: user })
  if (reg.status !== 201) throw new Error(`register ${reg.status} ${JSON.stringify(reg.body)}`)
  const token = reg.body.token
  const project = await api('POST', '/projects', {
    token,
    body: {
      title: `Projet ${id}`,
      tagline: 'Projet de test du chat',
      description: 'Projet créé par les tests du chat du Mur.',
      tags: ['code'],
      visibility: 'private',
      participation: 'on_invite',
    },
  })
  if (project.status !== 201) throw new Error(`projet ${project.status} ${JSON.stringify(project.body)}`)
  const session = await api('GET', `/projects/${project.body.slug}/wall/session`, { token })
  if (session.status !== 200) throw new Error(`session ${session.status} ${JSON.stringify(session.body)}`)
  return { user, token, slug: project.body.slug, projectId: project.body.id, session: session.body }
}

/**
 * Se connecte au Mur. Renvoie un client qui range les messages `chat` reçus
 * (diffusion stateless) et sait en envoyer.
 */
export const connectWall = (session, { timeoutMs = 10000 } = {}) =>
  new Promise((resolve, reject) => {
    const received = []
    const listeners = new Set()
    const provider = new HocuspocusProvider({
      url: session.websocketUrl,
      name: session.canvasId,
      token: session.token,
      document: new Y.Doc(),
      WebSocketPolyfill: WebSocket,
      onStateless: ({ payload }) => {
        let message
        try {
          message = JSON.parse(payload)
        } catch {
          return
        }
        if (message.type !== 'chat') return
        received.push(message.data)
        listeners.forEach((fn) => fn(message.data))
      },
      onSynced: () => {
        clearTimeout(timer)
        resolve(client)
      },
      onAuthenticationFailed: ({ reason }) => {
        clearTimeout(timer)
        reject(new Error(`authentification refusée : ${reason}`))
      },
    })
    const timer = setTimeout(() => reject(new Error('connexion WebSocket : délai dépassé')), timeoutMs)
    const client = {
      provider,
      received,
      send: (text) => provider.sendStateless(JSON.stringify({ type: 'chat', text })),
      onChat: (fn) => {
        listeners.add(fn)
        return () => listeners.delete(fn)
      },
      /** Attend un message reçu satisfaisant `predicate` (déjà reçu ou à venir). */
      waitFor: (predicate, ms = 15000) =>
        new Promise((res, rej) => {
          const existing = received.find(predicate)
          if (existing) return res(existing)
          const t = setTimeout(() => {
            off()
            rej(new Error('délai dépassé en attendant un message'))
          }, ms)
          const off = client.onChat((m) => {
            if (predicate(m)) {
              clearTimeout(t)
              off()
              res(m)
            }
          })
        }),
      chatArray: () => provider.document.getArray('chat').toArray(),
      close: () => provider.destroy(),
    }
  })

export const exportWall = async (canvasId) => {
  const response = await fetch(`${CANVAS_URL}/canvas/${canvasId}/export`, {
    headers: { 'x-internal-secret': INTERNAL_SECRET },
  })
  return { status: response.status, body: await response.json() }
}

export const percentile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : NaN
