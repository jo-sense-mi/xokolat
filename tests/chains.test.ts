// 🧩 WHAT ONE RUN OF A CHAIN LEAVES BEHIND — where it lands, what the index makes of it, and the
// shape the library publishes.
//
// ⚠️ WHAT IS BEING DEFENDED IS THAT THE FILE OPENS. A hand-written PDF fails in exactly one
// interesting way: a byte offset in the cross-reference table that is off, which produces a file
// that one reader repairs silently and another refuses. So these read the bytes back — the xref
// offsets against the objects they claim to point at — rather than checking the buffer is non-empty.

import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import sharp from 'sharp'

import { bind } from '../src/builds/bind.ts'
import { CHAIN_FILE, patchChainRun, readChainRun, startChainRun } from '../src/compositions/chain.ts'
import { chainRel, freeRunId, masterRel, runRel, writeRun } from '../src/content/run.ts'
import { resolveRoots } from '../src/paths.ts'
import { PAGE_SIZES, writePdf } from '../src/builds/pdf.ts'
import type { Roots } from '../src/paths.ts'

const jpeg = async (w: number, h: number): Promise<Buffer> => sharp({
  create: { width: w, height: h, channels: 3, background: '#334455' },
}).jpeg().toBuffer()

/** Read the xref table back and check each offset really lands on `N 0 obj`. */
function xrefIsHonest(pdf: Buffer): void {
  const text = pdf.toString('latin1')
  const start = Number(text.slice(text.lastIndexOf('startxref') + 9).trim().split('\n')[0])
  assert.equal(text.slice(start, start + 4), 'xref', 'startxref does not point at the table')
  const rows = text.slice(start).split('\n').slice(2)
  const count = Number(text.slice(start).split('\n')[1]?.split(' ')[1])
  for (let n = 1; n < count; n += 1) {
    const at = Number(rows[n]?.slice(0, 10))
    assert.equal(text.slice(at, at + `${n} 0 obj`.length), `${n} 0 obj`,
      `object ${n} is not where the xref says it is`)
  }
}

test('a bound file is a PDF that opens: header, one page object each, and an honest xref', async () => {
  const pdf = writePdf([
    { jpeg: await jpeg(800, 600), width: 800, height: 600, caption: 'A volcano is a mountain that opens.' },
    { jpeg: await jpeg(600, 800), width: 600, height: 800, caption: '' },
  ])
  const text = pdf.toString('latin1')
  assert.match(text, /^%PDF-1\.4/)
  assert.ok(text.trimEnd().endsWith('%%EOF'))
  assert.match(text, /\/Type \/Pages \/Count 2/)
  assert.equal(text.split('/Type /Page ').length - 1, 2)
  assert.equal(text.split('/Subtype /Image').length - 1, 2)
  xrefIsHonest(pdf)
})

test('the page size is a real setting, and an unknown one is refused by name', async () => {
  const page = { jpeg: await jpeg(400, 400), width: 400, height: 400, caption: 'x' }
  for (const [name, [w, h]] of Object.entries(PAGE_SIZES)) {
    assert.match(writePdf([page], name).toString('latin1'),
      new RegExp(`/MediaBox \\[0 0 ${w} ${h}\\]`), `${name} did not set its own box`)
  }
  assert.throws(() => writePdf([page], 'a3'), /is not a page size/)
})

test('a caption survives the trip: curly quotes fold, and a paren cannot end the string early', async () => {
  const pdf = writePdf([{
    jpeg: await jpeg(400, 400), width: 400, height: 400,
    caption: 'the “deep” ocean (and its trenches) — cold',
  }])
  const text = pdf.toString('latin1')
  assert.match(text, /the "deep" ocean \\\(and its trenches\\\) - cold/)
  xrefIsHonest(pdf)
})

// ── where a chain's work lands ────────────────────────────────────────────────────────────────
//
// ⚠️ A SECTION KEEPS WHAT IT MAKES, WHICH IS THE WHOLE CORRECTION OF 2026-08-24. Every press of one
// ▶ — the brief, the twelve candidates, the cut-out, and the PDF the last step binds — goes into
// ONE folder under `compositions/<slug>/<run>/`. Nothing a chain makes appears on a medium's shelf:
// you go to 🧸 to look at your mascots, not to 🖼 among everything you have ever drawn.

async function roots(): Promise<Roots> {
  const dir = await mkdtemp(join(tmpdir(), 'xokolat-chain-'))
  return { content: dir, data: dir, install: dir } as Roots
}

/** Two pictures on disk, as earlier steps would have left them. Under `media/` here on purpose: a
 *  bind reads whatever assets it is handed, including ones somebody drew by typing a sentence. */
async function pages(root: string): Promise<string[]> {
  const rels = ['media/image/a-20260824-100000/x.webp', 'media/image/b-20260824-100001/x.webp']
  for (const [i, rel] of rels.entries()) {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(root, rel, '..'), { recursive: true })
    await writeFile(join(root, rel), await sharp({
      create: { width: 300 + i, height: 200, channels: 4, background: '#00000000' },
    }).webp().toBuffer())
  }
  return rels
}

