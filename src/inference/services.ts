// ADDING A SERVICE — `<data>/registries/inference.json`, written by the app.
//
// ⚠️ WHY THIS EXISTS. Every service the app knew about was one it SHIPPED a row for, which is a
// fine story on this machine and no story at all on a fresh install: someone downloads xokolat,
// runs ComfyUI on :8188, and has no way to say so. The registry was always two layers; only one
// of them had a writer.
//
// ⚠️ WHAT THE BROWSER MAY SET, and why the list is short (PLAN §15 rule 1 — the browser never
// sends a command line):
//
//   label · role · medium · transport · caps · engines · notes    writable
//   launch · tiers · provision · supervise                        NOT, at any price
//   defaults                                                      not yet — hand-edit the file
//
// A row's `launch` carries a BINARY AND AN ARGV ARRAY. Letting a page POST one is letting a page
// choose what this process executes, which is the single thing rule 1 exists to make impossible —
// so a service you add is `external`: an endpoint the app points at and never starts. The shipped
// registry can declare managed launches because it is code, reviewed and signed with the app.
//
// ⚠️ AND `transport` IS WRITABLE THOUGH ONE KIND OF IT RUNS A COMMAND (2026-08-12). That is safe
// for exactly one reason: a `cli` transport carries no argv, only the NAME of a brain this build
// already ships (src/inference/cli/brains.ts), and `parseTransport` refuses any other name. The
// most a page can say is *which of the things the app already knows how to run* — which is what
// rule 1 asks for, rather than an exception to it.
//
// ⚠️ `workflows` JOINED ON 2026-08-12, and it is what makes a WORKFLOW an editable object. It is the
// unit a person actually picks — `sdxl-style-ref` is SDXL plus an IP-Adapter targeting the style
// blocks, and plain SDXL cannot do it at all — so a page that lists workflows and cannot touch one
// leaves "add the thing you want to be able to do" as a JSON edit. Same per-slug diff as `engines`:
// writing your own must not freeze a copy of the ones this app ships.
//
// ⚠️ `engines` JOINED THE LIST ON 2026-08-08, and it is the point of the whole file. A service is
// a PIPE — a host, a port, a transport — and the abilities belong to what is on the other end: one
// Draw Things serves a checkpoint that is distilled to 4 steps and reads no negative prompt, one
// that takes 28 free steps and does, and one that only makes sense with an `edit` reference. There
// is no true answer to "what can this service do", so a row's own `caps` is the FALLBACK a
// checkpoint inherits when it declares nothing — and a checkpoint that differs says so in its own
// row. Without a writer for `engines`, a service you added had exactly one describable capability
// for everything it serves, and anything the catalog could not report had none at all.
//
// ⚠️ A SPARSE PATCH OVER A SHIPPED ROW, same discipline as engine-params.json. Only the fields
// that actually DIFFER from the shipped row are stored — so typing the shipped port back in is a
// reset, and the day a shipped row changes, every field you never touched moves with it. For
// `engines` that comparison is PER FILE, because that is how the loader merges them.
//
// ⚠️ AND A POST IS A PATCH OVER YOUR OWN ROW: what it does not mention, it keeps. Two editors
// write here — the connection form and the per-checkpoint one — and a whole-row write would mean
// describing a checkpoint silently forgot the port you moved.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { resolveIn } from '../paths.ts'
import type { Roots } from '../paths.ts'
import type { Engine, InferenceRow } from '../types/inference.ts'
import type { Workflow } from '../types/workflow.ts'
import { SLUG, asArray, asObject, ctx } from '../validate.ts'
import { REGISTRY_FILE, checkRow, parseInferenceRow, readShippedRows } from './registry.ts'

export class ServiceError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ServiceError'
    this.status = status
  }
}

/** The fields a page may put in a row. Everything else is either the app's business or a way to
 *  hand this process a command to run. */
