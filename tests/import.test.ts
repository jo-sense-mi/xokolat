// IMPORTING — how a picture the app did not make becomes something you can reference.
//
// The design claim under test is one sentence from `src/types/request.ts`: **an upload is just an
// imported asset**. If that is true, an import must land in the library indistinguishably from a
// render — same folder shape, same embedded record, same index entry — and every test here is a
// version of that.

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import sharp from 'sharp'

import { buildIndex } from '../src/content/index.ts'
import { ImportError, importImage, sniffImage } from '../src/content/import.ts'
import { readMaster } from '../src/content/master.ts'
import { MAX_IMPORT_EDGE } from '../src/content/pixels.ts'
import type { Roots } from '../src/paths.ts'

async function library(): Promise<Roots> {
  const base = await mkdtemp(join(tmpdir(), 'xk-import-'))
  const roots = { content: join(base, 'lib'), data: join(base, 'data'), install: join(base, 'app') }
  await mkdir(roots.data, { recursive: true })
  await mkdir(roots.content, { recursive: true })
  return roots
}

const picture = (width = 64, height = 48, format: 'png' | 'jpeg' = 'png'): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: { r: 90, g: 140, b: 200 } } })[format]()
    .toBuffer()

test('what a file IS comes from its bytes, never from its name', async () => {
  assert.equal(sniffImage(await picture()), 'png')
  assert.equal(sniffImage(await picture(8, 8, 'jpeg')), 'jpeg')
  assert.equal(sniffImage(await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#fff' },
  }).webp().toBuffer()), 'webp')
  // ⚠️ A NAME IS THE SENDER'S OPINION. `evil.png` full of something else is refused here rather
  // than handed to a decoder to find out.
  assert.equal(sniffImage(Buffer.from('<?php echo "hi"; ?>')), null)
})

test('an import is a library asset, with a record saying nothing made it', async () => {
  const roots = await library()
  try {
    const out = await importImage(roots, { bytes: await picture(), filename: 'Grandma & cat.JPG' })
    // The run id is MINTED from the name, slugified — the browser never names a path (§15 rule 2).
    assert.match(out.runId, /^grandma-cat-\d{8}-\d{6}$/)
    assert.match(out.asset, /^media\/image\/grandma-cat-\d{8}-\d{6}\/import\.webp$/)

    const prov = await readMaster(join(roots.content, out.asset))
    assert.equal(prov?.provider, 'import')
    // ⚠️ NULL, NOT A PLACEHOLDER. Nothing rendered this, so there is no model, prompt or seed to
    // name — and the provenance chip draws what is there.
    assert.equal(prov?.model, null)
    assert.equal(prov?.prompt, null)
    assert.equal(prov?.seed, null)
    assert.deepEqual(prov?.refs, [])
    // Lossless, because an import is an INPUT: every render from it would inherit the artifacts.
    assert.equal(prov?.quality, 'lossless')
  } finally {
    await rm(roots.content, { recursive: true, force: true })
  }
})

test('the gallery finds it, because it is filed exactly like a render', async () => {
  const roots = await library()
  try {
    const out = await importImage(roots, { bytes: await picture(), filename: 'a photo.png' })
    const { manifest } = await buildIndex(roots, { full: true })
    const group = manifest.media.find((g) => g.run === out.runId)
    assert.ok(group, 'an import that is invisible in the library cannot be picked as a reference')
    // The ASK an import carries is where it came from — that is what the card prints under it.
    assert.equal(group.ask, 'a photo.png')
    assert.equal(group.cells.length, 1)
    assert.equal(group.cells[0]?.path, out.asset)
    assert.equal(group.cells[0]?.inference, 'import')
    // …and a rating key, so an import can be starred like anything else.
    assert.equal(group.cells[0]?.ratingKey, `image:${out.asset}`)
  } finally {
    await rm(roots.content, { recursive: true, force: true })
  }
})

test('a phone photograph is kept at a size a render can use', async () => {
  const roots = await library()
  try {
    const out = await importImage(roots, {
      bytes: await picture(MAX_IMPORT_EDGE * 2, MAX_IMPORT_EDGE), filename: 'huge.png',
    })
    // ⚠️ NOT A SAFETY LIMIT — a judgement about what this library is FOR. A reference is something
    // an engine starts from at 1024; forty megabytes of detail is thrown away by the first step.
    assert.equal(out.width, MAX_IMPORT_EDGE)
    assert.equal(out.height, MAX_IMPORT_EDGE / 2)
  } finally {
    await rm(roots.content, { recursive: true, force: true })
  }
})

test('what cannot be read is refused by name, and writes nothing', async () => {
  const roots = await library()
  try {
    await assert.rejects(
      () => importImage(roots, { bytes: Buffer.from('not a picture'), filename: 'x.png' }),
      ImportError)
    await assert.rejects(
      () => importImage(roots, { bytes: Buffer.alloc(0), filename: 'x.png' }), ImportError)
    assert.deepEqual(await readdir(roots.content), [], 'a refused import leaves no half-run behind')
  } finally {
    await rm(roots.content, { recursive: true, force: true })
  }
})
