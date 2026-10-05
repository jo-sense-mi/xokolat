// Reading a request off the wire. The browser is not trusted to be correct — not because it is
// hostile, but because a typo in a payload builder must fail loudly here rather than land
// halfway through a render.

import { MEDIA } from '../types/medium.ts'
import type { Medium } from '../types/medium.ts'
import { REF_SLOTS } from '../types/workflow.ts'
import type { InferenceSelection, GenerationRequest, Reference } from '../types/request.ts'
import type { Ctx } from '../validate.ts'
import { SLUG, asArray, asEnum, asObject, asParams, asString, issue, noStrayKeys } from '../validate.ts'

/**
 * Every key a request may carry. Exported because it is also the CONTRACT THE BROWSER IS HELD
 * TO: `tests/request-shape.test.ts` reads the payload builders in `web/` and checks their keys
 * against this list, because those files are plain JS and `tsc` has no opinion about them.
 * That gap is how a rename once shipped a front end sending `engines:` to a parser that had
 * moved on to `inference:` — green checks, broken app (DECISIONS.md, 2026-08-03).
 *
 * ⚠️ NO `count` (2026-08-07). Not deprecated — GONE: a payload that still sends one is refused
 * BY NAME here, which is how a stale builder is found rather than quietly ignored.
 */
export const REQUEST_KEYS = [
  'medium', 'text', 'title', 'style', 'inference', 'refs', 'params', 'composition',
] as const

export function parseGenerationRequest(c: Ctx, v: unknown): GenerationRequest | undefined {
  const o = asObject(c, v, '')
  if (!o) return undefined
  noStrayKeys(c, o, '', REQUEST_KEYS)

  const medium = asEnum<Medium>(c, o['medium'], 'medium', MEDIA)
  // ⚠️ AN EMPTY SENTENCE IS LEGAL HERE, AND ONLY HERE (2026-08-12). It was refused outright, which
  // is right for every workflow that takes a `prompt` and wrong for the ones that do not: a cutout is
  // a picture and no words. Whether words are required is a fact about the armed WORKFLOW, and this
  // parser has no registry to ask — so the check moved to `startRun`, which resolves the workflow
  // and refuses by name ("klein-i2i needs a sentence").
  const text = asString(c, o['text'], 'text')

  // Absent, null and empty all mean the same thing — name it from the sentence — because a
  // control that was left blank sends `''` and a caller that has no opinion sends nothing.
  const title = o['title'] === undefined || o['title'] === null
    ? undefined
    : asString(c, o['title'], 'title')

  const style = o['style'] === undefined || o['style'] === null
    ? null
    : asString(c, o['style'], 'style')
  const params = o['params'] === undefined ? undefined : asParams(c, o['params'], 'params')

  const list = asArray(c, o['inference'], 'inference')
  const inference: InferenceSelection[] = []
  for (const [i, entry] of (list ?? []).entries()) {
    const eo = asObject(c, entry, `inference[${i}]`)
    if (!eo) continue
    noStrayKeys(c, eo, `inference[${i}]`, ['id', 'workflow', 'params'])
    const id = asString(c, eo['id'], `inference[${i}].id`)
    const workflow = eo['workflow'] === undefined
      ? undefined
      : asString(c, eo['workflow'], `inference[${i}].workflow`)
    const eParams = eo['params'] === undefined
      ? undefined
      : asParams(c, eo['params'], `inference[${i}].params`)
    if (id) {
      inference.push({
        id,
        ...(workflow === undefined ? {} : { workflow }),
        ...(eParams === undefined ? {} : { params: eParams }),
      })
    }
  }
  if (list && !inference.length) issue(c, 'inference', 'pick at least one inference service')

  // 🧩 WHICH CHAIN PRESSED THIS, AND WHICH RUN OF IT. Three slugs, every one checked against the
  // same pattern, and none of them is joined to anything without `resolveIn` (§15 rule 2). The run
  // is the one the server minted at ▶ and the browser is quoting back — a name it cannot invent,
  // because a chain run that does not exist is refused when the first press tries to write into it.
  let composition: GenerationRequest['composition']
  if (o['composition'] !== undefined) {
    const co = asObject(c, o['composition'], 'composition')
    if (co) {
      noStrayKeys(c, co, 'composition', ['slug', 'run', 'step'])
      const slug = asString(c, co['slug'], 'composition.slug', { pattern: SLUG })
      const run = asString(c, co['run'], 'composition.run', { pattern: SLUG })
      const step = asString(c, co['step'], 'composition.step', { pattern: SLUG })
      if (slug && run && step) composition = { slug, run, step }
    }
  }

  const refs: Reference[] = []
  for (const [i, entry] of ((o['refs'] === undefined ? [] : asArray(c, o['refs'], 'refs')) ?? []).entries()) {
    const ro = asObject(c, entry, `refs[${i}]`)
    if (!ro) continue
    noStrayKeys(c, ro, `refs[${i}]`, ['asset', 'role'])
    const asset = asString(c, ro['asset'], `refs[${i}].asset`)
    const role = asEnum(c, ro['role'], `refs[${i}].role`, REF_SLOTS)
    if (asset && role) refs.push({ asset, role })
  }

  if (c.issues.length || !medium || text === undefined || style === undefined) {
    return undefined
  }
  return {
    medium, text, style, inference,
    ...(title ? { title } : {}),
    ...(refs.length ? { refs } : {}),
    ...(params === undefined ? {} : { params }),
    ...(composition === undefined ? {} : { composition }),
  }
}