// ⚠️ `medium` LEFT THIS LIST ON 2026-09-06 — and left the row entirely. A service does not know
// what it makes; its workflows do (`mediaOf`, ./kinds.ts). `role` stays writable but is no longer
// ASKED: ＋ connect makes generators, ✨ xoko makes the one brain.
export const WRITABLE = [
  'label', 'role', 'transport', 'caps', 'engines', 'workflows', 'notes',
] as const

/** What a service you added gets probed with. Declared here rather than asked for: a health check
 *  is plumbing, and a row without one reports `unknown` forever. A command has no socket to open,
 *  so it is probed by running its version argv — and it gets longer, because starting a node
 *  process is not opening a TCP connection. An `http` row is asked a real question rather than
 *  dialled (src/inference/shelf.ts), and a question needs longer than a connect: what this row
 *  contributes there is the wait, not the kind. */
const defaultHealth = (row: InferenceRow): { kind: 'tcp' | 'command'; timeoutMs: number } =>
  (row.transport?.kind === 'cli'
    ? { kind: 'command', timeoutMs: 8000 }
    : { kind: 'tcp', timeoutMs: row.transport?.kind === 'http' ? 3000 : 1000 })

type Raw = Record<string, unknown>

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * What a field already MEANS on a shipped row that does not carry it.
 *
 * ⚠️ Without this, the ordinary edit stores noise. The form always sends every field it manages —
 * it has to, because a field it leaves out is one you reverted — so moving the port would also
 * write `role: "generator"` on a row that never said so: an override that changes nothing, sitting
 * in your file forever, pinning a default that might one day move.
 */
const implied = (shipped: InferenceRow, key: string): unknown =>
  key === 'role' ? 'generator' : key === 'label' ? shipped.id : undefined

/**
 * Which engine rows are actually YOURS — the ones the shipped list does not already say, compared
 * FILE BY FILE because that is how they merge (src/inference/registry.ts).
 *
 * A whole-list comparison would store all six shipped checkpoints the moment you described a
 * seventh, and every one of those six would then be a frozen copy pinning today's numbers. Sending
 * a file back exactly as it shipped is therefore a reset, exactly like typing the shipped port.
 */
function engineDiff(mine: readonly Engine[], shipped: readonly Engine[] | undefined): Engine[] {
  const base = new Map((shipped ?? []).map((e) => [e.file, e]))
  return mine.filter((e) => !same(e, base.get(e.file)))
}

/** The same, one level up: which WORKFLOWS are yours. Compared per slug, because that is how the
 *  loader merges them — writing your own workflow must not freeze a copy of the ten this app
 *  shipped, and sending one back unchanged is a reset. */
function workflowDiff(mine: readonly Workflow[], shipped: readonly Workflow[] | undefined): Workflow[] {
  const base = new Map((shipped ?? []).map((w) => [w.slug, w]))
  return mine.filter((w) => !same(w, base.get(w.slug)))
}

/** The user file as it is on disk — plain JSON, because this is the one place that EDITS it and
 *  a parsed row cannot be written back without losing anything the parser does not model. */
