// PROVENANCE, WRITTEN INTO THE FILE (PLAN §4) — the carrier, and only the carrier.
//
// XMP, because `sharp` has no API for PNG text chunks (it offers withExif / withXmp /
// withIccProfile) and our masters are `.webp` anyway, which no PNG-info reader looks at. So
// A1111 compatibility was never on the table and the honest goal is SELF-DESCRIBING TO US,
// BEST-EFFORT TO OTHERS.
//
// The record travels as ONE JSON payload in one property under our own namespace. That is what
// lets it be written and read back WITHOUT A PARSER — a fifth dependency for a document we
// wrote ourselves would be absurd, and `sharp` hands EXIF back as a raw Buffer, which is why
// EXIF was not the carrier either.
//
// ⚠️ `sharp` has NO in-place metadata write: adding a field later means re-encoding the pixels
// (PLAN §6). Everything the record holds — tags included — is therefore known before the master
// is written, which the builder shape already guarantees.
//
// ⚠️ EXPORTS STRIP THIS. Provenance is for the library, not the deliverable.

import { REF_SLOTS } from '../types/workflow.ts'
import type { Provenance, ProvenanceRef } from '../types/provenance.ts'
import { MEDIA } from '../types/medium.ts'
import type { ParamValue, Params } from '../types/request.ts'
import { asArray, asEnum, asNumber, asObject, asString, asStringArray, ctx, issue, noStrayKeys } from '../validate.ts'

/** Our XMP namespace. Versioned in the URI so a future record shape can be told apart from
 *  this one by a reader that only has the file. */
export const XMP_NS = 'https://xoko.lat/ns/provenance/1.0/'
export const XMP_PREFIX = 'xokolat'
/** The one property. A flat JSON payload, not a tree of RDF — the whole point is that reading
 *  it back is a regex and a `JSON.parse`. */
export const XMP_PROPERTY = 'record'

const ESCAPES: readonly (readonly [RegExp, string])[] = [
  [/&/g, '&amp;'], [/</g, '&lt;'], [/>/g, '&gt;'], [/"/g, '&quot;'], [/'/g, '&apos;'],
]

const escapeXml = (s: string): string => ESCAPES.reduce((acc, [re, to]) => acc.replace(re, to), s)

/** Unescape in the reverse order, and `&amp;` LAST — otherwise `&amp;lt;` decodes to `<`. */
const unescapeXml = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** Serialize a record into an XMP packet suitable for `sharp.withXmp()`. */
export function toXmp(prov: Provenance): string {
  const payload = escapeXml(JSON.stringify(prov))
  return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>'
    + '<x:xmpmeta xmlns:x="adobe:ns:meta/">'
    + '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + `<rdf:Description rdf:about="" xmlns:${XMP_PREFIX}="${XMP_NS}">`
    + `<${XMP_PREFIX}:${XMP_PROPERTY}>${payload}</${XMP_PREFIX}:${XMP_PROPERTY}>`
    + '</rdf:Description></rdf:RDF></x:xmpmeta>'
    + '<?xpacket end="w"?>'
}

const PROPERTY_RE = new RegExp(`<${XMP_PREFIX}:${XMP_PROPERTY}>([\\s\\S]*?)</${XMP_PREFIX}:${XMP_PROPERTY}>`)

/**
 * Read a record back out of an XMP packet. Returns null for anything that is not ours — a file
 * from another tool, an older shape, a packet we cannot make sense of. Never throws: the index
 * walks every file on disk, most of which it did not write.
 */
export function fromXmp(xmp: string | Buffer | undefined | null): Provenance | null {
  if (!xmp) return null
  const text = typeof xmp === 'string' ? xmp : xmp.toString('utf-8')
  const match = PROPERTY_RE.exec(text)
  if (!match?.[1]) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(unescapeXml(match[1]))
  } catch {
    return null
  }
  return parseProvenance(parsed)
}

