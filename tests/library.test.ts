// TAKING THINGS FROM THE LIBRARY — the envelope reader, and the real published files.
//
// ⚠️ THE SECOND HALF OF THIS FILE IS THE POINT. It reads `../xokolat-web/dist` — the ACTUAL built
// site, catalog and all — and puts every published file through the reader. It is offline, it takes
// about a second, and it answers the only question that matters while the two repos are being
// joined: does what we defined over there arrive properly over here? All of it at once, rather than
// one paste at a time through a UI that does not exist yet.
//
// It SKIPS when the sibling checkout is absent, because a stranger cloning this repo has no site to
// point at and a failure would tell them nothing about their machine.

import { MEDIA } from '../src/types/medium.ts'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { SERVICE_PRESETS } from '../src/inference/presets.ts'
import { loadCompositions } from '../src/compositions/registry.ts'
import { loadInferenceRegistry } from '../src/inference/registry.ts'
import { DEFAULT_LIBRARY, resolveLibrary } from '../src/library/origin.ts'
import { LIBRARY_FORMAT, PayloadError, readPayload } from '../src/library/payload.ts'
import type { Reported } from '../src/library/catalog.ts'
import { forgetLibrary, libraryReach, readLibrary, readLibraryStyles } from '../src/library/catalog.ts'
import { take, takeMany } from '../src/library/take.ts'
import type { Roots } from '../src/paths.ts'
import { resolveRoots } from '../src/paths.ts'
import { loadStyles } from '../src/styles/registry.ts'
import { holdings } from '../src/xoko/here.ts'

const STYLE = {
  format: LIBRARY_FORMAT,
  type: 'style',
  medium: 'image',
  style: {
    slug: 'ink-linework',
    label: 'ink linework',
    tags: ['line art drawing', '{prompt}', 'black ink'],
    negative: 'photo, 3d render',
  },
}

const WORKFLOW = {
  format: LIBRARY_FORMAT,
  type: 'workflow',
  service: 'draw-things-grpc',
  workflow: {
    slug: 'sdxl-face', label: 'keep this face', kind: 'ref',
    model: 'sd_xl_base_1.0_q6p_q8p.ckpt', inputs: ['prompt', 'ref'],
    controls: [{ file: 'ip_adapter_plus_face_xl_base_open_clip_h14_f16.ckpt', from: 'ref', inputType: 'Shuffle', weight: 0.8 }],
  },
  engine: { file: 'sd_xl_base_1.0_q6p_q8p.ckpt', label: 'SDXL base 1.0', memory: 8 },
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** `assert.throws` hands back nothing, and every refusal here is worth reading rather than merely
 *  counting: a reader that refuses the right file for the wrong reason is a reader that will refuse
 *  the wrong file one day and say something plausible about it. */
function refusal(fn: () => unknown): PayloadError {
  try {
    fn()
  } catch (err) {
    assert.ok(err instanceof PayloadError, `refused with ${(err as Error).name}, not PayloadError`)
    return err as PayloadError
  }
  assert.fail('expected a refusal, got a payload')
}

/** The same, for the half that touches the network and the disk. */
async function refusalAsync(fn: () => Promise<unknown>): Promise<PayloadError> {
  try {
    await fn()
  } catch (err) {
    assert.ok(err instanceof PayloadError, `refused with ${(err as Error).name}: ${(err as Error).message}`)
    return err as PayloadError
  }
  assert.fail('expected a refusal, got a take')
}

// ── the envelope ──────────────────────────────────────────────────────────────

test('a style arrives as the same object the style editor would have saved', () => {
  const got = readPayload(clone(STYLE))
  assert.equal(got.type, 'style')
  if (got.type !== 'style') return
  assert.equal(got.medium, 'image')
  assert.equal(got.style.slug, 'ink-linework')
  // `medium` rides on the resolved style, which is what every style surface expects to be handed.
  assert.equal(got.style.medium, 'image')
})

test('a workflow arrives as the partial row the service writer takes', () => {
  const got = readPayload(clone(WORKFLOW))
  assert.equal(got.type, 'workflow')
  if (got.type !== 'workflow') return
  assert.equal(got.service, 'draw-things-grpc')
  // `{ id, workflows, engines }` and nothing else: a downloaded file may not name a transport.
  assert.deepEqual(Object.keys(got.row).sort(), ['engines', 'id', 'workflows'])
  assert.equal(got.row.id, 'draw-things-grpc')
  assert.equal(got.row.workflows?.[0]?.slug, 'sdxl-face')
  assert.equal(got.row.engines?.[0]?.file, 'sd_xl_base_1.0_q6p_q8p.ckpt')
})

test('a workflow with no engine beside it is still a workflow', () => {
  const { engine: _drop, ...rest } = clone(WORKFLOW)
  const got = readPayload(rest)
  assert.equal(got.type, 'workflow')
  if (got.type !== 'workflow') return
  assert.equal(got.row.engines, undefined)
})

test('a format this app does not know is refused as a version, not as a broken file', () => {
  const err = refusal(() => readPayload({ ...clone(STYLE), format: 2 }))
  assert.match(err.message, /format 2/)
  assert.match(err.message, /newer library needs a newer app/)
})

test('the format is read before anything else, so an old app says so first', () => {
  // Format 9 AND no type at all. The complaint must be the version — reporting the missing field
  // would send somebody hunting for a typo in a file that is simply from the future.
  assert.match(refusal(() => readPayload({ format: 9 })).message, /format 9/)
})

test('a composition is read whole — and its graph is checked, not just its shape', () => {
  const chain = {
    format: LIBRARY_FORMAT,
    type: 'composition',
    composition: {
      slug: 'a-family-from-one-face',
      label: 'a family from one face',
      family: 'mascots',
      steps: [
        { id: 'brief', makes: 'text', inputs: { prompt: 'ask' }, says: 'Describe one character.' },
        { id: 'candidates', makes: 'image', repeat: 12, inputs: { prompt: 'brief' } },
        { id: 'founder', pick: 'candidates', asks: 'Which one is the character?' },
        { id: 'cast', makes: 'image', repeat: 4, inputs: { prompt: 'ask', ref: 'founder' } },
      ],
    },
    workflows: {},
  }
  const got = readPayload(chain)
  assert.equal(got.type, 'composition')
  assert.equal(got.type === 'composition' && got.composition.steps.length, 4)

  // ⚠️ THE FAILURE THIS PARSER EXISTS FOR. A step reading a LATER one is a chain that runs three
  // presses and then stops on a name nothing has produced — and by then twelve pictures are on
  // the disk. It is a refusal at read time, before anything is written.
  const forward = clone(chain) as typeof chain & { composition: { steps: Record<string, unknown>[] } }
  forward.composition.steps[1]!['inputs'] = { prompt: 'cast' }
  assert.match(refusal(() => readPayload(forward)).message, /nothing before this step is called "cast"/)

  // …and a pick that chooses from a step which makes nothing.
  const nothing = clone(chain) as typeof chain & { composition: { steps: Record<string, unknown>[] } }
  nothing.composition.steps[2]!['pick'] = 'nowhere'
  assert.match(refusal(() => readPayload(nothing)).message, /nothing before this step presses "nowhere"/)
})

test('a bundled file that is not a workflow is refused — a composition is not a second door', () => {
  const err = refusal(() => readPayload({
    format: LIBRARY_FORMAT,
    type: 'composition',
    composition: { slug: 'x', steps: [{ id: 'a', makes: 'image', inputs: { prompt: 'ask' } }] },
    workflows: { 'image/ink-linework': clone(STYLE) },
  }))
  assert.match(err.message, /which is a style and not a workflow/)
})

test('a type nobody publishes is refused with the list of the ones that are', () => {
  assert.match(refusal(() => readPayload({ format: LIBRARY_FORMAT, type: 'universe' })).message,
    /workflow · style · composition/)
})

test('a stray field in the envelope is refused, not ignored', () => {
  refusal(() => readPayload({ ...clone(STYLE), transport: { kind: 'grpc', host: 'evil.example', port: 1 } }))
})

test('the inner object meets the parser the app already has', () => {
  // ⚠️ A SLOT IS CLOSED AND A KIND IS NOT, and this is the one place both facts matter at once. The
  // app takes any `kind` on purpose — a kinds registry, not an enum, because somebody adding a
  // service is exactly the person who needs a verb this build never heard of — so `remix` is legal
  // here and would land. `inputs` is the opposite: a slot nothing recognises can never be filled,
  // so it is refused. (The LIBRARY refuses an unknown kind, on its own editorial grounds: it should
  // not publish a verb the app has no gloss for. Both are right, and they are different questions.)
  const slot = clone(WORKFLOW)
  slot.workflow.inputs = ['prompt', 'vibe']
  refusal(() => readPayload(slot))

  // A style that adds no words at all does nothing, and the style editor refuses it too.
  const empty = clone(STYLE)
  delete (empty.style as Record<string, unknown>)['tags']
  refusal(() => readPayload(empty))

  // `random` is reserved everywhere a style is accepted — including here.
  const reserved = clone(STYLE)
  reserved.style.slug = 'random'
  refusal(() => readPayload(reserved))

  // A control pointed at a slot its workflow does not take is an adapter wired to a picture nobody
  // can attach — it fails silently at render time, so it is refused at read time.
  const wired = clone(WORKFLOW)
  wired.workflow.controls[0]!.from = 'look'
  refusal(() => readPayload(wired))
})

test('a workflow carrying no workflow is refused rather than landing as an empty override', () => {
  refusal(() => readPayload({
    format: LIBRARY_FORMAT, type: 'workflow', service: 'draw-things-grpc', workflow: undefined,
  }))
})

// ── where the library is ──────────────────────────────────────────────────────

test('the library is the published one unless the environment says otherwise', () => {
  const before = process.env['XOKOLAT_LIBRARY']
  try {
    delete process.env['XOKOLAT_LIBRARY']
    assert.equal(resolveLibrary(), DEFAULT_LIBRARY)

    process.env['XOKOLAT_LIBRARY'] = 'http://127.0.0.1:8080/'
    assert.equal(resolveLibrary(), 'http://127.0.0.1:8080', 'the trailing slash comes off')

    // ⚠️ REFUSED, NEVER FALLEN BACK FROM. Quietly reverting to the published site would mean
    // reading results from the wrong library as though they were about the local one.
    process.env['XOKOLAT_LIBRARY'] = 'xoko.lat'
    assert.throws(() => resolveLibrary(), /must be a URL/)
    process.env['XOKOLAT_LIBRARY'] = 'file:///etc/passwd'
    assert.throws(() => resolveLibrary(), /must be http or https/)
  } finally {
    if (before === undefined) delete process.env['XOKOLAT_LIBRARY']
    else process.env['XOKOLAT_LIBRARY'] = before
  }
})

// ── taking one ────────────────────────────────────────────────────────────────
//
// ⚠️ A REAL HTTP SERVER, not a stubbed fetch. Taking is "reach the library, follow its catalog,
// write what came back", and two of those three are the network — a mock would leave the catalog
// hop and the origin check untested, which is where the mistakes are.

/** A library, small enough to read: two catalogs and the files they point at. */
function libraryServer(files: Record<string, unknown>): Promise<{
  origin: string; close: () => Promise<void>
}> {
  const server = createServer((req, res) => {
    const body = files[(req.url ?? '').split('?')[0] ?? '']
    if (body === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      return void res.end('nope')
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      done({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((shut) => server.close(() => shut())),
      })
    })
  })
}