async function readRaw(roots: Roots): Promise<Raw[]> {
  const path = resolveIn(roots.data, REGISTRY_FILE)
  let text: string
  try {
    text = await readFile(path, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new ServiceError(`${path}: ${(err as Error).message}`, 500)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new ServiceError(`${path} is not valid JSON — ${(err as Error).message}`, 409)
  }
  const c = ctx(path)
  const o = asObject(c, parsed, '')
  const arr = o?.['services'] === undefined ? [] : asArray(c, o['services'], 'services')
  if (c.issues.length) throw new ServiceError(c.issues.join('; '), 409)
  return (arr ?? []).filter((r): r is Raw => !!r && typeof r === 'object' && !Array.isArray(r))
}

async function writeRaw(roots: Roots, rows: readonly Raw[]): Promise<void> {
  const path = resolveIn(roots.data, REGISTRY_FILE)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify({
    $comment: 'YOUR services, and your changes to the ones this app ships. A row whose id matches'
      + ' a shipped one overrides only the fields it names — delete a field (or the whole row) and'
      + " the shipped value comes back. Written by the app's 🔌 page; hand-editable.",
    services: rows,
  }, null, 2)}\n`, 'utf-8')
}

/**
 * THE FOLDER NAME, WORKED OUT FROM THE NAME YOU TYPED — never asked for.
 *
 * ⚠️ WHY THIS EXISTS (2026-09-06). Adding a service demanded an `id` — "lowercase words joined by
 * dashes" — before it would take anything else, and the first thing anyone connecting Draw Things
 * met was a request to invent a slug for a folder they will never open. No app asks that, and
 * nothing about it was ever a decision: an id is a fact about the filesystem, and the name is the
 * thing the person already knows.
 *
 * ⚠️ AND IT IS DERIVED IN EXACTLY ONE PLACE — here, on the way in. A form that computed its own
 * would be a second rule for the same string, and the two would disagree the first time either
 * moved. What a page sends is a NAME; what comes back is the id it got (`SaveResult.id`).
 *
 * Unique because it has to be: the id is the `<engine>` segment of every run folder and the
 * `provider` in a provenance record, so a second "Draw Things" is `draw-things-2` rather than a
 * silent write into the first one's history.
 */
export function idFromName(name: string, taken: Iterable<string>): string {
  const base = name.toLowerCase()
    // Accents fold to the letter underneath, so "Rêve" is `reve` rather than losing a letter.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!base) return ''
  const used = new Set(taken)
  if (!used.has(base)) return base
  // From 2, because the unsuffixed one is the first.
  for (let n = 2; n < 1000; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`
  return ''
}

export interface SaveResult {
  readonly id: string
  /** True when this id has no shipped row behind it. */
  readonly mine: boolean
  /** The fields actually stored — for a shipped row, only what differs from it. */
  readonly fields: readonly string[]
}

/**
 * Add a service, or change one.
 *
 * The whole edit arrives at once (a connection cannot be applied half-typed, unlike a knob), and
 * what is stored is the difference from the shipped row. An edit that leaves nothing different
 * REMOVES the override rather than storing a copy of the shipped values.
 */
