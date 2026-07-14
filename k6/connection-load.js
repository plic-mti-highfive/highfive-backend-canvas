/**
 * Test de charge — connexions WebSocket concurrentes.
 *
 * Usage :
 *   k6 run --env JWT_SECRET=your-jwt-secret ./k6/connection-load.js
 *
 * Scénario : montée en charge jusqu'à 200 utilisateurs simultanés,
 * chacun se connecte à un canvas et maintient la connexion 30s.
 */

import ws from 'k6/ws'
import { check, sleep } from 'k6'
import { Counter, Trend, Rate } from 'k6/metrics'
import { makeCanvasToken } from './lib/jwt.js'
import {
  buildSyncStep1,
  buildAuthMessage,
  isAuthenticated,
  isPermissionDenied,
  describeMessage,
} from './lib/protocol.js'

const JWT_SECRET = __ENV.JWT_SECRET || 'your-jwt-secret'
const WS_URL     = __ENV.WS_URL     || 'ws://localhost:8585'
const CANVAS_ID  = 'canvas-load-test'

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m',  target: 200 },
    { duration: '2m',  target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    'ws_connecting':        ['p(95)<500'],
    'auth_success_rate':    ['rate>0.99'],
    'connection_duration':  ['p(95)<35000'],
  },
}

const authSuccessRate  = new Rate('auth_success_rate')
const connectionTrend  = new Trend('connection_duration', true)
const authErrors       = new Counter('auth_errors')
const permDenied       = new Counter('permission_denied')

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

  const start = Date.now()
  let authenticated  = false

  const res = ws.connect(`${WS_URL}/${CANVAS_ID}`, {}, (socket) => {
    // Même flow que le provider : Auth en premier, SyncStep1 après Authenticated
    socket.on('open', () => {
      if (__ENV.DEBUG) console.log(`[VU${__VU}] connecté — envoi Auth`)
      socket.sendBinary(buildAuthMessage(CANVAS_ID, token))
    })

    socket.on('binaryMessage', (data) => {
      if (__ENV.DEBUG) console.log(`[VU${__VU}] reçu: ${describeMessage(data)}`)

      if (isPermissionDenied(data)) {
        permDenied.add(1)
        authErrors.add(1)
        socket.close()
        return
      }

      if (isAuthenticated(data)) {
        authenticated = true
        connectionTrend.add(Date.now() - start)
        socket.sendBinary(buildSyncStep1(CANVAS_ID))
      }
    })

    socket.on('error', (e) => {
      if (__ENV.DEBUG) console.log(`[VU${__VU}] erreur WS: ${e}`)
      authErrors.add(1)
    })

    socket.setTimeout(() => socket.close(), 30000)
  })

  check(res, { 'HTTP 101 Switching Protocols': (r) => r && r.status === 101 })
  authSuccessRate.add(authenticated)

  sleep(1)
}