const SHIPPED_APP = {
  services: [{
    id: 'draw-things-grpc',
    label: 'Draw Things (gRPC)',
    transport: { kind: 'grpc', host: '127.0.0.1', port: 7859 },
    caps: { negatives: true, idiom: 'prose' },
  }],
}

const published = (
  id: string, payload: unknown, path: string, extra: Record<string, unknown> = {},
): { item: Record<string, unknown>; payload: unknown; path: string } =>
  ({ item: { id, path, ...extra }, payload, path })

/** An app with one service row and nothing else — a fresh install, which is the state every take
 *  will actually happen in once the shipped content is deleted. */
async function freshApp({ empty = false }: { empty?: boolean } = {}): Promise<Roots> {
  const base = await mkdtemp(join(tmpdir(), 'xk-take-'))
  const roots: Roots = {
    content: join(base, 'lib'), data: join(base, 'data'), install: join(base, 'app'),
  }
  await mkdir(join(roots.install, 'registries'), { recursive: true })
  // ⚠️ `empty` IS WHAT THE REAL APP SHIPS (registries/inference.json — `services: []`). The
  // one-row fixture predates that and stays because most of these tests are about what happens ON
  // a service row; the empty one is for the tests that are about there not being one.
  await writeFile(join(roots.install, 'registries', 'inference.json'),
    JSON.stringify(empty ? { services: [] } : SHIPPED_APP))
  // ⚠️ THE KIND SAYS WHAT A WORKFLOW MAKES, NOT THE ROW — and without this file every workflow here
  // fell back to the service's own medium, which put a picture-in workflow on the image shelf and
  // made the two-workflows-one-medium case untestable.
  //
  // ⚠️ 🧊 model3d CARRIES THAT CASE NOW (2026-08-29). It was ✒ vector, which is where the bug was
  // found and which is no longer a medium — an SVG is markup, so xoko writes it and the chain files
  // it (src/types/composition.ts, BINDS). The shape these tests are about was never vector's: it is
  // ANY medium reachable two ways, one of which needs a picture nothing can put on the tray.
  await writeFile(join(roots.install, 'registries', 'kinds.json'), JSON.stringify({
    kinds: [
      { slug: 't2i', medium: 'image', face: 'from words alone' },
      { slug: 'ref23d', medium: 'model3d', face: 'a picture you attach, lifted into a mesh' },
      { slug: 't23d', medium: 'model3d', face: 'a mesh from words' },
    ],
  }))
  // No `styles/` in the install: an empty seed is the fresh-install case, and a taken style must
  // be the first entry in a list that did not exist.
  return roots
}

const workflowPayload = (slug: string, model: string, engine = true): unknown => ({
  format: LIBRARY_FORMAT,
  type: 'workflow',
  service: 'draw-things-grpc',
  workflow: { slug, label: `the ${slug} one`, kind: 't2i', model, inputs: ['prompt'] },
  ...(engine ? { engine: { file: model, label: model, memory: 8 } } : {}),
})

const VOICE_PAYLOAD = {
  format: LIBRARY_FORMAT,
  type: 'style',
  medium: 'voice',
  style: {
    slug: 'old-sailor',
    label: 'old sailor',
    notes: 'Weathered, low, and in no hurry whatsoever.',
    positive: 'an old man\'s voice, deep and weathered and gravelly, speaking slowly',
    seed: 1301,
  },
}

const STYLE_PAYLOAD = {
  format: LIBRARY_FORMAT,
  type: 'style',
  medium: 'image',
  style: { slug: 'ink-linework', label: 'ink linework', tags: ['black ink'] },
}

/** One library with everything these tests take, plus the catalogs that address it. */
/**
 * @param empty   ship NO service rows — the fresh-install state, where a bundled workflow has
 *                nowhere to land until a preset is added for it
 * @param orphan  bundle a workflow for a service this build ships no preset for
 */
