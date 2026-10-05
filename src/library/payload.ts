// READING WHAT THE LIBRARY PUBLISHES — the envelope, and nothing else.
//
// ⚠️ THIS MODULE VALIDATES ALMOST NOTHING, ON PURPOSE. Every published file is
// `{ format, type, … }` wrapped around an object this app ALREADY has a parser for, and those
// parsers are hostile, well-tested and the same ones the on-disk files go through. A second set of
// rules here would be a second opinion about what a workflow is — and the two would drift, with the
// downloaded copy passing a check the local one fails or the other way round.
//
// So all this does is: know the envelope, refuse a shape it does not know BY NAME, and hand the
// inside to the existing parser. What comes back is shaped for the writer that will store it —
// a workflow arrives as the partial row `saveService` takes, so taking one is a merge and a write
// rather than a translation.
//
// ⚠️ THE SITE IS A FILE SERVER AND NOTHING IT SENDS IS TRUSTED. A published file cannot cause
// anything to run; the most it can do is be refused, or be written into a registry layer the user
// owns and can edit and delete. That is what makes publishing safe at all, and it is why the
// answer to "should we check this harder" is always "check it with the parser we already have".

import type { InferenceRow } from '../types/inference.ts'
import type { Medium } from '../types/medium.ts'
import { MEDIA } from '../types/medium.ts'
import type { Composition } from '../types/composition.ts'
import type { ResolvedStyle } from '../types/style.ts'
import { CompositionError, readDraft as readCompositionDraft } from '../compositions/registry.ts'
import { parseInferenceRow } from '../inference/registry.ts'
import { StyleError, readDraft } from '../styles/registry.ts'
import { asEnum, asObject, asString, ctx, noStrayKeys } from '../validate.ts'

/**
 * The format number this app knows.
 *
 * ⚠️ REFUSING AN UNKNOWN ONE IS THE ENTIRE REASON THE FIELD EXISTS. A file from a later library
 * says so in its first field, and the honest answer is "this app is too old for that", not a
 * best-effort read of a shape nobody here has seen.
 */
export const LIBRARY_FORMAT = 1

/** The nouns the library publishes. All three land now (2026-08-22); `composition` spent four
 *  months in this list purely so it could be refused by name. */
export const PAYLOAD_TYPES = ['workflow', 'style', 'composition'] as const
export type PayloadType = (typeof PAYLOAD_TYPES)[number]

export type Payload =
  | {
    readonly type: 'style'
    readonly medium: Medium
    readonly style: ResolvedStyle
  }
  | {
    readonly type: 'composition'
    readonly composition: Composition
    /**
     * THE WORKFLOWS IT WAS BUILT AGAINST, bundled by the publisher under `<service>/<slug>`.
     *
     * ⚠️ THEY ARE READ HERE AND INSTALLED SEPARATELY, each through the ordinary workflow path. A
     * composition that arrived with workflows nobody could inspect would be a composition that
     * installs engines by the back door; going through `takeWorkflow` means every one of them meets
     * the same parser, the same merge and the same requirements check a hand-taken one does — and
     * one whose service is not on this machine simply does not land, and is reported.
     */
    readonly workflows: readonly { readonly id: string; readonly payload: Payload }[]
  }
  | {
    readonly type: 'workflow'
    readonly service: string
    /**
     * ⚠️ A PARTIAL ROW, WHICH IS EXACTLY WHAT `saveService` TAKES. `{ id, workflows, engines }` — the
     * service itself is not in here and must not be: how to REACH a thing is the app's own, ships
     * with it, and a downloaded file that could rewrite a transport would be a downloaded file that
     * chooses what this process talks to.
     */
    readonly row: InferenceRow
  }

export class PayloadError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'PayloadError'
    this.status = status
  }
}

/** Turn the app's issue list into one sentence. Every parser here reports EVERY problem in one
 *  pass, and throwing away all but the first would mean fixing a file one line per attempt. */
const refuse = (issues: readonly string[], fallback: string): never => {
  throw new PayloadError(issues.length ? issues.join('; ') : fallback)
}

/**
 * Read one published file.
 *
 * `where` is only for the message — a URL, a path, whatever the caller was holding when it got
 * this. Throws `PayloadError` for anything it will not take.
 */
export function readPayload(v: unknown, where = 'this file'): Payload {
  const c = ctx(where)
  const o = asObject(c, v, '')
  if (!o) refuse(c.issues, `${where} is not a published file`)

  // ⚠️ FORMAT FIRST, BEFORE ANY OTHER FIELD IS READ. A file from a format this app does not know
  // may have moved every field below; reading one and complaining about it would report the wrong
  // problem — "no service" instead of "this app is too old".
  if (o!['format'] !== LIBRARY_FORMAT) {
    throw new PayloadError(
      `${where} is format ${JSON.stringify(o!['format'])} and this app reads format ${LIBRARY_FORMAT}`
        + ' — a newer library needs a newer app',
    )
  }

  const type = asEnum(c, o!['type'], 'type', PAYLOAD_TYPES)
  if (!type) refuse(c.issues, `${where} does not say what it is`)

  if (type === 'composition') return readComposition(c, o!, where)
  if (type === 'style') return readStyle(c, o!, where)
  return readWorkflow(c, o!, where)
}

/**
 * A composition, and the workflows bundled with it.
 *
 * ⚠️ THE BUNDLE IS READ WITH THIS SAME FUNCTION, one level down. Each entry under `workflows` is a
 * whole published file — format field and all — so it goes through `readPayload` rather than a
 * relaxed inner reader. That is what stops "bundled" from meaning "less checked", and it is why a
 * composition cannot smuggle a shape a top-level file would be refused for.
 *
 * ⚠️ AND A BUNDLE THAT IS NOT WORKFLOWS IS REFUSED. A composition carrying a composition is a graph
 * this app has no reason to walk, and a composition carrying a style would be a second place
 * styles arrive from.
 */
