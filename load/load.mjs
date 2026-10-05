// Test de charge du chat du Mur : N Murs (projets) simultanés, chacun avec un
// ou plusieurs clients WebSocket Hocuspocus qui envoient des messages `@ia` en
// parallèle. Mesure le délai message -> réponse de l'assistant (diffusée sur le
// WebSocket), le débit et les erreurs. LLM : à lancer avec LLM_PROVIDER=fake.
//
//   node load/load.mjs [--walls 20] [--messages 5] [--clients 1] [--think 0]
//                      [--timeout 30000] [--setup-concurrency 5] [--json out.json]
//
// Pour un Mur, les `--clients` clients envoient en parallèle ; chaque client
// attend la réponse à son message avant d'en envoyer un autre. La réponse est
// rattachée à son message par ordre d'arrivée (file FIFO par Mur), ce qui est
// exact avec 1 client par Mur et approximatif au-delà (le provider fake ne
// renvoie pas l'id du message d'origine).
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { createWall, connectWall, exportWall, percentile } from './lib/wall.mjs'

const { values: opt } = parseArgs({
  options: {
    walls: { type: 'string', default: '20' },
    messages: { type: 'string', default: '5' },
    clients: { type: 'string', default: '1' },
    think: { type: 'string', default: '0' },
    timeout: { type: 'string', default: '30000' },
    'setup-concurrency': { type: 'string', default: '5' },
    json: { type: 'string' },
  },
})
const WALLS = Number(opt.walls)
const MESSAGES = Number(opt.messages)
const CLIENTS = Number(opt.clients)
const THINK = Number(opt.think)
const TIMEOUT = Number(opt.timeout)
const SETUP_CONCURRENCY = Number(opt['setup-concurrency'])

const errors = { setup: 0, timeout: 0, connection: 0, mismatch: 0 }
const latencies = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 1. Préparation (non mesurée) : comptes, projets, sessions, connexions.
console.log(`préparation de ${WALLS} Mur(s) x ${CLIENTS} client(s)...`)
const walls = []
{
  let next = 0
  const worker = async () => {
    while (next < WALLS) {
      const index = next++
      try {
        const wall = await createWall('load')
        // Un seul client par Mur peut utiliser le jeton de l'owner : tous partagent la session.
        const clients = []
        for (let c = 0; c < CLIENTS; c++) clients.push(await connectWall(wall.session))
        walls.push({ wall, clients, index })
      } catch (error) {
        errors.setup++
        console.error(`  Mur ${index} : ${error.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: SETUP_CONCURRENCY }, worker))
}
console.log(`${walls.length}/${WALLS} Mur(s) prêt(s)`)

// 2. Charge : tous les Murs et clients en parallèle.
const startedAt = Date.now()
let sent = 0
let answered = 0

const runClient = async ({ wall, clients }, client, clientIndex) => {
  for (let i = 0; i < MESSAGES; i++) {
    const baseline = client.received.filter((m) => m.isAssistant).length
    const text = `@ia question ${clientIndex}-${i} sur ${wall.slug}`
    const t0 = performance.now()
    client.send(text)
    sent++
    try {
      await client.waitFor(
        () => client.received.filter((m) => m.isAssistant).length > baseline,
        TIMEOUT
      )
      latencies.push(performance.now() - t0)
      answered++
    } catch {
      errors.timeout++
    }
    if (THINK) await sleep(THINK)
  }
}

await Promise.all(
  walls.flatMap((entry) => entry.clients.map((client, ci) => runClient(entry, client, ci)))
)
const durationS = (Date.now() - startedAt) / 1000

// 3. Cohérence : chaque Mur doit contenir exactement CLIENTS*MESSAGES réponses.
await sleep(500)
for (const { wall } of walls) {
  const { body } = await exportWall(wall.session.canvasId)
  const replies = body.chat.filter((m) => m.isAssistant).length
  const users = body.chat.filter((m) => !m.isAssistant).length
  if (replies !== CLIENTS * MESSAGES || users !== CLIENTS * MESSAGES) errors.mismatch++
}
walls.forEach(({ clients }) => clients.forEach((c) => c.close()))

latencies.sort((a, b) => a - b)
const mean = latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1)
const summary = {
  walls: walls.length,
  clientsPerWall: CLIENTS,
  messagesPerClient: MESSAGES,
  sent,
  answered,
  durationS: Number(durationS.toFixed(2)),
  throughputRepliesPerS: Number((answered / durationS).toFixed(2)),
  latencyMs: {
    p50: Math.round(percentile(latencies, 50)),
    p95: Math.round(percentile(latencies, 95)),
    p99: Math.round(percentile(latencies, 99)),
    mean: Math.round(mean),
    max: Math.round(latencies.at(-1) ?? NaN),
  },
  errors,
  ...(CLIENTS > 1
    ? { note: 'clients > 1 : le délai est un minorant (une réponse destinée à un autre client peut débloquer l attente)' }
    : {}),
}
console.log(JSON.stringify(summary, null, 2))
if (opt.json) writeFileSync(opt.json, JSON.stringify(summary, null, 2))
const failed = errors.setup + errors.timeout + errors.mismatch > 0
process.exit(failed ? 1 : 0)
