import crypto from 'k6/crypto'
import encoding from 'k6/encoding'

function b64url(input) {
  const b64 = typeof input === 'string'
    ? encoding.b64encode(input, 'rawurl')
    : encoding.b64encode(input, 'rawurl')
  return b64.replace(/=/g, '')
}

/**
 * Génère un JWT HS256 signable directement dans K6.
 * @param {object} payload
 * @param {string} secret  - doit correspondre à JWT_SECRET du serveur
 */
export function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const signingInput = `${header}.${body}`
  const sig = crypto.hmac('sha256', secret, signingInput, 'binary')
  return `${signingInput}.${b64url(sig)}`
}

/**
 * Génère un token canvas valide pour les tests.
 */
export function makeCanvasToken({ userId, tenantId, projectId, canvasId, role = 'editor', secret }) {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 3600
  return signJwt({ userId, tenantId, projectId, canvasId, role, iat, exp }, secret)
}