function readComposition(c: ReturnType<typeof ctx>, o: Record<string, unknown>, where: string): Payload {
  noStrayKeys(c, o, '', ['format', 'type', 'composition', 'workflows'])
  if (c.issues.length) refuse(c.issues, `${where} is not a composition`)

  let composition: Composition
  try {
    // ⚠️ THE PARSER THE FOLDER USES. Same closed input list, same "an input names an EARLIER step",
    // same ceiling on `repeat` — a downloaded composition meets exactly the rules a hand-written
    // one does, and one that loads is one that can run.
    composition = readCompositionDraft(o['composition'])
  } catch (err) {
    if (err instanceof CompositionError) throw new PayloadError(`${where}: ${err.message}`, err.status)
    throw err
  }

  const bundled = o['workflows'] === undefined ? {} : asObject(c, o['workflows'], 'workflows')
  if (c.issues.length || !bundled) refuse(c.issues, `${where} has a bad workflow bundle`)
  const workflows = Object.entries(bundled!).map(([id, payload]) => {
    const inner = readPayload(payload, `${where} → ${id}`)
    if (inner.type !== 'workflow') {
      throw new PayloadError(`${where} bundles ${JSON.stringify(id)}, which is a ${inner.type} and not a workflow`)
    }
    return { id, payload: inner }
  })
  return { type: 'composition', composition, workflows }
}

/**
 * WHAT A CHAIN WROTE, READ AS A PUBLISHED FILE — the composition builder's output.
 *
 * ⚠️ IT TRIMS, IT DOES NOT REPAIR. A brain asked for JSON and nothing else will now and then wrap
 * it in a fence or open with a sentence, so the first `{` and the last `}` are the document. What
 * is between them is parsed exactly as it arrived: a composition this app "fixed" would be one
 * nobody can account for.
 *
 * ⚠️ AND THE ENVELOPE'S TWO BOOKKEEPING FIELDS ARE FILLED IN RATHER THAN DEMANDED. `format` exists
 * to refuse a file from a LATER library, and a document written here half a second ago has no later
 * library to have come from; `type` is the only thing it could be at this door. Refusing over
 * either would be refusing the right document for a reason that is about publishing — and the one
 * field a person never sees is a poor place to fail. Everything the parsers actually care about —
 * every step, every reference, every hole of every workflow it brings — is checked exactly as a
 * downloaded file's is, one line below.
 */
export function readWritten(text: string): Payload {
  const from = text.indexOf('{')
  const to = text.lastIndexOf('}')
  if (from < 0 || to < from) {
    throw new PayloadError('that is not a JSON document — there is no object in it')
  }
  let doc: Record<string, unknown>
  try {
    doc = JSON.parse(text.slice(from, to + 1)) as Record<string, unknown>
  } catch (err) {
    throw new PayloadError(`that is not valid JSON: ${(err as Error).message}`)
  }
  const payload = readPayload({ format: LIBRARY_FORMAT, type: 'composition', ...doc }, 'what this run wrote')
  if (payload.type !== 'composition') {
    throw new PayloadError('that is not a composition — this installs a composition and the workflows'
      + ' it brings with it')
  }
  return payload
}

function readStyle(c: ReturnType<typeof ctx>, o: Record<string, unknown>, where: string): Payload {
  noStrayKeys(c, o, '', ['format', 'type', 'medium', 'style'])
  const medium = asEnum(c, o['medium'], 'medium', MEDIA)
  if (c.issues.length || !medium) refuse(c.issues, `${where} is not a style`)
  try {
    // ⚠️ THE PARSER THE EDITOR USES. `readDraft` is what a style typed into the app goes through on
    // its way to being saved — same key list, same reserved slug, same refusal of a style that
    // adds no words at all. A downloaded style meets exactly the rules a typed one does.
    return { type: 'style', medium: medium!, style: readDraft(medium!, o['style']) }
  } catch (err) {
    if (err instanceof StyleError) throw new PayloadError(`${where}: ${err.message}`, err.status)
    throw err
  }
}

function readWorkflow(c: ReturnType<typeof ctx>, o: Record<string, unknown>, where: string): Payload {
  noStrayKeys(c, o, '', ['format', 'type', 'service', 'workflow', 'engine'])
  const service = asString(c, o['service'], 'service')
  if (c.issues.length || !service) refuse(c.issues, `${where} is not a workflow`)

  // ⚠️ PARSED AS A ROW, BECAUSE THAT IS THE PARSER THAT EXISTS. `parseWorkflow` and `parseEngine` are
  // internal to the registry and should stay that way — a workflow is only ever meaningful under a
  // service, and wrapping it in the partial row that `saveService` accepts validates it through the
  // identical path a hand-edited `<data>/registries/inference.json` takes.
  //
  // `partial` because this IS an override and not a whole row: no transport, no health, no launch.
  // The whole-row checks belong after the merge, where the shipped row is there to merge onto.
  const engine = o['engine']
  const row = parseInferenceRow(c, {
    id: service,
    workflows: [o['workflow']],
    ...(engine === undefined ? {} : { engines: [engine] }),
  }, '', { partial: true })
  if (c.issues.length || !row) refuse(c.issues, `${where} is not a workflow`)

  // A published file with no workflow in it is a file that would land as an empty override — nothing
  // added, nothing said, and a person told it worked.
  if (!row!.workflows?.length) throw new PayloadError(`${where} carries no workflow`)
  return { type: 'workflow', service: service!, row: row! }
}