export async function saveService(roots: Roots, want: unknown): Promise<SaveResult> {
  const o = asObject(ctx('service'), want, '')
  if (!o) throw new ServiceError('a service is an object of fields')

  // ⚠️ A NAME, NOT AN ID (2026-09-06). A page sends what the thing is CALLED and the id falls out
  // of it; an explicit id still wins, because `▶ take:` and a hand-edited file both name rows
  // directly and neither is typing into a form.
  const given = o['id']
  let id: string
  if (given === undefined || given === '') {
    const label = o['label']
    if (typeof label !== 'string' || !label.trim()) {
      throw new ServiceError('a service needs a name — the id is worked out from it')
    }
    const taken = [
      ...(await readShippedRows(roots)).map((r) => r.id),
      ...(await readRaw(roots)).map((r) => String(r['id'])),
    ]
    id = idFromName(label, taken)
    if (!id) throw new ServiceError(`no id could be made from ${JSON.stringify(label)} — try another name`)
  } else if (typeof given !== 'string' || !SLUG.test(given)) {
    throw new ServiceError('an id is lowercase words joined by dashes, e.g. `comfyui-local`')
  } else {
    id = given
  }

  const offered = Object.keys(o).filter((k) => k !== 'id')
  for (const key of offered) {
    if (!(WRITABLE as readonly string[]).includes(key)) {
      throw new ServiceError(
        key === 'launch' || key === 'tiers' || key === 'provision'
          ? `${key} is not something a page may set — it decides what this app runs, so a service you add is one it connects to, never one it starts`
          : `${key} is not a field you can set here (${WRITABLE.join(', ')})`,
      )
    }
  }
  if (!offered.length) throw new ServiceError('nothing to change')

  const shipped = (await readShippedRows(roots)).find((r) => r.id === id)

  // ⚠️ VALIDATED BY THE SAME PARSER THE FILE GOES THROUGH, never by a second set of rules here.
  // A page that could write a row the loader then refuses is a page that can brick the registry.
  const c = ctx('service')
  const parsed = parseInferenceRow(c, { ...o, id }, '', { partial: true })
  if (!parsed || c.issues.length) throw new ServiceError(c.issues.join('; ') || 'that is not a service row')

  const rows = await readRaw(roots)
  const previous = rows.find((r) => r['id'] === id) ?? {}

  // ⚠️ WHAT YOU DID NOT MENTION, YOU KEEP. Two forms write this row — the connection and one
  // checkpoint's description — and each sends only its own fields, so a whole-row write would mean
  // describing a checkpoint quietly dropped the port you moved. (This carries `health` and
  // anything hand-added too: it is your file, and this endpoint is not the thing that decides what
  // may be in it — `saveService` only decides what a PAGE may put there.)
  const stored: Raw = { id }
  for (const [key, value] of Object.entries(previous)) {
    if (key !== 'id' && !offered.includes(key)) stored[key] = value
  }

  // ⚠️ ONLY WHAT DIFFERS. Typing the shipped port back in is a reset — there is no copy of a
  // shipped value anywhere, which is why nothing here can drift from one.
  for (const key of WRITABLE) {
    const value = (parsed as unknown as Raw)[key]
    if (value === undefined) continue
    if (key === 'engines') {
      const kept = engineDiff(value as readonly Engine[], shipped?.engines)
      if (kept.length) stored['engines'] = kept
      continue
    }
    if (key === 'workflows') {
      const kept = workflowDiff(value as readonly Workflow[], shipped?.workflows)
      if (kept.length) stored['workflows'] = kept
      continue
    }
    if (shipped && same(value, (shipped as unknown as Raw)[key] ?? implied(shipped, key))) continue
    stored[key] = value
  }

  // ⚠️ THE ROW AS IT WILL ACTUALLY BE READ — shipped under what you already had under what you
  // just sent. Checking `shipped ∪ parsed` alone would refuse an engine-only save on a service of
  // your own for having no transport, when the transport is sitting in the row being patched.
  const merged = {
    ...(shipped ?? {}), ...(previous as unknown as InferenceRow), ...(parsed as InferenceRow),
  } as InferenceRow
  const check = ctx('service')
  if (!checkRow(check, merged, '')) throw new ServiceError(check.issues.join('; '))

  // A row with an endpoint and no way to check it reports `unknown` forever. The app declares the
  // probe rather than asking for one — it is plumbing, not a preference.
  if (!merged.health && merged.transport && (merged.launch?.mode ?? 'external') !== 'builtin') {
    stored['health'] = defaultHealth(merged)
  }

  const rest = rows.filter((r) => r['id'] !== id)
  const fields = Object.keys(stored).filter((k) => k !== 'id')
  // Nothing of yours left, and a shipped row underneath: the override is gone, not empty. `health`
  // does not count — the app put it there, so a row holding only that is not a decision of yours.
  const next = !fields.some((k) => k !== 'health') && shipped ? rest : [...rest, stored]
  await writeRaw(roots, next)
  return { id, mine: !shipped, fields }
}

export interface RemoveResult {
  readonly id: string
  /** True when a shipped row was underneath and is now showing again. */
  readonly reverted: boolean
}

/**
 * Remove a service you added, or your changes to one this app ships.
 *
 * ⚠️ ONE VERB FOR BOTH, because both are the same act on this file: forget my row. What follows
 * differs — your service disappears, a shipped one comes back as it shipped — and the answer says
 * which happened rather than the caller having to know beforehand.
 */
export async function removeService(roots: Roots, id: unknown): Promise<RemoveResult> {
  if (typeof id !== 'string' || !id) throw new ServiceError('which service? (id)')
  const rows = await readRaw(roots)
  if (!rows.some((r) => r['id'] === id)) {
    throw new ServiceError(
      `nothing of yours to remove for ${JSON.stringify(id)} — a service this app ships cannot be deleted, only overridden`,
      404,
    )
  }
  await writeRaw(roots, rows.filter((r) => r['id'] !== id))
  return { id, reverted: (await readShippedRows(roots)).some((r) => r.id === id) }
}