async function stage({ empty = false, orphan = false }: { empty?: boolean; orphan?: boolean } = {}): Promise<{
  roots: Roots; origin: string; done: () => Promise<void>
}> {
  // ⚠️ THE CATALOG FACETS ARE THE SITE'S, and 📚 reads them rather than the payloads: the whole
  // point of a catalog is that browsing 500 items is one fetch, not 500.
  const facets = (over: Record<string, unknown> = {}) => ({
    noun: 'workflow', title: 'the one', kind: 't2i', kindFace: 'from words alone',
    medium: ['image'], services: ['draw-things-grpc'], serviceLabel: 'Draw Things (gRPC)',
    where: ['local'], model: 'a.ckpt', modelFace: 'A', memory: 8, needs: ['a.ckpt'],
    notes: 'a note', added: '2026-08-16', inputs: ['prompt'], ...over,
  })
  const workflows = [
    published('draw-things-grpc/one', workflowPayload('one', 'a.ckpt'), '/library/workflows/one.json',
      facets()),
    published('draw-things-grpc/two', workflowPayload('two', 'b.ckpt'), '/library/workflows/two.json',
      facets({ title: 'the other', model: 'b.ckpt', needs: ['b.ckpt', 'adapter.ckpt'] })),
    published('elsewhere/three', {
      ...(workflowPayload('three', 'c.ckpt') as object), service: 'comfyui-local',
    }, '/library/workflows/three.json',
    facets({ title: 'somewhere else', services: ['comfyui-local'], serviceLabel: 'ComfyUI' })),
    // ⚠️ TWO WORKFLOWS, ONE MEDIUM, OPPOSITE ACTS — and the tracer is listed FIRST, which is what
    // newest-first publishing looks like. This pair is the whole of the 2026-08-24 bug: the map
    // named the tracer, xoko took it exactly as told, and ✒ was no more usable from a sentence
    // than before, because nothing xoko can do puts a picture on the bar.
    published('draw-things-grpc/trace', {
      format: LIBRARY_FORMAT,
      type: 'workflow',
      service: 'draw-things-grpc',
      workflow: { slug: 'trace', label: 'lift a picture', kind: 'ref23d', model: 'a.ckpt', inputs: ['ref'] },
    }, '/library/workflows/trace.json',
    facets({ title: 'lift a picture', kind: 'ref23d', medium: ['model3d'], inputs: ['ref'] })),
    published('draw-things-grpc/shapes', {
      format: LIBRARY_FORMAT,
      type: 'workflow',
      service: 'draw-things-grpc',
      workflow: { slug: 'shapes', label: 'a mesh from words', kind: 't23d', model: 'a.ckpt', inputs: ['prompt'] },
    }, '/library/workflows/shapes.json',
    facets({ title: 'a mesh from words', kind: 't23d', medium: ['model3d'], inputs: ['prompt'] })),
    published('compositions/a-family', {
      format: LIBRARY_FORMAT,
      type: 'composition',
      composition: {
        slug: 'a-family',
        label: 'a family from one face',
        steps: [{ id: 'faces', makes: 'image', repeat: 12, inputs: { prompt: 'ask' },
          recommends: orphan ? 'comfyui-local/three' : 'draw-things-grpc/one' }],
      },
      // ⚠️ THE WORKFLOWS IT WAS BUILT AGAINST TRAVEL WITH IT. That is what makes ⤓ on a composition
      // leave you with something that runs rather than a chain of unbound steps.
      workflows: orphan
        ? { 'comfyui-local/three': { ...(workflowPayload('three', 'c.ckpt') as object), service: 'comfyui-local' } }
        : { 'draw-things-grpc/one': workflowPayload('one', 'a.ckpt') },
    }, '/library/compositions/a-family.json',
    { noun: 'composition', title: 'a family from one face', medium: ['image'] }),
  ]
  const styles = [
    // ⚠️ THE INDEX CARRIES THE STYLE BODY, exactly as xoko.lat's does. ❖ draws a published style
    // from the catalog row — it never fetches one file per row to fill a list.
    published('styles/image/ink-linework', STYLE_PAYLOAD, '/library/styles/image/ink-linework.json',
      { slug: 'ink-linework', label: 'ink linework', medium: 'image',
        style: STYLE_PAYLOAD.style, added: '2026-08-01T00:00:00.000Z' }),
    // A VOICE. On this shelf because that is what a voice is: reusable settings that shape what a
    // verb produces, chosen beside the ask. It has no tags and no negative (a voice-design node
    // reads one description), and it pins the seed — which is the field the format only learned on
    // 2026-08-22.
    published('styles/voice/old-sailor', VOICE_PAYLOAD, '/library/styles/voice/old-sailor.json',
      { slug: 'old-sailor', label: 'old sailor', medium: 'voice', style: VOICE_PAYLOAD.style }),
  ]
  const files: Record<string, unknown> = {
    '/library/index.json': { format: LIBRARY_FORMAT, items: workflows.map((r) => r.item) },
    // ⚠️ COLLECTIONS RIDE THE STYLES INDEX, exactly as xoko.lat publishes them — a collection is not
    // a thing you take, it is how a shelf of styles is read. One names a style that is NOT
    // published, so the reader is held to dropping it rather than drawing a header with a hole.
    '/styles/index.json': {
      format: LIBRARY_FORMAT,
      items: styles.map((s) => s.item),
      collections: [
        { slug: 'drawn-by-hand', medium: 'image', title: 'drawn by hand',
          note: 'Made with a tool held in a hand.', styles: ['ink-linework', 'not-published'] },
        { slug: 'characters', medium: 'voice', title: 'characters',
          note: 'People, not readers.', styles: ['old-sailor'] },
        { slug: 'nothing-here', medium: 'music', title: 'nothing here',
          note: 'Names only styles this library does not publish.', styles: ['ghost'] },
      ],
    },
  }
  for (const p of [...workflows, ...styles]) files[p.path] = p.payload

  const site = await libraryServer(files)
  const roots = await freshApp({ empty })
  const before = process.env['XOKOLAT_LIBRARY']
  process.env['XOKOLAT_LIBRARY'] = site.origin
  return {
    roots,
    origin: site.origin,
    done: async () => {
      if (before === undefined) delete process.env['XOKOLAT_LIBRARY']
      else process.env['XOKOLAT_LIBRARY'] = before
      await site.close()
      await rm(join(roots.data, '..'), { recursive: true, force: true })
    },
  }
}

test('⚠️ taking a second workflow keeps the first — the whole point of the merge', async () => {
  // `saveService` patches at the FIELD level and replaces the whole list WITHIN a field, so the
  // naive `saveService({ id, workflows: [taken] })` deletes everything installed before it. This is
  // the test that would have caught that, and it is why it exists.
  const { roots, done } = await stage()
  try {
    const first = await take(roots, 'draw-things-grpc/one')
    assert.equal(first.type, 'workflow')
    assert.equal(first.slug, 'one')
    assert.equal(first.replaced, false, 'nothing was there to replace on a fresh app')
    assert.equal(first.engine, 'a.ckpt', 'the checkpoint came with it')

    await take(roots, 'draw-things-grpc/two')

    const row = (await loadInferenceRegistry(roots)).rows.find((r) => r.id === 'draw-things-grpc')
    assert.deepEqual(row?.workflows?.map((r) => r.slug), ['one', 'two'])
    assert.deepEqual(row?.engines?.map((e) => e.file), ['a.ckpt', 'b.ckpt'], 'engines merge too')
  } finally {
    await done()
  }
})

test('taking the same workflow again replaces it and says so', async () => {
  const { roots, done } = await stage()
  try {
    await take(roots, 'draw-things-grpc/one')
    const again = await take(roots, 'draw-things-grpc/one')
    assert.equal(again.replaced, true)
    const row = (await loadInferenceRegistry(roots)).rows.find((r) => r.id === 'draw-things-grpc')
    assert.equal(row?.workflows?.length, 1, 'replaced, not appended twice')
  } finally {
    await done()
  }
})

