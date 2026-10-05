// THE SEAM BETWEEN THE BROWSER AND THE PARSER — the one place the type system cannot reach.
//
// `web/` is plain JS with no build step, so `tsc` never sees the payload builders. `npm run
// check` was green while the app could not render a single image, because the request key had
// been renamed `engines` → `inference` everywhere except the one file that WRITES it
// (DECISIONS.md, 2026-08-03).
//
// So the check is done here, against the source: every top-level key a `buildRequest()` returns
// has to be a key the parser accepts. This is not elegant, and a real type across the seam would
// be better — but a payload builder that disagrees with the parser is the failure this app has
// actually had, and a test that would have caught it beats one that is prettier.

import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { REQUEST_KEYS, parseGenerationRequest } from '../src/jobs/request.ts'
import { ctx } from '../src/validate.ts'

const PIPELINES = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'lib', 'pipelines')

/** Keys with no default — a builder that omits one of these produces a request that cannot run. */
const REQUIRED = ['medium', 'text', 'inference'] as const

/**
 * The top-level keys of the object literal a `buildRequest()` returns.
 *
 * A brace walk rather than a regex, because the literal contains nested ones —
 * `...(x ? { y } : {})` and `inference: [{ id, params }]` — whose keys are not request keys.
 * Strings and comments are skipped so a `:` inside one is never read as a key.
 *
 * ⚠️ SHORTHAND COUNTS. `{ inference }` is the same key as `inference: inference`, and a walker
 * that read only the colon form would have gone quiet the day a builder used it — which is
 * precisely the failure this file exists to prevent: a guard that silently checks nothing
 * (2026-08-07, when the multi-engine builder started assembling the list before returning it).
 */
function returnedKeys(source: string): string[] | null {
  const fn = source.indexOf('function buildRequest')
  if (fn < 0) return null
  const open = source.indexOf('return {', fn)
  if (open < 0) return null

  let depth = 0
  let flat = ''
  for (let i = source.indexOf('{', open); i < source.length; i++) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === '/' && (next === '/' || next === '*')) {
      const end = next === '/' ? source.indexOf('\n', i) : source.indexOf('*/', i) + 1
      i = end < 0 ? source.length : end
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i++; i < source.length && source[i] !== ch; i++) if (source[i] === '\\') i++
      continue
    }
    if (ch === '{' || ch === '[' || ch === '(') { depth++; continue }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth--
      if (depth === 0) break
      continue
    }
    if (depth === 1) flat += ch
  }
  // `name:` (a written key) or a bare `name` sitting alone between commas (shorthand). Spread
  // fragments left `...` behind, and their `.` is what keeps `...foo` out of the second form.
  return [...flat.matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1] as string)
    .concat([...flat.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=,|$)/g)].map((m) => m[1] as string))
}

test('every payload builder in web/ speaks the shape the parser accepts', async () => {
  const files = (await readdir(PIPELINES)).filter((f) => f.endsWith('.js'))
  assert.ok(files.length, 'no pipeline modules found — did web/lib/pipelines move?')

  let checked = 0
  for (const file of files) {
    const keys = returnedKeys(await readFile(join(PIPELINES, file), 'utf-8'))
    if (!keys) continue // a section with nothing to generate — 🔌, 🧩, 📁
    checked++
    for (const key of keys) {
      assert.ok(
        (REQUEST_KEYS as readonly string[]).includes(key),
        `${file} sends "${key}", which the parser rejects — REQUEST_KEYS is the contract`,
      )
    }
    for (const key of REQUIRED) {
      assert.ok(keys.includes(key), `${file} never sets "${key}"`)
    }
  }
  assert.ok(checked, 'no buildRequest() found in any pipeline — the guard is checking nothing')
})

test('the payload the images section builds is one the parser takes', () => {
  // The literal shape web/lib/pipelines/images.js produces, knobs and all.
  //
  // ⚠️ ASK-SHAPED KNOBS ONLY — no `steps`, no `cfg`. Those belong to the CHECKPOINT, and a request
  // that omits them gets 4 on klein and 16 on SDXL from each model's own declared params. Sending
  // an untouched field's displayed value is exactly how one engine's numbers reached another
  // engine's render (2026-08-07).
  const c = ctx('request')
  const request = parseGenerationRequest(c, {
    medium: 'image',
    text: 'a small cat',
    style: null,
    inference: [{
      id: 'draw-things-grpc',
      params: { width: 1024, height: 1024, model: 'flux_2_klein_4b_i8x.ckpt' },
    }],
  })
  assert.deepEqual(c.issues, [])
  assert.equal(request?.inference[0]?.id, 'draw-things-grpc')
  assert.equal(request?.inference[0]?.params?.['model'], 'flux_2_klein_4b_i8x.ckpt')
  assert.equal(request?.inference[0]?.params?.['steps'], undefined, 'the model brings its own')
})

test('a payload still carrying "count" is refused by name', () => {
  // ⚠️ NOT IGNORED. `count` went on 2026-08-07 — one press is one picture per engine, and ▶ again
  // is the variation button. A builder that has not caught up must fail loudly rather than have
  // its extra key quietly dropped; that is the whole job of `noStrayKeys`.
  const c = ctx('request')
  const request = parseGenerationRequest(c, {
    medium: 'image', text: 'a small cat', count: 3, inference: [{ id: 'draw-things-grpc' }],
  })
  assert.equal(request, undefined)
  assert.ok(c.issues.some((i) => i.includes('count')), c.issues.join('; '))
})

test('the key that broke the app is refused by name, not silently ignored', () => {
  const c = ctx('request')
  const request = parseGenerationRequest(c, {
    medium: 'image', text: 'a small cat', engines: [{ id: 'draw-things-grpc' }],
  })
  assert.equal(request, undefined)
  assert.ok(c.issues.some((i) => i.includes('engines')), c.issues.join('; '))
  assert.ok(c.issues.some((i) => i.includes('inference')), c.issues.join('; '))
})