/** One webp master, written where a press of `step` in `run` would have put it. */
async function press(
  r: Roots, chain: { slug: string; run: string }, step: string, service = 'dt',
): Promise<string> {
  const runId = await freeRunId(r, 'image', step, chain)
  await writeRun(r, {
    runId,
    medium: 'image',
    text: 'a badger',
    title: 'a badger',
    style: null,
    inference: [service],
    composition: chain.slug,
    chain: chain.run,
    step,
    createdAt: '2026-08-24T10:00:00.000Z',
  })
  const rel = masterRel('image', runId, service, null, chain)
  await writeFile(join(r.content, rel), await sharp({
    create: { width: 300, height: 200, channels: 4, background: '#00000000' },
  }).webp().toBuffer())
  return rel
}

test('a chain press lands under its composition, named after the step, and never under the medium', async () => {
  const r = await roots()
  const chain = { slug: 'mascot', run: 'a-cat-20260824-101500' }
  await startChainRun(r, { composition: 'mascot', text: 'a cat' })

  assert.equal(runRel('image', 'founder', chain), 'compositions/mascot/a-cat-20260824-101500/founder')
  // ⚠️ AND NOT A TIMESTAMP IN SIGHT. The run folder above already carries the sentence and the
  // clock; inside it, the STEP is the whole of what tells two folders apart.
  assert.equal(await freeRunId(r, 'image', 'founder', chain), 'founder')
  const first = await press(r, chain, 'founder')
  assert.equal(first, 'compositions/mascot/a-cat-20260824-101500/founder/dt.webp')

  // ⚠️ TWELVE PRESSES OF ONE STEP IN ONE SECOND is what `repeat` is, and it is why a run id is
  // checked against the disk rather than minted from a clock that only counts seconds.
  const second = await press(r, chain, 'founder')
  assert.equal(second, 'compositions/mascot/a-cat-20260824-101500/founder-2/dt.webp')

  // A press somebody typed is untouched: no chain, so the medium's own shelf.
  assert.equal(runRel('image', 'a-cat-20260824-101500'), 'media/image/a-cat-20260824-101500')
})

test('a build lands in the chain\'s own run, beside the pages it was made of', async () => {
  const r = await roots()
  const parts = await pages(r.content)
  const started = await startChainRun(r, { composition: 'book', text: 'volcanoes, glaciers and coral reefs' })
  const out = await bind(r, {
    composition: 'book',
    run: started.runId,
    step: 'bound',
    binds: 'pdf',
    page: 'square',
    parts,
    captions: ['first page', 'second page'],
  })

  assert.equal(out.path, chainRel('book', started.runId))
  assert.equal(out.master, `${out.path}/book.pdf`)

  const pdf = await readFile(join(r.content, out.master))
  assert.equal(pdf.toString('latin1').split('/Type /Page ').length - 1, 2)
  assert.match(pdf.toString('latin1'), /\/MediaBox \[0 0 612 612\]/)
  xrefIsHonest(pdf)

  // The run's own record says what was bound — the index reads it back rather than guessing from
  // a filename, which is the same rule a media run's `run.json` keeps.
  const record = (await readChainRun(r, 'book', started.runId))!
  assert.equal(record.bound?.file, 'book.pdf')
  assert.equal(record.bound?.parts, 2)
  assert.equal(record.bound?.step, 'bound')
  // The run is NAMED off the sentence, exactly as a media run is — the folder is a path, the title
  // is a thing a person reads.
  assert.equal(record.title, 'volcanoes, glaciers and coral reefs')
  assert.match(started.runId, /^volcanoes-glaciers-and-coral-reefs-\d{8}-\d{6}$/)
  assert.ok(await readFile(join(r.content, out.path, CHAIN_FILE), 'utf-8'))
})

test('a build with nothing to bind, an unknown container, unknown paper and no run are all refused by name', async () => {
  const r = await roots()
  const parts = await pages(r.content)
  const started = await startChainRun(r, { composition: 'book', text: 'a small guide' })
  const req = { composition: 'book', run: started.runId, step: 'bound', binds: 'pdf' as const }
  await assert.rejects(bind(r, { ...req, parts: [] }), /nothing to bind/)
  await assert.rejects(bind(r, { ...req, binds: 'zip' as 'pdf', parts }), /is not something this app binds/)
  await assert.rejects(bind(r, { ...req, page: 'a3', parts }), /is not a page size/)
  // ⚠️ THE RUN HAS TO EXIST. A bind that minted its own would put the book where the pages are not.
  await assert.rejects(bind(r, { ...req, run: 'never-happened', parts }), /there is no run/)
})

