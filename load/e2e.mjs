// Test fonctionnel de bout en bout du chat du Mur, sur une stack réelle
// (core + canvas + Redis + Postgres + MinIO), LLM_PROVIDER=fake.
//   node load/e2e.mjs
//   E2E_LLM_DOWN=1 node load/e2e.mjs   (core avec LLM_PROVIDER=openai sans clé : scénario d'erreur)
// Variables : API_URL, CANVAS_URL, CANVAS_INTERNAL_SECRET, PG_CONTAINER (optionnel :
// nom d'un conteneur Postgres, active la vérification de la table et des lignes).
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { createWall, connectWall, exportWall, INTERNAL_SECRET, CANVAS_URL } from './lib/wall.mjs'

let failed = 0
const test = async (name, fn) => {
  try {
    await fn()
    console.log(`  ok   ${name}`)
  } catch (error) {
    failed++
    console.log(`  FAIL ${name}\n       ${error.message}`)
  }
}

const sql = (query) =>
  execFileSync(
    'docker',
    ['exec', process.env.PG_CONTAINER, 'psql', '-U', process.env.PG_USER ?? 'postgres', '-d', process.env.PG_DB ?? 'highfive', '-At', '-c', query],
    { encoding: 'utf8' }
  ).trim()

const isAssistant = (m) => m.isAssistant === true

const wall = await createWall('e2e')
const { session } = wall
const client = await connectWall(session)
const spectator = await connectWall(session)

if (process.env.E2E_LLM_DOWN) {
  // Core lancé avec LLM_PROVIDER=openai et sans OPENAI_API_KEY : l'erreur doit devenir un message.
  console.log('chat du Mur -> LLM indisponible')
  await test('un message d erreur français est posté à la place de la réponse, le worker survit', async () => {
    client.send('@ia bonjour')
    const reply = await client.waitFor(isAssistant)
    assert.match(reply.text, /pas configure|indisponible|Desole/)
    client.send('@ia encore')
    await client.waitFor((m) => isAssistant(m) && m.id !== reply.id)
  })
  client.close()
  spectator.close()
  process.exit(failed ? 1 : 0)
}

console.log('chat du Mur -> LLM (fake)')

await test('un message sans @ia est diffusé mais ne déclenche pas l assistant', async () => {
  client.send('bonjour tout le monde')
  await spectator.waitFor((m) => m.text === 'bonjour tout le monde')
  await new Promise((r) => setTimeout(r, 1500))
  assert.equal(client.received.filter(isAssistant).length, 0)
})

await test('@ia : la réponse de l assistant revient aux clients connectés', async () => {
  client.send('@ia fais un résumé')
  const reply = await spectator.waitFor(isAssistant)
  assert.match(reply.text, /^\[assistant simule\]/)
  assert.equal(reply.canvasId, session.canvasId)
  assert.ok(client.received.some(isAssistant), 'l auteur reçoit aussi la réponse')
})

await test('contextualisation : l historique (2 messages + la question) arrive au provider', async () => {
  const reply = client.received.find(isAssistant)
  assert.match(reply.text, /Contexte : 2 message\(s\)/) // 'bonjour…' + '@ia fais…'
  assert.match(reply.text, /@ia fais un résumé/)
})

await test('contextualisation : le tour suivant voit aussi la réponse précédente', async () => {
  client.send('@ia et maintenant ?')
  const reply = await client.waitFor((m) => isAssistant(m) && /et maintenant/.test(m.text))
  assert.match(reply.text, /Contexte : 4 message\(s\)/)
})

await test('la réponse est dans le document Yjs et dans l export interne', async () => {
  const exported = await exportWall(session.canvasId)
  assert.equal(exported.status, 200)
  const texts = exported.body.chat.map((m) => m.text)
  assert.ok(texts.includes('bonjour tout le monde'))
  assert.equal(exported.body.chat.filter(isAssistant).length, 2)
})

await test('endpoint interne : 401 sans secret, rejeu idempotent', async () => {
  const url = `${CANVAS_URL}/canvas/${session.canvasId}/chat`
  const body = JSON.stringify({
    id: 'e2e-direct-1',
    text: 'injecté',
    authorId: '00000000-0000-4000-8000-0000000000a1',
    timestamp: 1,
    isAssistant: true,
  })
  const headers = { 'content-type': 'application/json' }
  assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 401)
  const ok = { ...headers, 'x-internal-secret': INTERNAL_SECRET }
  assert.equal((await fetch(url, { method: 'POST', headers: ok, body })).status, 201)
  assert.equal((await fetch(url, { method: 'POST', headers: ok, body })).status, 200)
  await spectator.waitFor((m) => m.id === 'e2e-direct-1')
})

if (process.env.PG_CONTAINER) {
  await test('persistance : table wall_chat_messages présente et messages sauvegardés', async () => {
    assert.equal(sql("select to_regclass('public.wall_chat_messages') is not null"), 't')
    const rows = sql(`select role, count(*) from wall_chat_messages where project_id = '${wall.projectId}' group by role order by role`)
    assert.equal(rows, 'assistant|2\nuser|3')
  })
  await test('persistance : pas de doublon d id', async () => {
    assert.equal(sql(`select count(*) - count(distinct id) from wall_chat_messages where project_id = '${wall.projectId}'`), '0')
  })
} else {
  console.log('  (PG_CONTAINER absent : vérification en base sautée)')
}

client.close()
spectator.close()
console.log(failed ? `\n${failed} échec(s)` : '\ntout est vert')
process.exit(failed ? 1 : 0)