test('what a taken workflow still needs comes back with it, and an unasked service claims nothing',
  async () => {
    const { roots, done } = await stage()
    try {
      const took = await take(roots, 'draw-things-grpc/one')
      // ⚠️ `asked: false` IS THE HONEST ANSWER. Nobody has talked to this service, so an empty
      // `missing` is no news rather than good news — and a screen that read it as "ready" would
      // be the app guessing on the one surface built to stop it.
      assert.equal(took.check?.asked, false)
      assert.deepEqual(took.check?.missing, [])
      assert.equal(took.check?.state, 'known')
    } finally {
      await done()
    }
  })

test('a style joins the list, on an app whose list did not exist yet', async () => {
  const { roots, done } = await stage()
  try {
    const took = await take(roots, 'styles/image/ink-linework')
    assert.equal(took.type, 'style')
    assert.equal(took.medium, 'image')
    assert.equal(took.replaced, false)
    const list = await loadStyles(roots, 'image')
    assert.deepEqual(list.styles.map((s) => s.slug), ['ink-linework'])
    // ⚠️ `medium` MUST NOT BE STORED IN THE ENTRY. It rides on a resolved style as context, and
    // written into the file it is a stray key the next read refuses — taking the whole list down.
    assert.deepEqual(list.issues, [])
  } finally {
    await done()
  }
})

test('a voice arrives as a style, seed and all — the number that makes it that voice', async () => {
  const { roots, done } = await stage()
  try {
    const took = await take(roots, 'styles/voice/old-sailor')
    assert.equal(took.type, 'style')
    assert.equal(took.medium, 'voice')
    // ⚠️ IT LANDS IN THE VOICE LIST, NOT THE IMAGE ONE — and the image list taken beside it is
    // untouched. One list per medium is what makes the 🗣 picker offer voices and only voices.
    const voices = await loadStyles(roots, 'voice')
    assert.deepEqual(voices.issues, [])
    assert.deepEqual(voices.styles.map((s) => s.slug), ['old-sailor'])
    // ⚠️ THE SEED SURVIVED THE TRIP. Without it the sailor is a different man in every line he
    // reads, which is exactly the bug 🗣 had while a voice was a workflow.
    assert.equal(voices.styles[0]?.seed, 1301)
    assert.equal((await loadStyles(roots, 'image')).styles.length, 0)
  } finally {
    await done()
  }
})

test('a workflow for a service this app does not ship is refused before anything is written',
  async () => {
    const { roots, done } = await stage()
    try {
      const err = await refusalAsync(() => take(roots, 'elsewhere/three'))
      assert.equal(err.status, 404)
      assert.match(err.message, /no service called "comfyui-local"/)
      const row = (await loadInferenceRegistry(roots)).rows.find((r) => r.id === 'comfyui-local')
      assert.equal(row, undefined, 'nothing was invented to hold it')
    } finally {
      await done()
    }
  })

test('⤓ a composition lands the chain AND everything it needs to run', async () => {
  const { roots, done } = await stage()
  try {
    const took = await take(roots, 'compositions/a-family')
    assert.equal(took.type, 'composition')
    assert.equal(took.slug, 'a-family')
    assert.equal(took.steps, 1)
    assert.equal(took.replaced, false)

    // The chain is on disk, and it is the one that was published.
    const { compositions } = await loadCompositions(roots)
    assert.deepEqual(compositions.map((x) => x.slug), ['a-family'])

    // ⚠️ AND THE BUNDLED WORKFLOW WENT IN THROUGH THE ORDINARY DOOR — same merge, same user layer.
    assert.deepEqual([...(took.bundled ?? [])], ['draw-things-grpc/one'])
    assert.deepEqual([...(took.blocked ?? [])], [])
    const row = (await loadInferenceRegistry(roots)).rows.find((r) => r.id === 'draw-things-grpc')
    assert.ok(row?.workflows?.some((r) => r.slug === 'one'), 'the bundled workflow landed')
  } finally {
    await done()
  }
})

test('a bundled workflow whose service is missing is added from the shipped list, and said out loud', async () => {
  // ⚠️ THE STATE THIS IS ABOUT: an empty machine. A workflow is an override on a service row, so
  // every bundled workflow would bounce and you would be handed a chain that cannot run with no clue
  // which of six presets to add. What gets added is a row of configuration — it installs nothing,
  // starts nothing, reaches nothing until ▶ — and it is in the answer so the take is auditable.
  const { roots, done } = await stage({ empty: true })
  try {
    const took = await take(roots, 'compositions/a-family')
    assert.deepEqual([...(took.added ?? [])], ['draw-things-grpc'])
    assert.deepEqual([...(took.bundled ?? [])], ['draw-things-grpc/one'])
  } finally {
    await done()
  }
})

test('a bundled workflow this build cannot place does not take the chain down with it', async () => {
  const { roots, done } = await stage({ orphan: true })
  try {
    const took = await take(roots, 'compositions/a-family')
    // The chain — the thing that was asked for — is saved.
    assert.equal((await loadCompositions(roots)).compositions.length, 1)
    assert.deepEqual([...(took.bundled ?? [])], [])
    assert.equal(took.blocked?.length, 1)
    assert.match(took.blocked?.[0]?.why ?? '', /ships no preset/)
  } finally {
    await done()
  }
})

// ── ⤓ A SERVICE, BY NAME, OFF THE SHIPPED LIST ────────────────────────────────
//
// ⚠️ WHAT THIS UNBLOCKS. A workflow is an OVERRIDE ON A SERVICE ROW, and this app ships zero rows —
// so on a fresh install every workflow in the library is untakeable until a service exists, and the
// only way to make one was a form. That put the first act of a new app out of reach of everything
// that is not a pair of hands: the paste box, and xoko.

test('a service is taken by NAME, and the library is never reached', async () => {
  const roots = await freshApp()
  const was = process.env['XOKOLAT_LIBRARY']
  // ⚠️ POINTED AT NONSENSE ON PURPOSE. `resolveLibrary()` refuses this loudly, so a take that got
  // as far as resolving an origin would throw — which makes this the assertion that the preset
  // path touches no network at all, rather than merely happening not to today.
  process.env['XOKOLAT_LIBRARY'] = 'not a url'
  try {
    const took = await take(roots, 'comfyui')
    assert.equal(took.type, 'service')
    assert.equal(took.slug, 'comfyui')
    assert.equal(took.replaced, false)
    const row = (await loadInferenceRegistry(roots)).rows.find((r) => r.id === 'comfyui')
    assert.equal(row?.transport?.kind, 'comfy')
    // ⚠️ AND THE ROW CARRIES NO MEDIUM AT ALL, because no row does any more — what a service
    // makes is read off its workflows (src/inference/kinds.ts). The preset is copied field for
    // field; nothing here invents a value the form would not have written.
    assert.equal((row as unknown as Record<string, unknown>)['medium'], undefined)
  } finally {
    if (was === undefined) delete process.env['XOKOLAT_LIBRARY']
    else process.env['XOKOLAT_LIBRARY'] = was
    await rm(roots.data, { recursive: true, force: true })
  }
})

test('a preset answers to its picker name and to the row name it suggests', async () => {
  // `draw-things` is what ＋ calls it; `draw-things-grpc` is what the row is called, and therefore
  // the prefix on every workflow the library publishes for it. A brain that read one and asked for
  // the other is reasoning correctly.
  for (const said of ['draw-things', 'draw-things-grpc']) {
    const roots = await freshApp()
    try {
      const took = await take(roots, said)
      assert.equal(took.slug, 'draw-things-grpc')
      // ⚠️ `replaced` IS TRUE HERE and that is right: this fixture SHIPS the row, and taking one
      // you already have puts the shipped shape back — the same rule 📚 states for a workflow.
      assert.equal(took.type, 'service')
    } finally {
      await rm(roots.data, { recursive: true, force: true })
    }
  }
})

