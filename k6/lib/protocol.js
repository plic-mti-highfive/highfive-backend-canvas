/**
 * Helpers pour le protocole binaire Hocuspocus.
 *
 * IMPORTANT : chaque message commence par varstring(documentName)
 * suivi du messageType puis du contenu. Côté serveur c'est identique.
 *
 * MessageType : Sync=0 Awareness=1 Auth=2 Stateless=5 BroadcastStateless=6
 * AuthMessageType : Token=0 PermissionDenied=1 Authenticated=2
 */

// ─── encodage ─────────────────────────────────────────────────────────────────

function encodeVarint(n) {
  const bytes = []
  while (n > 127) {
    bytes.push((n & 0x7f) | 0x80)
    n >>>= 7
  }
  bytes.push(n & 0x7f)
  return bytes
}

function encodeVarString(s) {
  const utf8 = []
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code < 128) {
      utf8.push(code)
    } else if (code < 2048) {
      utf8.push((code >> 6) | 192, (code & 63) | 128)
    } else {
      utf8.push((code >> 12) | 224, ((code >> 6) & 63) | 128, (code & 63) | 128)
    }
  }
  return [...encodeVarint(utf8.length), ...utf8]
}

// ─── décodage ────────────────────────────────────────────────────────────────

/** Lit un varint depuis bytes à partir de offset. Retourne [valeur, nouvelOffset]. */
function readVarint(bytes, offset) {
  let n = 0, shift = 0, b
  do {
    b = bytes[offset++]
    n |= (b & 0x7f) << shift
    shift += 7
  } while (b & 0x80)
  return [n, offset]
}

/**
 * Saute le prefixe documentName d'un message serveur.
 * Retourne l'offset juste après le nom (= position du messageType).
 */
function skipDocumentName(bytes) {
  const [nameLen, afterLen] = readVarint(bytes, 0)
  return afterLen + nameLen
}

// ─── construction des messages client → serveur ───────────────────────────────

/**
 * SyncStep1 — premier message envoyé dès la connexion.
 * Format : varstring(documentName) | 0x00 (Sync) | 0x00 (Step1) | 0x01 0x00 (sv vide)
 */
export function buildSyncStep1(documentName) {
  const nameBytes = encodeVarString(documentName)
  return new Uint8Array([...nameBytes, 0, 0, 1, 0]).buffer
}

/**
 * Auth/Token — réponse au TokenSyncRequest du serveur.
 * Format : varstring(documentName) | 0x02 (Auth) | 0x00 (Token) | varstring(token)
 */
export function buildAuthMessage(documentName, token) {
  const nameBytes = encodeVarString(documentName)
  const tokenBytes = encodeVarString(token)
  return new Uint8Array([...nameBytes, 2, 0, ...tokenBytes]).buffer
}

/**
 * Stateless — message de chat ou autre payload JSON.
 * Format : varstring(documentName) | 0x05 (Stateless) | varstring(payload)
 */
export function buildStatelessMessage(documentName, payload) {
  const nameBytes = encodeVarString(documentName)
  const payloadBytes = encodeVarString(payload)
  return new Uint8Array([...nameBytes, 5, ...payloadBytes]).buffer
}

// ─── inspection des messages serveur → client ─────────────────────────────────

/** Auth/TokenSyncRequest : messageType=2, authType=0 */
export function isTokenSyncRequest(buffer) {
  const bytes = new Uint8Array(buffer)
  const offset = skipDocumentName(bytes)
  return bytes[offset] === 2 && bytes[offset + 1] === 0
}

/** Auth/Authenticated : messageType=2, authType=2 */
export function isAuthenticated(buffer) {
  const bytes = new Uint8Array(buffer)
  const offset = skipDocumentName(bytes)
  return bytes[offset] === 2 && bytes[offset + 1] === 2
}

/** Auth/PermissionDenied : messageType=2, authType=1 */
export function isPermissionDenied(buffer) {
  const bytes = new Uint8Array(buffer)
  const offset = skipDocumentName(bytes)
  return bytes[offset] === 2 && bytes[offset + 1] === 1
}

/** Résumé lisible d'un message reçu (pour debug). */
export function describeMessage(buffer) {
  const bytes = new Uint8Array(buffer)
  const offset = skipDocumentName(bytes)
  const types = {
    0: 'Sync', 1: 'Awareness', 2: 'Auth', 3: 'QueryAwareness',
    4: 'SyncReply', 5: 'Stateless', 6: 'BroadcastStateless', 7: 'Close', 8: 'SyncStatus',
  }
  const authTypes = { 0: 'TokenSyncRequest', 1: 'PermissionDenied', 2: 'Authenticated' }
  const msgType = types[bytes[offset]] || `Unknown(${bytes[offset]})`
  if (bytes[offset] === 2 && bytes.length > offset + 1) {
    return `Auth/${authTypes[bytes[offset + 1]] || bytes[offset + 1]} len=${bytes.length}`
  }
  return `${msgType} len=${bytes.length}`
}
