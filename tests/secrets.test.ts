// KEYS. Every test here is about a boundary rather than a behaviour: which file it lands in, who
// can read that file, and what a browser is allowed to learn about it.

import assert from 'node:assert/strict'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { headersFor } from '../src/inference/openai/adapter.ts'
import { parseInferenceRow } from '../src/inference/registry.ts'
import { readShelf } from '../src/inference/shelf.ts'
import { SECRETS_FILE, readSecret, saveSecret, secretsSet } from '../src/secrets.ts'
import type { InferenceRow } from '../src/types/inference.ts'
import { ctx } from '../src/validate.ts'

async function tempRoots() {
  const dir = await mkdtemp(join(tmpdir(), 'xk-secrets-'))
  return { roots: { data: dir, content: dir, install: dir }, dir }
}

const row = (v: unknown) => {
  const c = ctx('test')
  return { row: parseInferenceRow(c, v, 'services[0]'), issues: c.issues }
}

const CLOUD = {
  id: 'openrouter',
  role: 'brain',
  launch: { mode: 'external' },
  transport: {
    kind: 'openai', host: 'openrouter.ai', port: 443, basePath: '/api/v1', tls: true,
    auth: { secret: 'openrouter' },
  },
  health: { kind: 'tcp', timeoutMs: 2000 },
}

test('a key round-trips, and forgetting it removes the entry', async () => {
  const { roots, dir } = await tempRoots()
  try {
    await saveSecret(roots, 'openrouter', 'sk-or-v1-abc')
    assert.equal(await readSecret(roots, 'openrouter'), 'sk-or-v1-abc')
    assert.deepEqual(await secretsSet(roots), ['openrouter'])
    await saveSecret(roots, 'openrouter', null)
    assert.equal(await readSecret(roots, 'openrouter'), null)
    assert.deepEqual(await secretsSet(roots), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the store is owner-only, and STAYS owner-only on rewrite', async () => {
  // ⚠️ `writeFile` applies a mode only when it CREATES the file. Without the explicit chmod a store
  // that was somehow world-readable would stay world-readable for the rest of its life.
  const { roots, dir } = await tempRoots()
  try {
    await writeFile(join(dir, SECRETS_FILE), '{"secrets":{}}', { mode: 0o644 })
    await saveSecret(roots, 'openrouter', 'sk-or-v1-abc')
    const mode = (await stat(join(dir, SECRETS_FILE))).mode & 0o777
    assert.equal(mode, 0o600, `mode is ${mode.toString(8)}`)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a machine with no cloud service has no key file, and that is not an error', async () => {
  const { roots, dir } = await tempRoots()
  try {
    assert.deepEqual(await secretsSet(roots), [])
    assert.equal(await readSecret(roots, 'anything'), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the shelf says whether a key is set, and never what it is', async () => {
  const parsed = row(CLOUD).row
  assert.ok(parsed)
  const registry = {
    rows: [parsed], source: new Map(), patched: new Map(), patchedEngines: new Map(),
    patchedWorkflows: new Map(), layers: [], issues: [],
  }
  const [without] = await readShelf(registry, [])
  const [with_] = await readShelf(registry, ['openrouter'])
  assert.deepEqual(without?.secret, { id: 'openrouter', set: false })
  assert.deepEqual(with_?.secret, { id: 'openrouter', set: true })
  // The whole row, serialised as the API sends it, contains no key-shaped thing.
  assert.ok(!JSON.stringify(with_).includes('sk-'))
})

test('a key never goes in the registry, and saying so is the point', () => {
  const { issues } = row({
    ...CLOUD,
    transport: { ...CLOUD.transport, auth: { secret: 'openrouter', key: 'sk-or-v1-abc' } },
  })
  assert.ok(issues.some((i) => i.includes('a key never goes in the registry')), issues.join('\n'))
})

test('a key sent to another machine over plain http is refused', () => {
  const { issues } = row({
    ...CLOUD,
    transport: { kind: 'openai', host: 'openrouter.ai', port: 80, auth: { secret: 'x' } },
  })
  assert.ok(issues.some((i) => i.includes('tls')), issues.join('\n'))
  // …and the same row on this machine is fine, because there is no wire.
  const local = row({
    ...CLOUD,
    transport: { kind: 'openai', host: '127.0.0.1', port: 1234, auth: { secret: 'x' } },
  })
  assert.deepEqual(local.issues, [])
})

test('a command row has no key at all — that is the whole point of a subscription', () => {
  const { issues } = row({
    id: 'claude-code', role: 'brain', launch: { mode: 'external' },
    transport: { kind: 'cli', brain: 'claude', auth: { secret: 'anthropic' } },
    health: { kind: 'command', timeoutMs: 8000 },
  })
  assert.ok(issues.some((i) => i.includes('a command has no endpoint')), issues.join('\n'))
})

test('the key rides where the row says, and a missing one is named before the call', async () => {
  const { roots, dir } = await tempRoots()
  try {
    const bearer = row(CLOUD).row as InferenceRow
    await assert.rejects(headersFor(bearer, roots), /needs its openrouter key/)
    await saveSecret(roots, 'openrouter', 'sk-or-v1-abc')
    assert.deepEqual(await headersFor(bearer, roots), { authorization: 'Bearer sk-or-v1-abc' })

    const named = row({
      ...CLOUD,
      transport: { ...CLOUD.transport, auth: { secret: 'openrouter', header: 'x-api-key' } },
    }).row as InferenceRow
    assert.deepEqual(await headersFor(named, roots), { 'x-api-key': 'sk-or-v1-abc' })

    // A row that wants nothing gets nothing added — every local service.
    const local = row({
      id: 'ollama', role: 'brain', launch: { mode: 'external' },
      transport: { kind: 'openai', host: '127.0.0.1', port: 11434, basePath: '/v1' },
      health: { kind: 'tcp', timeoutMs: 500 },
    }).row as InferenceRow
    assert.deepEqual(await headersFor(local, roots, { 'content-type': 'application/json' }),
      { 'content-type': 'application/json' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('tls decides the scheme, and it is declared rather than read off the port', async () => {
  const { baseUrl } = await import('../src/inference/openai/adapter.ts')
  assert.equal(baseUrl(row(CLOUD).row as InferenceRow), 'https://openrouter.ai:443/api/v1')
  const plain = row({
    id: 'ollama', role: 'brain', launch: { mode: 'external' },
    transport: { kind: 'openai', host: '127.0.0.1', port: 11434, basePath: '/v1' },
    health: { kind: 'tcp', timeoutMs: 500 },
  }).row as InferenceRow
  assert.equal(baseUrl(plain), 'http://127.0.0.1:11434/v1')
})

test('a public model list is asked WITHOUT a key rather than refused for want of one', async () => {
  // The picker fills in before the key does, where the endpoint allows it. Whether it allows it is
  // the endpoint's business — asked, not assumed, and its own 401 is the answer if not.
  const { roots, dir } = await tempRoots()
  try {
    const cloud = row(CLOUD).row as InferenceRow
    assert.deepEqual(await headersFor(cloud, roots, {}, { need: false }), {})
    await saveSecret(roots, 'openrouter', 'sk-or-v1-abc')
    assert.deepEqual(await headersFor(cloud, roots, {}, { need: false }),
      { authorization: 'Bearer sk-or-v1-abc' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
