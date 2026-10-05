// DELETING — the one operation in this app that cannot be taken back, so its edges are pinned
// here rather than discovered on someone's library.

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { RemoveError, removeAsset } from '../src/content/remove.ts'
import { STARS_FILE, readStars, setStar } from '../src/content/stars.ts'
import { resolveIn } from '../src/paths.ts'
import type { Roots } from '../src/paths.ts'

async function library(): Promise<Roots> {
  const base = await mkdtemp(join(tmpdir(), 'xk-remove-'))
  const roots = { content: join(base, 'lib'), data: join(base, 'data'), install: join(base, 'app') }
  await mkdir(roots.data, { recursive: true })
  return roots
}

const RUN = 'media/image/a-cat-20260803-120000'
// ⚠️ FLAT (2026-08-07). Masters are the run folder's own children, named for what made them —
// there is no cell folder, because there is no `count` for one to hold.
const A = 'draw-things-grpc--flux-2-klein-4b.webp'
const B = 'draw-things-grpc--sd-xl-base.webp'

async function seedRun(roots: Roots, names: readonly string[]): Promise<void> {
  await mkdir(join(roots.content, RUN), { recursive: true })
  await writeFile(join(roots.content, RUN, 'run.json'), '{"text":"a cat"}')
  for (const n of names) await writeFile(join(roots.content, RUN, n), 'not really a webp')
}

const gone = async (path: string): Promise<boolean> => {
  try { await stat(path); return false } catch { return true }
}

test('the asset goes, and the star with it', async () => {
  const roots = await library()
  try {
    await seedRun(roots, [A, B])
    const key = `image:${RUN}/${A}`
    await setStar(roots, key, true)
    await setStar(roots, `image:${RUN}/${B}`, true)

    const out = await removeAsset(roots, `${RUN}/${A}`, key)
    assert.equal(out.prunedRun, false, 'a sibling is still there, so the run stays')
    assert.ok(await gone(join(roots.content, RUN, A)))
    // ⚠️ The OTHER asset's star must survive. A delete that quietly clears the neighbours is
    // worse than one that leaves a stale key.
    assert.deepEqual(await readStars(roots), [`image:${RUN}/${B}`])
  } finally {
    await rm(join(roots.content, '..'), { recursive: true, force: true })
  }
})

test('the last asset takes the husk with it — run folder and run record', async () => {
  const roots = await library()
  try {
    await seedRun(roots, [A])
    const out = await removeAsset(roots, `${RUN}/${A}`, null)
    assert.equal(out.prunedRun, true)
    assert.ok(await gone(join(roots.content, RUN)), 'the run folder is gone')
    // A run record describing no assets is a card for a picture that is not there.
    assert.ok(await gone(join(roots.content, RUN, 'run.json')))
    // ...but the medium folder is structure, not content, and stays.
    assert.equal(await gone(join(roots.content, 'media', 'image')), false)
  } finally {
    await rm(join(roots.content, '..'), { recursive: true, force: true })
  }
})

test('a .DS_Store does not keep a dead run alive', async () => {
  // The Finder drops these into any folder the user opens — and 📁 reveal invites exactly that.
  const roots = await library()
  try {
    await seedRun(roots, [A])
    await writeFile(join(roots.content, RUN, '.DS_Store'), 'x')
    const out = await removeAsset(roots, `${RUN}/${A}`, null)
    assert.equal(out.prunedRun, true)
    assert.ok(await gone(join(roots.content, RUN)))
  } finally {
    await rm(join(roots.content, '..'), { recursive: true, force: true })
  }
})

test('nothing outside media/ is deletable, and nothing escapes the root', async () => {
  const roots = await library()
  try {
    await mkdir(roots.content, { recursive: true })
    await writeFile(join(roots.content, 'notes.txt'), 'mine')
    // ⚠️ SECURITY (PLAN §15 rule 2). The library is the user's folder and they may keep anything
    // in it; this endpoint only removes what the app itself produced.
    await assert.rejects(() => removeAsset(roots, 'notes.txt', null), RemoveError)
    await assert.rejects(() => removeAsset(roots, '../../etc/hosts', null), RemoveError)
    await assert.rejects(() => removeAsset(roots, 'media/../../secrets', null), RemoveError)
    assert.equal(await gone(join(roots.content, 'notes.txt')), false)
  } finally {
    await rm(join(roots.content, '..'), { recursive: true, force: true })
  }
})

test('deleting a folder, or something already gone, is refused rather than half-done', async () => {
  const roots = await library()
  try {
    await seedRun(roots, [A])
    await assert.rejects(() => removeAsset(roots, RUN, null), RemoveError)
    await assert.rejects(() => removeAsset(roots, `${RUN}/nobody--made-this.webp`, null), RemoveError)
    assert.equal(await gone(join(roots.content, RUN, A)), false)
  } finally {
    await rm(join(roots.content, '..'), { recursive: true, force: true })
  }
})

test('stars are a sorted array of keys, readable by hand', async () => {
  const roots = await library()
  try {
    await setStar(roots, 'image:b', true)
    await setStar(roots, 'image:a', true)
    await setStar(roots, 'image:b', false)
    assert.deepEqual(
      JSON.parse(await readFile(join(roots.data, STARS_FILE), 'utf-8')) as unknown,
      ['image:a'],
    )
    // Unstarring something that was never starred is not an error.
    await setStar(roots, 'image:never', false)
    assert.deepEqual(await readStars(roots), ['image:a'])
  } finally {
    await rm(join(roots.content, '..'), { recursive: true, force: true })
  }
})

test('a master takes its sidecars with it', async () => {
  // ⚠️ THE FILES NO FEED SHOWS. A `<stem>.gen.json` holds the provenance of a master that cannot
  // carry its own, and a `<stem>.preview.png` is the still the browser drew of a mesh. Neither is a
  // master, so neither appears anywhere — and leaving them behind means invisible files that also
  // keep `isHusk` from ever pruning the run they are the last thing in.
  const roots = await library()
  const dir = resolveIn(roots.content, 'media/model3d/a-helmet-20260830-120000')
  await mkdir(dir, { recursive: true })
  await writeFile(resolveIn(dir, 'comfyui--hunyuan.glb'), 'mesh')
  await writeFile(resolveIn(dir, 'comfyui--hunyuan.gen.json'), '{}')
  await writeFile(resolveIn(dir, 'comfyui--hunyuan.preview.png'), 'png')
  // A second master in the same run: its sidecar must NOT go with the first one's.
  await writeFile(resolveIn(dir, 'comfyui--other.glb'), 'mesh')
  await writeFile(resolveIn(dir, 'comfyui--other.gen.json'), '{}')
  await writeFile(resolveIn(dir, 'run.json'), '{}')

  const out = await removeAsset(roots, 'media/model3d/a-helmet-20260830-120000/comfyui--hunyuan.glb', null)
  assert.equal(out.prunedRun, false, 'the other master is still there')
  assert.deepEqual((await readdir(dir)).sort(),
    ['comfyui--other.gen.json', 'comfyui--other.glb', 'run.json'])

  // And when the last master goes, the run goes — which it could not have while a png sat in it.
  const last = await removeAsset(roots, 'media/model3d/a-helmet-20260830-120000/comfyui--other.glb', null)
  assert.equal(last.prunedRun, true)
})