test('an svg bind files what a text step wrote, and trims the commentary off it', async () => {
  const r = await roots()
  const started = await startChainRun(r, { composition: 'svg-images', text: 'a two-colour mountain badge' })
  // ⚠️ WHAT A BRAIN ACTUALLY HANDS BACK. Asked for markup and nothing else, it will now and then
  // wrap it in a fence or open with a sentence — so the document is the first `<svg` to the last
  // `</svg>`, and what is between them is written exactly as it arrived.
  const said = 'Here you go:\n```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
    + '<path d="M0 512 L256 0 L512 512 Z" fill="#123"/></svg>\n```\nHope that works!'
  const out = await bind(r, {
    composition: 'svg-images', run: started.runId, step: 'file', binds: 'svg', parts: [said],
  })

  assert.equal(out.master, `${chainRel('svg-images', started.runId)}/svg-images.svg`)
  const written = await readFile(join(r.content, out.master), 'utf-8')
  assert.ok(written.startsWith('<svg xmlns='))
  assert.ok(written.trimEnd().endsWith('</svg>'))
  assert.doesNotMatch(written, /Here you go|```|Hope that works/)

  const record = (await readChainRun(r, 'svg-images', started.runId))!
  assert.equal(record.bound?.file, 'svg-images.svg')
  assert.equal(record.bound?.step, 'file')
})

test('an svg bind refuses words that are not a document, and refuses a set of them', async () => {
  const r = await roots()
  const started = await startChainRun(r, { composition: 'svg-images', text: 'a badge' })
  const req = { composition: 'svg-images', run: started.runId, step: 'file', binds: 'svg' as const }
  await assert.rejects(bind(r, { ...req, parts: ['I cannot draw that.'] }), /is not an SVG document/)
  // ⚠️ ONE FILE OUT, BECAUSE A BIND IS THE RUN'S ONE RESULT. A step that wrote several is a real
  // gap — a run that can hold a SET — and it is refused by name rather than filed as its first.
  const one = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
  await assert.rejects(bind(r, { ...req, parts: [one, one] }), /an svg binds one/)
})

test('a path that climbs out of the content root cannot become a page', async () => {
  const r = await roots()
  const started = await startChainRun(r, { composition: 'book', text: 'x' })
  await assert.rejects(
    bind(r, {
      composition: 'book', run: started.runId, step: 'bound', binds: 'pdf', parts: ['../../etc/passwd'],
    }),
    (err: Error) => err.name === 'PathEscapeError' || /not inside/.test(err.message))
})

test('the index reads one run of a chain as ONE group — its steps, its words and its book', async () => {
  const { buildIndex } = await import('../src/content/index.ts')
  const r = await roots()
  const started = await startChainRun(r, { composition: 'mascot', text: 'a cat' })
  const chain = { slug: 'mascot', run: started.runId }
  await patchChainRun(r, 'mascot', started.runId, {
    wrote: { step: 'brief', text: 'A round tabby with a crooked ear.' },
  })
  const founder = await press(r, chain, 'founder')
  const cut = await press(r, chain, 'mascot', 'rembg')

  const { manifest } = await buildIndex(r, { full: true })
  // ⚠️ NOTHING ON THE MEDIA SHELVES. This is the whole point: a mascot is in 🧸, and 🖼 shows what
  // you drew by typing a sentence.
  assert.equal(manifest.media.length, 0)
  assert.equal(manifest.chains.length, 1)

  const one = manifest.chains[0]!
  assert.equal(one.composition, 'mascot')
  assert.equal(one.run, started.runId)
  assert.equal(one.title, 'a cat')
  assert.equal(one.ask, 'a cat')
  assert.equal(one.ratingKey, `chain:${chainRel('mascot', started.runId)}`)
  assert.deepEqual(one.cells.map((c) => c.master), [founder, cut])
  assert.deepEqual(one.cells.map((c) => c.step), ['founder', 'mascot'])
  // The press folder, so a running chain can read back exactly what it just fired.
  assert.deepEqual(one.cells.map((c) => c.run), ['founder', 'mascot'])
  assert.ok(one.cells.every((c) => c.medium === 'image' && c.player === 'img'))
  // ⚠️ WORDS ARE A FIELD ON THE RUN, NEVER AN ASSET. There is no 📝 shelf and there will not be one.
  assert.deepEqual(one.wrote, [{ step: 'brief', text: 'A round tabby with a crooked ear.' }])
  assert.equal(one.bound, null)

  const built = await bind(r, {
    composition: 'mascot', run: started.runId, step: 'sheet', binds: 'pdf', parts: [founder, cut],
  })
  const after = (await buildIndex(r, { full: true })).manifest.chains[0]!
  assert.equal(after.bound?.master, built.master)
  assert.equal(after.bound?.parts, 2)
  assert.ok((after.bound?.bytes ?? 0) > 0)
  assert.equal(after.bound?.ratingKey, `chain:${built.master}`)

  // A folder with no record is not a run this app started, and is not guessed at.
  const { mkdir } = await import('node:fs/promises')
  await mkdir(join(r.content, 'compositions/mascot/by-hand'), { recursive: true })
  await writeFile(join(r.content, 'compositions/mascot/by-hand/mascot.pdf'), 'not ours')
  assert.equal((await buildIndex(r, { full: true })).manifest.chains.length, 1)
  assert.equal((await readdir(join(r.content, 'compositions/mascot'))).length, 2)
})

test('🗑 takes the whole run, and only a run this app started', async () => {
  const { removeAsset } = await import('../src/content/remove.ts')
  const r = await roots()
  const started = await startChainRun(r, { composition: 'mascot', text: 'a cat' })
  await press(r, { slug: 'mascot', run: started.runId }, 'founder')
  const rel = chainRel('mascot', started.runId)

  // ⚠️ ONE ACT, ONE DELETE. The brief, the takes and the cut-out are a single press of ▶ — deleting
  // one page of that is not a thing anybody means.
  const gone = await removeAsset(r, rel, `chain:${rel}`)
  assert.equal(gone.prunedRun, true)
  await assert.rejects(readdir(join(r.content, rel)))

  const { mkdir } = await import('node:fs/promises')
  await mkdir(join(r.content, 'compositions/mascot/by-hand'), { recursive: true })
  await assert.rejects(
    removeAsset(r, 'compositions/mascot/by-hand', null), /not a run this app made/)
  await assert.rejects(removeAsset(r, 'styles/image.json', null), /only what this app made/)
})

// ── the shape the library actually publishes ──────────────────────────────────────────────────
//
// ⚠️ A REAL PUBLISHED FILE, COPIED IN (tests/fixtures/published-book.json). Everything above tests
// this app against drafts this app wrote, which cannot catch the one failure that matters: the
// library publishing a shape the app refuses. `book` is the chain that exercises every part of the
// composition format at once — a `list` text step, two `each` steps, and a terminal BIND — so if
// the format drifts, this is where it is noticed.

test('the book composition the library publishes parses, and every step that needs a workflow has one', async () => {
  const { readPayload } = await import('../src/library/payload.ts')
  const { resolveComposition } = await import('../src/compositions/resolve.ts')
  const { parseInferenceRow } = await import('../src/inference/registry.ts')
  const { resolveWorkflows } = await import('../src/inference/workflows.ts')
  const { loadKinds } = await import('../src/inference/kinds.ts')
  const { SERVICE_PRESETS } = await import('../src/inference/presets.ts')
  const { resolveRoots } = await import('../src/paths.ts')
  const { isBind } = await import('../src/types/composition.ts')
  const { ctx } = await import('../src/validate.ts')
  const { fileURLToPath } = await import('node:url')

  const file = fileURLToPath(new URL('./fixtures/published-book.json', import.meta.url))
  const payload = readPayload(JSON.parse(await readFile(file, 'utf-8')), file)
  assert.equal(payload.type, 'composition')
  if (payload.type !== 'composition') return

  const { kinds } = await loadKinds(resolveRoots())
  const mediumOf = new Map(kinds.map((k) => [k.slug, k.medium]))

  // The machine that took it: every bundled workflow installed, on the service its preset describes.
  const pool = []
  for (const entry of payload.workflows) {
    const p = entry.payload as unknown as { service: string; row: object }
    const preset = SERVICE_PRESETS.find((x) => x.suggest === p.service)
    assert.ok(preset, `${p.service} is not a preset this build ships`)
    const c = ctx(entry.id)
    const row = parseInferenceRow(c, { ...p.row, transport: preset.transport }, '')
    assert.deepEqual(c.issues, [], entry.id)
    for (const w of resolveWorkflows(row!, null)) {
      pool.push({
        ...w, service: p.service, serviceLabel: p.service,
        medium: mediumOf.get(w.kind) ?? null,
      })
    }
  }

  const resolved = resolveComposition(payload.composition, pool)
  assert.equal(resolved.slug, 'book')
  assert.deepEqual(resolved.needs, [])
  assert.ok(resolved.ready, 'a chain the library says is complete does not bind here')
  assert.deepEqual(resolved.bindings.map((b) => b.workflow), [
    // ⚠️ THE TWO WRITING STEPS ARE NULL BECAUSE WORDS ARE XOKO (2026-08-24). They named
    // `ollama/prompt-smith` until the day a book, which needs one image workflow, announced itself
    // as needing a local LLM — and then asked it to write what xoko was there to write.
    null, null, 'draw-things-grpc/dev-fast',
    // ⚠️ AND NULL AGAIN AT THE END. The last step reaches no engine: this app writes the file.
    null,
  ])
  assert.deepEqual(resolved.bindings.map((b) => b.binding), ['xoko', 'xoko', 'exact', 'exact'])
  const last = resolved.steps.at(-1)!
  assert.ok(isBind(last), 'the chain does not end in a bind, so it produces a pile')
  assert.equal(isBind(last) && last.binds, 'pdf')
  assert.equal(isBind(last) && last.parts, 'art')
  assert.equal(isBind(last) && last.captions, 'pages')
})

/**
 * 🧩 A CHAIN THAT AUTHORS A COMPOSITION — the composition builder, and ＋ install.
 *
 * ⚠️ IT IS A BUTTON AND NOT A BIND (2026-09-04). This was `binds: 'registry'` for four days, filing
 * the document as the last step ran — which put the one act that changes the app at the end of a
 * run, where it could happen exactly once. A document the parsers refused was then a dead run: the
 * survey, the node reads and the whole written composition sitting there, one key name from
 * working, with nothing to press.
 *
 * ⚠️ AND WHAT IS BEING DEFENDED HERE IS THE REFUSAL. A brain that writes a graph can write a hole
 * pointing at a node that is not there, or a preset naming a hole the graph has not got — both of
 * which run, silently, at the published values. If they get past this door the whole point of
 * having a builder is gone.
 *
 * ⚠️ AND THAT A COMPOSITION BRINGS ITS WORKFLOWS. That is what makes one output type enough: a chain
 * whose steps need a graph nobody has carries the graph, and installing the chain installs it, each
 * through the ordinary workflow door.
 */
/** A ComfyUI in the registry, as a machine that has one would have. A workflow is a path THROUGH a
 *  service, so there has to be one for it to be a path through. */
async function withComfy(r: Roots): Promise<void> {
  const { saveService } = await import('../src/inference/services.ts')
  await saveService(r, {
    id: 'comfyui',
    label: 'ComfyUI',
    transport: { kind: 'comfy', host: '127.0.0.1', port: 8188 },
  })
}

/** One workflow, in the shape 📚 publishes one — which is the shape a bundled one arrives in. */
const cardWorkflow = {
  format: 1,
  type: 'workflow',
  service: 'comfyui',
  workflow: {
    slug: 'deck-of-cards', label: 'a deck of cards', kind: 't2i',
    model: 'sd_xl_base_1.0.safetensors', inputs: ['prompt'],
    graph: {
      nodes: {
        3: { class_type: 'KSampler', inputs: { steps: 20, cfg: 7 } },
        9: { class_type: 'SaveImage', inputs: {} },
      },
      out: '9',
      holes: { prompt: '3.positive', steps: '3.steps', cfg: '3.cfg' },
    },
    presets: { crisp: { steps: 30, cfg: 7 } },
  },
}

const cardChain = {
  composition: {
    slug: 'card-deck', label: 'a deck of cards', icon: '🃏', family: 'game-assets',
    notes: 'one face per suit, drawn to one look',
    steps: [
      { id: 'faces', makes: 'text', list: true, says: 'name the cards, one per line', inputs: { prompt: 'ask' } },
      { id: 'draw', makes: 'image', each: 'faces', inputs: { prompt: 'faces' }, recommends: 'comfyui/deck-of-cards' },
    ],
  },
}

/** What the ＋ button does with what a step wrote: read it, then put it in. */
async function installWritten(r: Roots, wrote: string) {
  const { readWritten } = await import('../src/library/payload.ts')
  const { installPayload } = await import('../src/library/take.ts')
  return installPayload(r, readWritten(wrote), 'written here')
}

test('a composition is installed with the workflows it brings, and both meet the ordinary parsers', async () => {
  const r = await roots()
  await withComfy(r)

  // ⚠️ WHAT A BRAIN ACTUALLY HANDS BACK — a fence and a sentence around the document. The first `{`
  // to the last `}` is the document; what is between them is parsed exactly as it arrived.
  const doc = { ...cardChain, workflows: { 'comfyui/deck-of-cards': cardWorkflow } }
  const said = `Here it is:\n\`\`\`json\n${JSON.stringify(doc)}\n\`\`\`\nPress ＋ install.`
  const took = await installWritten(r, said)
  assert.equal(took.slug, 'card-deck')
  assert.deepEqual(took.bundled, ['comfyui/deck-of-cards'])

  const { loadCompositions } = await import('../src/compositions/registry.ts')
  const { compositions } = await loadCompositions(r)
  assert.ok(compositions.find((c) => c.slug === 'card-deck'), 'the chain was filed nowhere')

  // ⚠️ AND THE GRAPH IT BROUGHT IS REALLY IN 🔌, on the service it named — which is the whole of
  // why one output type is enough. A chain that needed a graph nobody had carried it.
  const { loadInferenceRegistry } = await import('../src/inference/registry.ts')
  const { rows } = await loadInferenceRegistry(r)
  const mine = rows.find((x) => x.id === 'comfyui')?.workflows?.find((w) => w.slug === 'deck-of-cards')
  assert.ok(mine, 'the bundled workflow was filed nowhere')
  assert.equal(mine.graph?.out, '9')
  assert.deepEqual(mine.presets, { crisp: { steps: 30, cfg: 7 } })
})

test('＋ install refuses what the app would refuse on import', async () => {
  const r = await roots()
  await withComfy(r)
  const bundled = (over: object) => JSON.stringify({
    ...cardChain,
    workflows: {
      'comfyui/deck-of-cards': { ...cardWorkflow, workflow: { ...cardWorkflow.workflow, ...over } },
    },
  })

  await assert.rejects(installWritten(r, 'I could not write that.'), /no object in it/)
  await assert.rejects(installWritten(r, '{ "nope": 1 }'), /unknown field/)
  // ⚠️ AND A WORKFLOW ON ITS OWN IS NOT THE ANSWER TO THIS DOOR (2026-09-04). One output type: a
  // graph arrives INSIDE the chain that needs it. If all you want is the press, that is a chain
  // with one step.
  await assert.rejects(installWritten(r, JSON.stringify(cardWorkflow)), /not a composition/)
  // A step reading something no earlier step made — a chain that runs two steps and then stops.
  await assert.rejects(installWritten(r, JSON.stringify({
    composition: {
      ...cardChain.composition,
      steps: [{ id: 'draw', makes: 'image', inputs: { prompt: 'nowhere' } }],
    },
  })), /nowhere/)
  // A hole pointing at a node the graph does not have — a render that writes nothing anywhere.
  await assert.rejects(installWritten(r, bundled({
    graph: { ...cardWorkflow.workflow.graph, holes: { ...cardWorkflow.workflow.graph.holes, cfg: '77.cfg' } },
  })), /77/)
  // ⚠️ AND THE PRESET RULE, which is the quietest of the three: `fill()` skips a value with nowhere
  // to go, so this would render at the published numbers and look like it worked.
  await assert.rejects(installWritten(r, bundled({ presets: { crisp: { shift: 3 } } })), /shift/)
  // ⚠️ AND `model`, which is the app's own word for the checkpoint that ran.
  await assert.rejects(installWritten(r, bundled({
    graph: { ...cardWorkflow.workflow.graph, holes: { ...cardWorkflow.workflow.graph.holes, model: '3.ckpt' } },
  })), /model/)
})

/**
 * ⚠️ ONE BAD WORKFLOW DOES NOT TAKE THE CHAIN DOWN WITH IT — the same rule a ⤓ take keeps, because
 * it is the same writer. The chain is the thing you asked for; a step whose workflow is missing is a
 * step that says so, which is a fixable state.
 */
test('a bundled workflow naming a service that is not here is reported, not fatal', async () => {
  const r = await roots()
  const took = await installWritten(r, JSON.stringify({
    ...cardChain,
    workflows: { 'nowhere/x': { ...cardWorkflow, service: 'nowhere' } },
  }))
  assert.equal(took.slug, 'card-deck')
  assert.deepEqual(took.bundled, [])
  assert.equal(took.blocked?.length, 1)
  assert.match(took.blocked![0]!.why, /nowhere/)

  const { loadCompositions } = await import('../src/compositions/registry.ts')
  assert.ok((await loadCompositions(r)).compositions.find((c) => c.slug === 'card-deck'))
})

test('⚠️ a run whose whole output is WORDS is still a card', async () => {
  // The composition builder is the first composition that presses no engine and binds nothing: it
  // surveys the machine and writes a composition, and the ＋ button on those words installs it.
  // Until 2026-09-01 the index dropped such a run one line before the group was built, so 🔩's
  // feed was empty while two complete answers sat on the disk.
  const { buildIndex } = await import('../src/content/index.ts')
  const r = await roots()
  const started = await startChainRun(r, { composition: 'composition-builder', text: 'a deck of cards' })
  await patchChainRun(r, 'composition-builder', started.runId, {
    wrote: { step: 'survey', text: 'CHAIN, not a workflow — nothing installed makes trading cards.' },
  })

  const { manifest } = await buildIndex(r, { full: true })
  assert.equal(manifest.chains.length, 1, 'the run is a card on the strength of its words alone')
  const one = manifest.chains[0]!
  assert.equal(one.cells.length, 0)
  assert.equal(one.bound, null)
  assert.equal(one.wrote[0]?.step, 'survey')

  // ⚠️ AND A RUN THAT REALLY IS EMPTY IS STILL NOT A CARD. The test that was too strict is not
  // being replaced by no test at all: a chain that failed on its first step leaves a folder, and a
  // folder is not a run you can look at.
  const bare = await startChainRun(r, { composition: 'composition-builder', text: 'nothing happened' })
  assert.equal((await buildIndex(r, { full: true })).manifest.chains.length, 1)
  assert.ok(bare.runId)
})

test('a run is remembered by what it INSTALLED, and the words stay pressable', async () => {
  // What was installed has moved into the registry and keeps no memory of the run that wrote it,
  // so if the run does not say so, nothing does — the card would be describing some words instead
  // of the chain it added to the nav.
  const { buildIndex } = await import('../src/content/index.ts')
  const r = await roots()
  const started = await startChainRun(r, { composition: 'composition-builder', text: 'a card chain' })
  const wrote = JSON.stringify(cardChain)
  await patchChainRun(r, 'composition-builder', started.runId, { wrote: { step: 'shape', text: wrote } })

  const took = await installWritten(r, wrote)
  await patchChainRun(r, 'composition-builder', started.runId, { installed: `composition ${took.slug}` })

  const record = await readChainRun(r, 'composition-builder', started.runId)
  assert.equal(record?.installed, 'composition card-deck', 'the run remembers what it installed')

  const one = (await buildIndex(r, { full: true })).manifest.chains[0]!
  assert.equal(one.installed, 'composition card-deck', 'and the feed is told')
  // ⚠️ AND THE DOCUMENT IS STILL THERE, WORD FOR WORD. It is a field on the run, not a file that a
  // successful install consumed — which is what makes ＋ pressable twice and ⇢ publish shape a copy
  // rather than a reshape.
  assert.equal(one.wrote[0]?.text, wrote)
})

/**
 * ▶ CARRY ON — what a resumed run has to be able to read back.
 *
 * ⚠️ THE LOOP LIVES ON A PAGE AND THE RUN LIVES ON DISK. A reload ends the loop; the run is
 * untouched. So everything a finished step produced has to be recoverable from the record, or
 * "carry on" is "start over with extra steps".
 */
test('a run remembers its answers as a list, its choice, and why it stopped', async () => {
  const r = await roots()
  const started = await startChainRun(r, { composition: 'card-deck', text: 'twelve cards' })

  // ⚠️ A LIST STEP'S ANSWERS, NOT ITS PARAGRAPH. Splitting `text` on newlines gives thirteen
  // concepts the moment one of them wrapped, and page three would stop being the third concept.
  await patchChainRun(r, 'card-deck', started.runId, {
    wrote: { step: 'faces', text: 'the ember\nthe tide\nthe long dark', items: ['the ember', 'the tide', 'the long dark'] },
  })
  await patchChainRun(r, 'card-deck', started.runId, {
    picked: { step: 'choose', master: 'compositions/card-deck/x/draw/one.webp' },
  })
  await patchChainRun(r, 'card-deck', started.runId, {
    failed: { step: 'draw', why: 'ComfyUI is not answering' },
  })

  const rec = await readChainRun(r, 'card-deck', started.runId)
  assert.deepEqual(rec?.wrote?.[0]?.items, ['the ember', 'the tide', 'the long dark'])
  assert.equal(rec?.picked?.[0]?.step, 'choose')
  assert.equal(rec?.failed?.why, 'ComfyUI is not answering')

  // ⚠️ AND THE REASON IS CLEARED BEFORE THE NEXT ATTEMPT, or a run shows yesterday's why beside
  // today's try. `null` is the clear, and it is not the same as "no patch".
  const after = await patchChainRun(r, 'card-deck', started.runId, { failed: null })
  assert.equal(after.failed, null)
  assert.deepEqual(after.wrote?.[0]?.items, ['the ember', 'the tide', 'the long dark'], 'clearing one field keeps the rest')
})

test('⚠️ a run that only failed is still a card, because it is the one that can say why', async () => {
  const { buildIndex } = await import('../src/content/index.ts')
  const r = await roots()
  const started = await startChainRun(r, { composition: 'composition-builder', text: 'a deck' })
  await patchChainRun(r, 'composition-builder', started.runId, {
    failed: { step: 'survey', why: 'no brain is armed' },
  })
  const one = (await buildIndex(r, { full: true })).manifest.chains[0]!
  assert.equal(one.failed?.step, 'survey')
  assert.equal(one.cells.length, 0)
  assert.deepEqual(one.wrote, [])
})

/**
 * ⚠️ A STYLE'S WORDS ARE APPENDED TO A STEP'S OWN INSTRUCTION, which is right for prose and ruins
 * a step that must answer with a document. `verbatim` says which is which, and the parser holds it
 * to the one place it means anything.
 */
test('verbatim is a text step\'s word, and nothing else\'s', async () => {
  const { parseComposition } = await import('../src/compositions/registry.ts')
  const { ctx } = await import('../src/validate.ts')

  const good = ctx('x')
  const one = parseComposition(good, {
    slug: 'w', label: 'w', family: 'x',
    steps: [{ id: 'shape', makes: 'text', verbatim: true, says: 'answer with JSON', inputs: { prompt: 'ask' } }],
  })
  assert.deepEqual(good.issues, [])
  assert.equal(one?.steps[0] && 'verbatim' in one.steps[0] ? one.steps[0].verbatim : null, true)

  const bad = ctx('x')
  parseComposition(bad, {
    slug: 'w', label: 'w', family: 'x',
    steps: [{ id: 'art', makes: 'image', verbatim: true, inputs: { prompt: 'ask' } }],
  })
  assert.ok(bad.issues.some((i) => i.includes('verbatim')), 'an image step cannot be verbatim')
})

/**
 * ⚠️ A CHAIN THAT TAKES NO STYLE SAYS SO ITSELF. Deriving it from the step kinds was wrong about
 * the one chain it was written for: the composition builder's `survey` writes prose, so every rule
 * over step kinds concludes "styles apply here" about a chain whose only real output is a document.
 */
/** The library repo as a sibling checkout — the same door tests/library.test.ts opens. */
const siteDist = (): string | null => {
  const dir = process.env['XOKOLAT_WEB'] ?? join(resolveRoots().install, '..', 'xokolat-web')
  return existsSync(join(dir, 'dist', 'library', 'index.json')) ? join(dir, 'dist') : null
}

test('a composition may declare that it takes no style', async () => {
  const { parseComposition } = await import('../src/compositions/registry.ts')
  const { ctx } = await import('../src/validate.ts')

  const c = ctx('x')
  const off = parseComposition(c, {
    slug: 'w', label: 'w', family: 'x', styles: false,
    steps: [{ id: 'shape', makes: 'text', verbatim: true, says: 'answer with JSON', inputs: { prompt: 'ask' } }],
  })
  assert.deepEqual(c.issues, [])
  assert.equal(off?.styles, false)

  // ⚠️ SILENCE IS YES, because that is what every composition meant before the field existed.
  const quiet = ctx('x')
  const on = parseComposition(quiet, {
    slug: 'w', label: 'w', family: 'x',
    steps: [{ id: 'art', makes: 'image', inputs: { prompt: 'ask' } }],
  })
  assert.deepEqual(quiet.issues, [])
  assert.equal(on?.styles, undefined)
})

/** The published builder is the case all of this was for — it says so on the shelf. */
test('the published composition builder takes no style and writes verbatim', async () => {
  const dist = siteDist()
  if (!dist) return
  const file = join(dist, 'library', 'compositions', 'composition-builder.json')
  if (!existsSync(file)) return
  const doc = JSON.parse(readFileSync(file, 'utf-8')) as {
    composition: { styles?: boolean; steps: { id: string; verbatim?: boolean }[] }
  }
  assert.equal(doc.composition.styles, false, 'the builder declares that it takes no style')
  const shape = doc.composition.steps.find((x) => x.id === 'shape')
  assert.equal(shape?.verbatim, true, 'and the step that writes the document is verbatim')
})

/**
 * ⚠️ THE SHAPE A COMPOSITION EXISTS FOR — draw twelve, STOP AND ASK, carry on with the one.
 *
 * A `pick` step's id was in no set the parser checked references against, so nothing downstream
 * could name what you chose: `each` refused it, `parts` refused it. The runner has always put the
 * chosen asset in `out` under the pick's own id — this was the parser being stricter than the thing
 * it guards, on the one feature that makes a chain more than a macro.
 */
test('what a pick chose is something later steps can name', async () => {
  const { parseComposition } = await import('../src/compositions/registry.ts')
  const { ctx } = await import('../src/validate.ts')

  const c = ctx('x')
  const one = parseComposition(c, {
    slug: 'w', label: 'w', family: 'x',
    steps: [
      { id: 'takes', makes: 'image', repeat: 4, inputs: { prompt: 'ask' } },
      { id: 'review', pick: 'takes', asks: 'which one?' },
      { id: 'skins', makes: 'image', each: 'review', inputs: { ref: 'review' } },
      { id: 'file', binds: 'pdf', parts: 'skins' },
    ],
  })
  assert.deepEqual(c.issues, [])
  assert.equal(one?.steps.length, 4)

  // ⚠️ AND A BIND MAY TAKE THE ONE YOU CHOSE. One page is a real book.
  const b = ctx('x')
  parseComposition(b, {
    slug: 'w', label: 'w', family: 'x',
    steps: [
      { id: 'takes', makes: 'image', repeat: 4, inputs: { prompt: 'ask' } },
      { id: 'review', pick: 'takes' },
      { id: 'file', binds: 'pdf', parts: 'review' },
    ],
  })
  assert.deepEqual(b.issues, [])

  // ⚠️ CHOOSING FROM A CHOICE IS STILL NOT A SHAPE THIS APP HAS. `pressed` stays presses only.
  const twice = ctx('x')
  parseComposition(twice, {
    slug: 'w', label: 'w', family: 'x',
    steps: [
      { id: 'takes', makes: 'image', repeat: 4, inputs: { prompt: 'ask' } },
      { id: 'review', pick: 'takes' },
      { id: 'again', pick: 'review' },
    ],
  })
  assert.ok(twice.issues.some((i) => i.includes('review')), 'a pick of a pick is refused')
})

/** ⚠️ AND A PICK OVER WORDS IS REFUSED. "Review the cards before art" is a reasonable thing to want
 *  and not a thing this app does — it installed cleanly and failed on step two. */
test('a pick chooses between renders, never between words', async () => {
  const { parseComposition } = await import('../src/compositions/registry.ts')
  const { ctx } = await import('../src/validate.ts')
  const c = ctx('x')
  parseComposition(c, {
    slug: 'w', label: 'w', family: 'x',
    steps: [
      { id: 'concepts', makes: 'text', list: true, says: 'one per line', inputs: { prompt: 'ask' } },
      { id: 'review', pick: 'concepts', asks: 'confirm the batch' },
    ],
  })
  assert.ok(c.issues.some((i) => i.includes('concepts') && i.includes('look at')),
    'it says what a pick is for, not just that this one is wrong')
})