test('a service, then a workflow onto it — the whole first five minutes of an empty app', async () => {
  const { roots, done } = await stage()
  try {
    // The library publishes `elsewhere/three` for a service called `comfyui-local`, which no
    // preset creates — so this is the state the fix is about, asserted first.
    const err = await refusalAsync(() => take(roots, 'elsewhere/three'))
    assert.equal(err.status, 404)
    assert.match(err.message, /has no service called "comfyui-local"/)

    // …and the same shape, done in the order that works: the service by name, then the workflow.
    await take(roots, 'comfyui')
    const rows = (await loadInferenceRegistry(roots)).rows
    assert.ok(rows.some((r) => r.id === 'comfyui'), 'the service landed')
  } finally {
    await done()
  }
})

test('a one-word miss says services are not published, and names the ones that ship', async () => {
  // ⚠️ THE MISTAKE THIS CATCHES IS A BRAIN'S. Every library id has a `/` in it; a bare word is
  // somebody reaching for the shipped list, and "the catalog does not contain that" sends them
  // looking through a catalog it was never going to be in.
  const { roots, done } = await stage()
  try {
    const err = await refusalAsync(() => take(roots, 'stickers'))
    assert.equal(err.status, 404)
    assert.match(err.message, /services are not published/)
    assert.match(err.message, /draw-things-grpc/)
  } finally {
    await done()
  }
})

test('an id assembled out of a sentence still finds the thing it meant', async () => {
  // ⚠️ THE THIRD REAL CONVERSATION, EXACTLY. Asked for "a flux.2 klein t2i workflow", the brain
  // wrote that phrase back as an id — and the old matcher needed the tail of a published id to
  // have been typed verbatim (`k.includes(word)`), so it found nothing and answered with a
  // lecture about services while the workflow sat in the catalog under a different spelling. Words
  // in common is the match that a description can actually hit.
  const { roots, done } = await stage()
  try {
    const err = await refusalAsync(() => take(roots, 'ink-linework-style'))
    assert.equal(err.status, 404)
    assert.match(err.message, /did you mean styles\/image\/ink-linework/)

    // …and the row's own words count, not only its id: "a voice style" shares nothing with
    // `old-sailor` and is nonetheless exactly one thing on this shelf.
    const bymedium = await refusalAsync(() => take(roots, 'a-voice-style'))
    assert.match(bymedium.message, /did you mean styles\/voice\/old-sailor/)
  } finally {
    await done()
  }
})

test('an id the library does not publish is refused with the near misses', async () => {
  const { roots, done } = await stage()
  try {
    const err = await refusalAsync(() => take(roots, 'draw-things-grpc/one-and-a-half'))
    assert.equal(err.status, 404)
    assert.match(err.message, /publishes nothing called/)
  } finally {
    await done()
  }
})

test('⚠️ a link to a DIFFERENT library is refused, and the one this app uses is named', async () => {
  // The mistake this actually catches: two apps running against two libraries, and a link pasted
  // from the wrong tab. Silently fetching it would install prod content into the dev app and every
  // result after that would be about a machine nobody meant to be testing.
  const { roots, origin, done } = await stage()
  try {
    const err = await refusalAsync(() => take(roots, 'https://xoko.lat/library/workflows/one.json'))
    assert.match(err.message, /not on the library this app is pointed at/)
    assert.match(err.message, new RegExp(origin.replace(/[.]/g, '\\.')))
    // And a half-copied link is a refusal, not a 500 with a stack in the log.
    const bad = await refusalAsync(() => take(roots, 'https://xoko lat/one.json'))
    assert.match(bad.message, /did not parse/)
  } finally {
    await done()
  }
})

test('a link on this library is followed without asking the catalog', async () => {
  const { roots, origin, done } = await stage()
  try {
    const took = await take(roots, `${origin}/library/workflows/two.json`)
    assert.equal(took.slug, 'two')
    assert.equal(took.from, `${origin}/library/workflows/two.json`)
  } finally {
    await done()
  }
})

test('a library that is not there says which address failed', async () => {
  const { roots, done } = await stage()
  try {
    process.env['XOKOLAT_LIBRARY'] = 'http://127.0.0.1:1'
    const err = await refusalAsync(() => take(roots, 'draw-things-grpc/one'))
    assert.equal(err.status, 502)
    assert.match(err.message, /could not reach http:\/\/127\.0\.0\.1:1/)
  } finally {
    await done()
  }
})

// ── browsing it ───────────────────────────────────────────────────────────────
//
// ⚠️ THE ANNOTATION IS THE WHOLE VALUE OF THIS SECTION. The catalog says what a thing is; only the
// app can say whether it will run HERE, and getting that wrong is worse than not showing it — a
// row that says "ready" about a checkpoint nobody has is a row that wastes a press and a download.

/** What a service reports. The one thing 📚 cannot work out without a live engine, so it is the
 *  one thing injected — see `readLibrary`'s `files`. */
const reports = (...have: string[]): Reported => ({ have: new Set(have), asked: true })
const neverAsked: Reported = { have: new Set(), asked: false }

test('📚 lists the workflows and compositions, with the site\'s own words — and no styles', async () => {
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    const view = await readLibrary(roots, { refresh: true, files: () => neverAsked })
    assert.equal(view.issue, null)
    assert.equal(view.items.length, 6)
    const tally: Record<string, number> = {}
    for (const i of view.items) tally[i.type] = (tally[i.type] ?? 0) + 1
    // ⚠️ NO STYLE ROW (2026-08-29). This shelf is organised around `needs` — can this machine run
    // it — and a style has none, so it was a permanent "fine" in the one column the shelf is for.
    // It is in ❖ styles now, per medium: `readLibraryStyles`, below.
    assert.deepEqual(tally, { workflow: 5, composition: 1 })

    const one = view.items.find((i) => i.id === 'draw-things-grpc/one')
    assert.equal(one?.title, 'the one')
    assert.equal(one?.kindFace, 'from words alone', 'the plain-words verb is the site\'s')
    assert.equal(one?.service, 'draw-things-grpc')
  } finally {
    await done()
  }
})

test('⚠️ every row says whether it will run HERE — installed, missing, or never checked', async () => {
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    // `two` needs an adapter this service does not report. That is the answer worth having before
    // the press, and it is the reason this section exists rather than a list of names.
    const files = () => reports('a.ckpt', 'b.ckpt')
    let view = await readLibrary(roots, { refresh: true, files })
    const at = (id: string) => view.items.find((i) => i.id === id)!

    assert.deepEqual(at('draw-things-grpc/one').app.missing, [])
    assert.deepEqual(at('draw-things-grpc/two').app.missing, ['adapter.ckpt'])
    assert.equal(at('draw-things-grpc/one').app.installed, false)

    await take(roots, 'draw-things-grpc/one')
    view = await readLibrary(roots, { files })
    assert.equal(at('draw-things-grpc/one').app.installed, true, 'and it says so without a refetch')
    assert.equal(at('draw-things-grpc/two').app.installed, false)

    // ⚠️ AND A SERVICE NOBODY HAS ASKED CLAIMS NOTHING. `missing: []` from silence is no news, not
    // good news, and the two must never render as the same word.
    view = await readLibrary(roots, { files: () => neverAsked })
    assert.deepEqual(at('draw-things-grpc/two').app.missing, [])
    assert.equal(at('draw-things-grpc/two').app.asked, false)
  } finally {
    await done()
  }
})

// ── ❖ THE STYLES, PER MEDIUM ──────────────────────────────────────────────────