const RECORD_KEYS = [
  'modality', 'provider', 'model', 'workflow', 'style', 'prompt', 'seed', 'params', 'tags', 'refs',
  'runId', 'createdAt', 'durationMs', 'quality',
] as const satisfies readonly (keyof Provenance)[]

/** ⚠️ ABSENT is legal and means "nothing was attached" — every master written before references
 *  existed is still a valid record, and refusing them would blank the whole library. */
function parseRefs(v: unknown): readonly ProvenanceRef[] | null {
  if (v === undefined) return []
  const c = ctx('')
  const list = asArray(c, v, '')
  if (!list) return null
  const out: ProvenanceRef[] = []
  for (const entry of list) {
    const o = asObject(c, entry, '')
    if (!o) return null
    const asset = asString(c, o['asset'], 'asset')
    const role = asEnum(c, o['role'], 'role', REF_SLOTS)
    if (!asset || !role) return null
    out.push({ asset, role })
  }
  return out
}

function parseParams(v: unknown): Params | null {
  const c = ctx('')
  const o = asObject(c, v, '')
  if (!o) return null
  const out: Record<string, ParamValue> = {}
  for (const [key, value] of Object.entries(o)) {
    if (typeof value === 'string' || typeof value === 'boolean') out[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else return null
  }
  return out
}

/** The same hand-written discipline as the registries: a record we cannot fully vouch for is
 *  no record. A half-read provenance chip is worse than an honest blank one. */
export function parseProvenance(v: unknown): Provenance | null {
  const c = ctx('provenance')
  const o = asObject(c, v, '')
  if (!o) return null
  noStrayKeys(c, o, '', RECORD_KEYS)

  const modality = asEnum(c, o['modality'], 'modality', MEDIA)
  const provider = asString(c, o['provider'], 'provider')
  const runId = asString(c, o['runId'], 'runId')
  const createdAt = asString(c, o['createdAt'], 'createdAt')
  const tags = asStringArray(c, o['tags'], 'tags')
  const params = parseParams(o['params'])
  if (params === null) issue(c, 'params', 'expected an object of scalar knobs')
  const refs = parseRefs(o['refs'])
  if (refs === null) issue(c, 'refs', 'expected a list of { asset, role }')

  const nullableString = (key: 'model' | 'workflow' | 'prompt'): string | null | undefined =>
    o[key] === null ? null : asString(c, o[key], key)
  const model = nullableString('model')
  const workflow = nullableString('workflow')
  const prompt = nullableString('prompt')
  // ⚠️ ABSENT is legal and means "no style was recorded" — every master written before this field
  // existed is still a valid record, and it is an ABSENCE rather than "no style was used". The
  // chip simply does not appear, which is the honest thing for a fact nobody wrote down.
  const style = o['style'] === undefined || o['style'] === null
    ? null
    : asString(c, o['style'], 'style')
  const seed = o['seed'] === null ? null : asNumber(c, o['seed'], 'seed', { int: true })
  // ⚠️ ABSENT is legal and means null: every master written before this field existed is still
  // a valid record, and refusing them would blank the provenance chip on the whole library.
  const durationMs = o['durationMs'] === undefined || o['durationMs'] === null
    ? null
    : asNumber(c, o['durationMs'], 'durationMs', { int: true, min: 0 })
  // ⚠️ ABSENT is legal and names the default level: every master written before this field
  // existed was written at what is now called `balanced`, so this is a fact, not a guess.
  const quality = o['quality'] === undefined ? 'webp-q92' : asString(c, o['quality'], 'quality')

  if (c.issues.length) return null
  if (!modality || !provider || !runId || !createdAt || !tags || !params || !refs
    || model === undefined || workflow === undefined || prompt === undefined || seed === undefined
    || style === undefined || durationMs === undefined || quality === undefined) {
    return null
  }
  return {
    modality, provider, model, workflow, style, prompt, seed, params, tags, refs, runId, createdAt,
    durationMs, quality,
  }
}
