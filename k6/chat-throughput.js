/**
 * Test de débit — messages de chat (stateless messages).
 *
 * Usage :
 *   k6 run --env JWT_SECRET=your-jwt-secret ./k6/chat-throughput.js
 *   k6 run --env JWT_SECRET=your-jwt-secret --env DEBUG=1 --vus 1 --duration 10s ./k6/chat-throughput.js
 */

import ws from 'k6/ws'
import { check, sleep } from 'k6'
import { Counter, Trend, Rate } from 'k6/metrics'
import { makeCanvasToken } from './lib/jwt.js'
import {
  buildSyncStep1,
  buildAuthMessage,
  buildStatelessMessage,
  isAuthenticated,
  isTokenSyncRequest,
  isPermissionDenied,
  describeMessage,
} from './lib/protocol.js'

const JWT_SECRET = __ENV.JWT_SECRET || 'your-jwt-secret'
const WS_URL     = __ENV.WS_URL     || 'ws://localhost:8585'
const CANVAS_ID  = 'canvas-chat-test'

export const options = {
  stages: [
    { duration: '20s', target: 10 },
    { duration: '20s', target: 50 },
    { duration: '2m',  target: 50 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'messages_sent':      ['count>1000'],
    'messages_received':  ['count>500'],
    'message_roundtrip':  ['p(95)<2000'],
    'auth_success_rate':  ['rate>0.99'],
  },
}

const messagesSent     = new Counter('messages_sent')
const messagesReceived = new Counter('messages_received')
const roundtripTrend   = new Trend('message_roundtrip', true)
const authSuccessRate  = new Rate('auth_success_rate')

export default function () {
  const userId = `user-${__VU}`
  const token  = makeCanvasToken({
    userId,
    tenantId:  'tenant-test',
    projectId: 'project-test',
    canvasId:  CANVAS_ID,
    role:      'editor',
    secret:    JWT_SECRET,
  })

  let authenticated = false
  const pendingSends = new Map()

  ws.connect(`${WS_URL}/${CANVAS_ID}`, {}, (socket) => {
    // Le provider envoie d'abord le token Auth, puis SyncStep1
    socket.on('open', () => {
      if (__ENV.DEBUG) console.log(`[VU${__VU}] connecté — envoi Auth`)
      socket.sendBinary(buildAuthMessage(CANVAS_ID, token))
    })

    const handleBinary = (data) => {
      if (__ENV.DEBUG) console.log(`[VU${__VU}] reçu: ${describeMessage(data)}`)

      if (isPermissionDenied(data)) {
        if (__ENV.DEBUG) console.log(`[VU${__VU}] PermissionDenied — token invalide ?`)
        authSuccessRate.add(false)
        socket.close()
        return
      }

      if (isAuthenticated(data)) {
        if (__ENV.DEBUG) console.log(`[VU${__VU}] Authenticated ✓ — envoi SyncStep1`)
        authenticated = true
        authSuccessRate.add(true)
        socket.sendBinary(buildSyncStep1(CANVAS_ID))
        socket.setInterval(() => {
          const id = `${__VU}-${Date.now()}`
          pendingSends.set(id, Date.now())
          socket.sendBinary(
            buildStatelessMessage(CANVAS_ID, JSON.stringify({ type: 'chat', text: `msg de ${userId}` }))
          )
          messagesSent.add(1)
        }, 500)
        return
      }

      const bytes = new Uint8Array(data)
      if (bytes[0] === 6) {
        messagesReceived.add(1)
        for (const [id, ts] of pendingSends) {
          roundtripTrend.add(Date.now() - ts)
          pendingSends.delete(id)
          break
        }
      }
    }

    // Hocuspocus envoie du binaire — on écoute les deux events par sécurité
    socket.on('binaryMessage', handleBinary)
    socket.on('message', (data) => {
      if (__ENV.DEBUG) console.log(`[VU${__VU}] reçu texte (inattendu): ${String(data).slice(0, 60)}`)
    })

    socket.on('error', (e) => {
      if (__ENV.DEBUG) console.log(`[VU${__VU}] erreur: ${e}`)
      authSuccessRate.add(false)
    })

    socket.setTimeout(() => socket.close(), 150000)
  })

  check(authenticated, { 'authentifié': (v) => v })
  sleep(1)
}