test('❖ reads the published styles for ONE medium, off the same cache as 📚', async () => {
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    const image = await readLibraryStyles(roots, 'image', { refresh: true })
    assert.equal(image.issue, null)
    // ⚠️ THE MEDIUM IS NOT A FILTER THE USER APPLIES — THE SECTION IS THE FILTER. The voice style
    // published alongside this one is not a row here, and 🗣 is where it is a row.
    assert.deepEqual(image.items.map((i) => i.slug), ['ink-linework'])
    assert.equal(image.items[0]?.style?.label, 'ink linework')
    assert.deepEqual(image.items[0]?.style?.tags, ['black ink'])
    assert.equal(image.items[0]?.installed, false)

    const voice = await readLibraryStyles(roots, 'voice')
    assert.deepEqual(voice.items.map((i) => i.slug), ['old-sailor'])
    // A voice pins its seed — the same person comes back — and that has to survive the projection.
    assert.equal(voice.items[0]?.style?.seed, 1301)

    // Nothing published for a medium is a real, ordinary state and not an error.
    assert.deepEqual((await readLibraryStyles(roots, 'music')).items, [])
  } finally {
    forgetLibrary()
    await done()
  }
})

test('❖ says `taken` for one you already have, and it is the take that changes the word', async () => {
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    assert.equal((await readLibraryStyles(roots, 'image', { refresh: true })).items[0]?.installed,
      false)
    await take(roots, 'styles/image/ink-linework')
    // ⚠️ NO REFETCH. `installed` is read off YOUR list on every call; only the catalog rows are
    // cached. A row that still said ⤓ after the press would be the app disagreeing with itself.
    assert.equal((await readLibraryStyles(roots, 'image')).items[0]?.installed, true)
  } finally {
    forgetLibrary()
    await done()
  }
})

test('❖ marks a published style this app would refuse, instead of offering a ⤓ that fails', async () => {
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    // The app owns the FORMAT; the library owns the content. So a row is parsed through the same
    // reader the take uses, and one that would not install says so where you can see it.
    const items = (await readLibraryStyles(roots, 'image', { refresh: true })).items
    assert.equal(items[0]?.issue, null)
    assert.ok(items[0]?.style, 'a row that parses carries the style, and `issue` is null')
  } finally {
    forgetLibrary()
    await done()
  }
})

test('❖ says a library it could not reach did not answer — never `nothing published`', async () => {
  const { roots, origin, done } = await stage()
  try {
    forgetLibrary()
    const view = await readLibraryStyles(roots, 'image', { refresh: true })
    assert.equal(view.issue, null)
    assert.equal(view.items.length, 1)
    await done()
    // ⚠️ POINT IT BACK AT THE DEAD PORT. `done()` restores `XOKOLAT_LIBRARY` to whatever it was
    // before the stage — usually unset, which means the app falls back to DEFAULT_LIBRARY. This
    // test passed for months on the accident that `https://xoko.lat` did not exist yet; the day it
    // went live (2026-09-05) the "unreachable" library answered 200 with fifty-five real styles and
    // the assertion below failed on a machine that was working perfectly.
    //
    // A test about a server being down must name a server that is down, not rely on one being
    // absent from the internet. `origin` is the stage's own address and `done()` has just closed it.
    process.env['XOKOLAT_LIBRARY'] = origin
    // The site is gone now. ⚠️ UNKNOWN IS NOT ZERO: the rows survive the blink and the problem
    // rides with them, because an empty list under a clean clock is the app claiming it looked.
    forgetLibrary()
    const gone = await readLibraryStyles(roots, 'image', { refresh: true })
    assert.ok(gone.issue, 'and the sentence says what happened')
    assert.equal(gone.at, null)
  } finally {
    delete process.env['XOKOLAT_LIBRARY']
    forgetLibrary()
  }
})

test('❖ carries this medium\'s collections, and drops a name that leads nowhere', async () => {
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    const image = await readLibraryStyles(roots, 'image', { refresh: true })
    assert.deepEqual(image.collections.map((c) => c.slug), ['drawn-by-hand'])
    // ⚠️ THE HEADER PROMISES WHAT IT CAN DRAW. `drawn-by-hand` names a style this library does not
    // publish; a header offering `⤓ take 2` over one row is a number nobody can press.
    assert.deepEqual(image.collections[0]?.styles, ['ink-linework'])
    assert.equal(image.collections[0]?.title, 'drawn by hand')
    assert.ok(image.collections[0]?.note, 'the note is the reason it exists and it travels')

    // ⚠️ THIS MEDIUM'S ONLY. `characters` is a voice collection and 🖼 is not where you take it.
    assert.deepEqual((await readLibraryStyles(roots, 'voice')).collections.map((c) => c.slug),
      ['characters'])
    // And a collection whose every style is unpublished is no header at all, not an empty one.
    assert.deepEqual((await readLibraryStyles(roots, 'music')).collections, [])
  } finally {
    forgetLibrary()
    await done()
  }
})

test('⤓ several in one press, and one that fails does not take the rest down', async () => {
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    const { took, failed } = await takeMany(roots, [
      { id: 'styles/image/ink-linework', collections: ['drawn-by-hand'] },
      'styles/voice/old-sailor',
      'styles/image/nothing-like-this',
    ])
    assert.deepEqual(took.map((t) => t.slug), ['ink-linework', 'old-sailor'])
    assert.equal(failed.length, 1)
    assert.equal(failed[0]?.what, 'styles/image/nothing-like-this')

    // ⚠️ THE COLLECTION IS WRITTEN ONTO THE STYLE, which is what stops a collection from being a
    // download filter: your own shelf groups under the header you chose from.
    const mine = (await loadStyles(roots, 'image')).styles.find((x) => x.slug === 'ink-linework')
    assert.deepEqual(mine?.collections, ['drawn-by-hand'])
    // One taken without a header carries none, rather than an empty list nothing means.
    const sailor = (await loadStyles(roots, 'voice')).styles.find((x) => x.slug === 'old-sailor')
    assert.equal(sailor?.collections, undefined)

    // …and the library side now says so, off your list rather than off a refetch.
    const after = await readLibraryStyles(roots, 'image')
    assert.equal(after.items.find((i) => i.slug === 'ink-linework')?.installed, true)
  } finally {
    forgetLibrary()
    await done()
  }
})

test('what cannot be taken says so BEFORE the press, in a sentence', async () => {
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    const view = await readLibrary(roots, { refresh: true, files: () => neverAsked })
    const at = (id: string) => view.items.find((i) => i.id === id)!

    // Finding out by pressing is finding out too late — and a row that simply failed would read
    // as the app being broken rather than as a thing it cannot do yet.
    assert.equal(at('elsewhere/three').app.takeable, false)
    assert.match(at('elsewhere/three').app.why ?? '', /no service called "comfyui-local"/)
    // ⚠️ A COMPOSITION IS TAKEABLE, AND THIS ROW CLAIMED OTHERWISE FOR TWO DAYS AFTER IT BECAME
    // ONE (2026-08-24). `look: library` prints this sentence, so xoko read it, believed it, and
    // told somebody the app could not install the chain it was looking straight at. What refuses a
    // take is the take.
    assert.equal(at('compositions/a-family').app.takeable, true)
    assert.equal(at('compositions/a-family').app.why, null)
    assert.equal(at('compositions/a-family').app.installed, false)
  } finally {
    await done()
  }
})

test('a library that cannot be reached is a sentence, not an empty shelf', async () => {
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    process.env['XOKOLAT_LIBRARY'] = 'http://127.0.0.1:1'
    const view = await readLibrary(roots, { refresh: true, files: () => neverAsked })
    assert.deepEqual(view.items, [])
    assert.match(view.issue ?? '', /could not reach/)
    assert.equal(view.origin, 'http://127.0.0.1:1', 'and it names which library it tried')
    assert.equal(view.at, null, 'nothing was read, so there is no time to show')

    // ⚠️ AND IT KEEPS SAYING SO — the test this file was missing. The next few minutes answer from
    // the cache without a request; a cache that stamped the failed fetch and dropped its problem
    // renders the empty shelf under `read at 13:27`, which is the app claiming a success it never
    // had. That is exactly what it did, and it sent somebody hunting for the wrong bug.
    const again = await readLibrary(roots, { files: () => neverAsked })
    assert.deepEqual(again.items, [])
    assert.match(again.issue ?? '', /could not reach/)
    assert.equal(again.at, null)
  } finally {
    await done()
  }
})

// ── the real site ─────────────────────────────────────────────────────────────

/** The library repo as a sibling checkout, the same way its build reads this one. */
const siteDist = (): string | null => {
  const dir = process.env['XOKOLAT_WEB'] ?? join(resolveRoots().install, '..', 'xokolat-web')
  const dist = join(dir, 'dist')
  return existsSync(join(dist, 'library', 'index.json')) ? dist : null
}

test('every file the library publishes is one this app can read', (t) => {
  const dist = siteDist()
  if (!dist) return t.skip('no xokolat-web checkout beside this one')

  // The CATALOGS, not a glob: `path` is what the app would fetch, so following it proves the index
  // and the files agree as well as proving each file parses.
  const catalogs = ['library', 'styles']
    .map((p) => join(dist, p, 'index.json'))
    .filter((p) => existsSync(p))
    .map((p) => JSON.parse(readFileSync(p, 'utf-8')))

  const tally: Record<string, number> = { workflow: 0, style: 0, composition: 0 }
  const count = (what: string): void => { tally[what] = (tally[what] ?? 0) + 1 }
  const refused: string[] = []
  let files = 0

  for (const catalog of catalogs) {
    assert.equal(catalog.format, LIBRARY_FORMAT, 'the catalog itself is a format this app knows')
    for (const item of catalog.items ?? []) {
      const file = join(dist, item.path)
      assert.ok(existsSync(file), `${item.id}: ${item.path} is in the catalog and not on disk`)
      const body = JSON.parse(readFileSync(file, 'utf-8'))
      files++
      try {
        const got = readPayload(body, item.id)
        count(got.type)
      } catch (err) {
        // ⚠️ ONLY THE ONE REFUSAL WE MEAN. A composition is refused because this app has no such
        // object yet, and that is a known state with a date on it. Anything else refused here is
        // the two repos having drifted, which is exactly what this test exists to catch.
        if (err instanceof PayloadError && err.status === 501) { count('composition'); continue }
        refused.push(`${item.id}: ${(err as Error).message}`)
      }
    }
  }

  assert.deepEqual(refused, [], 'the library published something this app refuses')
  assert.ok(files > 0, 'the site is built but publishes nothing')
  assert.ok((tally['workflow'] ?? 0) > 0, 'no workflows published — a fresh app would have nothing to take')
  assert.ok((tally['style'] ?? 0) > 0, 'no styles published')
  t.diagnostic(`${files} published files: ${Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(', ')}`)
})

test('a published workflow names a service ＋ can actually make', (t) => {
  const dist = siteDist()
  if (!dist) return t.skip('no xokolat-web checkout beside this one')

  // ⚠️ A WORKFLOW WITH NO SERVICE HAS NOWHERE TO LAND. What arrives is an OVERRIDE — `saveService`
  // merges it onto a row that already exists — so a workflow naming a service you cannot end up with
  // is a download that can only fail, and it fails after somebody pressed take.
  //
  // ⚠️ AND THE APP SHIPS NO ROWS ANY MORE (2026-08-20), so the reachable set is what ＋ OFFERS and
  // what it names the result: pick the preset, keep the suggested id, take the workflow. If those
  // two lists ever drift, the symptom is a library row that 404s on press — which is what this
  // test exists to catch, one build earlier.
  const shipped = new Set<string>(SERVICE_PRESETS.map((p) => p.suggest))
  const catalog = JSON.parse(readFileSync(join(dist, 'library', 'index.json'), 'utf-8'))
  const strangers: string[] = []
  for (const item of catalog.items ?? []) {
    const body = JSON.parse(readFileSync(join(dist, item.path), 'utf-8'))
    if (body.type !== 'workflow') continue
    if (!shipped.has(body.service)) strangers.push(`${item.id} → ${body.service}`)
  }
  assert.deepEqual(strangers, [], 'the library publishes workflows for services this app cannot reach')
})

// ⚠️ THE LINE XOKO GETS HANDED WITH EVERY QUESTION. Its map has always said what this machine HAS
// and never whether it can GET anything, so the first real conversation recommended a workflow, took
// a service, promised a render and failed — and only then found out the library had been
// unreachable throughout. This is that one line, and these are the two states it has.

test('the map says the library is reachable, and roughly what is on it', async () => {
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    const line = await libraryReach()
    assert.match(line, /^library: reachable at http/)
    // The counts, not the catalog — which workflows are behind the door is ▶ look: library.
    assert.match(line, /5 workflows/)
    assert.match(line, /1 composition\b/)
    assert.match(line, /2 styles\b/)
    assert.doesNotMatch(line, /draw-things-grpc\/one/, 'a map that inlined the shelf would be the shelf')
    await done()
    void roots
  } catch (err) {
    await done()
    throw err
  }
})

test('the map says, per medium, whether it can be made and what the next act is', async () => {
  // ⚠️ THE HALF THE MAP DID NOT HAVE. "17 styles to take" is true and useless to somebody standing
  // in 🗣 with no voice — it does not say whether any of them ARE voices. A gap belongs next to the
  // medium that has it, because that is the only place it can be acted on.
  //
  // ⚠️ AND IT IS AN ANSWER, NOT A TALLY (2026-08-23). Counts made a brain do the reasoning, and it
  // reasoned wrong in both directions: it promised renders off a number and it reported dead ends
  // off a number. READY or NOT YET, and when NOT YET, the one id that changes it.
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    const block = await holdings(roots)
    assert.match(block, /^library: reachable at http/, 'the reach sentence still leads')
    assert.match(block, /PER MEDIUM/)
    // A fresh app: nothing installed for anything, and a real id to take for the media that have
    // one — not "3 workflows", which is a number somebody then has to go and turn into a name.
    assert.match(block, /image — NOT YET — nothing installed makes it\. ▶ take: \S+ is the one thing/)
    // ⚠️ A WORKFLOW THAT NEEDS A SERVICE FIRST STILL COUNTS. Every ComfyUI workflow on an empty
    // machine reads "cannot take: no service called comfyui" — filtering those out told a brain
    // the library held nothing for a medium whose only workflow was sitting right there.
    assert.match(block, /voice — NOT YET/)
    // ⚠️ A MEDIUM WITH NOTHING ANYWHERE SAYS SO IN WORDS, so a brain reading it cannot mistake
    // "nobody publishes one" for "you have not taken it yet".
    assert.match(block, /music — NOT YET — nothing installed makes it, and 📚 publishes nothing for it/)
    // ONE LINE PER MEDIUM, whatever the catalog holds — the whole point of an answer over a
    // catalog. Counted off MEDIA rather than written down, so adding a medium adds a
    // line here instead of a failure.
    assert.equal(
      block.split('\n').filter((l) => /^ {2}\w/.test(l)).length, MEDIA.length)
    // ⚠️ AND ONE LINE FOR THE OTHER NOUN (2026-08-24). The map had seven media and nothing about
    // chains, so a brain reading it every turn was never told they existed — and when somebody
    // asked outright it said the app could not take one.
    assert.match(block, /🧩 compositions — 📚 still has compositions\/a-family — ▶ take:/)
  } finally {
    await done()
  }
})

test('the act the map names is one that CHANGES the answer, not merely one that succeeds', async () => {
  // ⚠️ THE BUG, EXACTLY (2026-08-24). A medium published two workflows: one whose only input is a
  // picture, and one that works from words. The map named the first — "first wins, and the library
  // publishes newest-first" — xoko took it, reported success, and the next sentence came back
  // "attach a picture first", because none of its four verbs can put a file on the tray. An act
  // that leaves the answer where it was is worse than no suggestion: it is spent.
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    const block = await holdings(roots)
    assert.match(block, /model3d — NOT YET — nothing installed makes it\. ▶ take: draw-things-grpc\/shapes/)
    assert.doesNotMatch(block, /take: draw-things-grpc\/trace/)
  } finally {
    await done()
  }
})

test('a medium that can only be made FROM A PICTURE does not read as READY', async () => {
  // ⚠️ READY HAS TO MEAN READY FOR THE THING BEING ASKED. With only the picture-in workflow installed
  // the medium read `READY — draw-things-grpc/trace` and it was not: from a sentence it is as
  // unusable as an empty one. This is the line that had somebody told "Making that now" and handed
  // a refusal.
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    await take(roots, 'draw-things-grpc/trace')
    forgetLibrary()
    const block = await holdings(roots)
    assert.match(block, /model3d — NOT FROM WORDS/)
    assert.match(block, /draw-things-grpc\/trace is here and every one of them needs a picture ATTACHED/)
    // …and it still names the act that fixes it, which is the whole job of the line.
    assert.match(block, /▶ take: draw-things-grpc\/shapes makes it from a sentence/)
  } finally {
    await done()
  }
})

test('a composition on this machine reads as installed, and is not offered again', async () => {
  const { roots, done } = await stage()
  try {
    forgetLibrary()
    await take(roots, 'compositions/a-family')
    forgetLibrary()
    const view = await readLibrary(roots, { refresh: true, files: () => neverAsked })
    assert.equal(view.items.find((i) => i.id === 'compositions/a-family')!.app.installed, true)
    const block = await holdings(roots)
    assert.match(block, /🧩 compositions — compositions\/a-family installed here/)
    assert.doesNotMatch(block, /📚 still has compositions/)
  } finally {
    await done()
  }
})

test('⚠️ an unreachable 📚 makes every medium UNKNOWN, and never zero', async () => {
  // THE BUG THAT COST A WHOLE CONVERSATION. The shelf tally swallowed the fetch error and fell
  // back to an empty map, so all four lines read "nothing left on 📚 for it" — a false sentence,
  // printed directly under a header saying the library was unreachable, and handed to xoko every
  // turn. It repeated the false half, because a specific claim beats a general one. A thing you
  // have not been told is not a thing that is absent.
  const before = process.env['XOKOLAT_LIBRARY']
  const { roots, done } = await stage()
  process.env['XOKOLAT_LIBRARY'] = 'http://127.0.0.1:1'
  try {
    forgetLibrary()
    const block = await holdings(roots)
    assert.match(block, /^library: unreachable/)
    for (const medium of ['image', 'music', 'voice', 'model3d']) {
      assert.match(block, new RegExp(`${medium} — NOT YET .*unknown`),
        `${medium} claimed to know something about a library it could not read`)
    }
    assert.doesNotMatch(block, /publishes nothing/, 'silence is not an empty shelf')
  } finally {
    forgetLibrary()
    if (before === undefined) delete process.env['XOKOLAT_LIBRARY']
    else process.env['XOKOLAT_LIBRARY'] = before
    await done()
  }
})

test('⚠️ a library that cannot be reached says so IN the map, not on the fourth turn', async () => {
  const before = process.env['XOKOLAT_LIBRARY']
  // A port nothing is listening on: the ordinary failure — a train, a local site not running, a
  // site not deployed yet.
  process.env['XOKOLAT_LIBRARY'] = 'http://127.0.0.1:1'
  try {
    forgetLibrary()
    const line = await libraryReach()
    assert.match(line, /^library: unreachable/)
    assert.match(line, /Nothing can be taken/)
    // ⚠️ AND IT SAYS WHAT STILL WORKS. "The library is down" reads as "the app is dead" unless the
    // one path that needs no library is named in the same breath — services ship with the app.
    assert.match(line, /services still can/)
  } finally {
    forgetLibrary()
    if (before === undefined) delete process.env['XOKOLAT_LIBRARY']
    else process.env['XOKOLAT_LIBRARY'] = before
  }
})

// ── ⤓ A WORKFLOW BRINGS ITS SERVICE ─────────────────────────────────────────────
//
// ⚠️ THE CONVERSATION THIS COST (2026-08-23). On an empty machine the map says
// `▶ take: comfyui/ace-step is the one thing that would` — true of the library and false of this
// app, because a workflow is an override on a service row and there was no row. xoko wrote the four
// ids the map gave it and was refused four times with "this app has no service called comfyui to
// put a workflow on": a sentence that names the obstacle and contains no way past it. Either the map
// had to stop naming the workflow or the workflow had to bring its service. `takeComposition` had
// brought the service for its bundled workflows since the day it was written; the single take was
// the one path that refused instead.

test('a workflow on a service that is not here brings the shipped one with it', async () => {
  const { roots, done } = await stage({ empty: true })
  try {
    const took = await take(roots, 'draw-things-grpc/one')
    assert.equal(took.type, 'workflow')
    assert.equal(took.slug, 'one')
    // ⚠️ SAID OUT LOUD, not discovered later. A take that quietly changed what this app connects
    // to would be a take nobody could audit — the same rule the composition path already kept.
    assert.deepEqual([...(took.added ?? [])], ['draw-things-grpc'])

    const rows = (await loadInferenceRegistry(roots)).rows
    const row = rows.find((r) => r.id === 'draw-things-grpc')
    assert.ok(row, 'the service landed')
    assert.ok(row?.workflows?.some((r) => r.slug === 'one'), 'and the workflow went onto it')
  } finally {
    await done()
  }
})

test('a workflow on a service this app ships NO preset for is still a dead end, and says which', async () => {
  // The distinction the old message could not draw: "no row yet" (one press away) against "nothing
  // here could ever be that" (a wall). Both used to read the same, so both read as broken.
  const { roots, done } = await stage({ empty: true })
  try {
    const err = await refusalAsync(() => take(roots, 'elsewhere/three'))
    assert.equal(err.status, 404)
    assert.match(err.message, /ships\s+no preset for one/)
    assert.equal((await loadInferenceRegistry(roots)).rows.length, 0,
      'nothing was invented to hold it')
  } finally {
    await done()
  }
})

test('📚 marks a workflow takeable when the service comes with it, and says whose', async () => {
  const { roots, done } = await stage({ empty: true })
  try {
    forgetLibrary()
    const { items } = await readLibrary(roots)
    const at = (id: string) => {
      const row = items.find((i) => i.id === id)
      assert.ok(row, `${id} is not in the catalog`)
      return row
    }
    assert.equal(at('draw-things-grpc/one').app.takeable, true)
    assert.equal(at('draw-things-grpc/one').app.brings, 'draw-things-grpc')
    // …and the wall keeps its refusal, with `brings` empty because there is nothing to bring.
    assert.equal(at('elsewhere/three').app.takeable, false)
    assert.equal(at('elsewhere/three').app.brings, null)
  } finally {
    forgetLibrary()
    await done()
  }
})

test('⚠️ the map names an act that can actually be done, and discloses what else it does', async () => {
  const { roots, done } = await stage({ empty: true })
  try {
    forgetLibrary()
    const block = await holdings(roots)
    // The line that was a lie: the id is real, and now so is the act.
    assert.match(block,
      /image — NOT YET — nothing installed makes it\. ▶ take: draw-things-grpc\/one is the one thing that would — it brings the draw-things-grpc service with it/)
    // ⚠️ AND THE DISCLOSURE IS ONLY THERE WHEN IT IS TRUE. A medium whose service is already
    // installed must not have "it brings X with it" bolted onto its line — the sentence is a fact
    // about this machine, not a decoration on the id.
    await take(roots, 'draw-things-grpc')
    forgetLibrary()
    assert.doesNotMatch(await holdings(roots), /brings the draw-things-grpc service/)
  } finally {
    forgetLibrary()
    await done()
  }
})
