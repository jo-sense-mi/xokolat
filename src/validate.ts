// Hand-written validation, and no validator package (PLAN §14). ~10 registry shapes do not
// justify `ajv`, and reaching for it would break the five-dependency rule on day one.
//
// These are the primitives every registry guard is built from. They never throw: each records
// an issue and returns `undefined`, so ONE pass reports EVERY problem in a file instead of the
// first — which is the difference between fixing a registry once and fixing it five times.

export interface Ctx {
  /** What is being read, for the message: a file path, an endpoint. */
  readonly where: string
  readonly issues: string[]
}

export function ctx(where: string): Ctx {
  return { where, issues: [] }
}

export function issue(c: Ctx, path: string, msg: string): undefined {
  c.issues.push(`${c.where}${path ? ` ${path}` : ''}: ${msg}`)
  return undefined
}

const typeName = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v

export function asObject(c: Ctx, v: unknown, path: string): Record<string, unknown> | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return issue(c, path, `expected an object, got ${typeName(v)}`)
  }
  return v as Record<string, unknown>
}

export function asArray(c: Ctx, v: unknown, path: string): unknown[] | undefined {
  if (!Array.isArray(v)) return issue(c, path, `expected an array, got ${typeName(v)}`)
  return v
}

export function asString(
  c: Ctx, v: unknown, path: string, opts: { pattern?: RegExp } = {},
): string | undefined {
  if (typeof v !== 'string') return issue(c, path, `expected a string, got ${typeName(v)}`)
  if (opts.pattern && !opts.pattern.test(v)) {
    return issue(c, path, `${JSON.stringify(v)} does not match ${opts.pattern}`)
  }
  return v
}

export function asNumber(
  c: Ctx, v: unknown, path: string, opts: { int?: boolean; min?: number; max?: number } = {},
): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return issue(c, path, `expected a number, got ${typeName(v)}`)
  }
  if (opts.int && !Number.isInteger(v)) return issue(c, path, `expected a whole number, got ${v}`)
  if (opts.min !== undefined && v < opts.min) return issue(c, path, `must be ≥ ${opts.min}, got ${v}`)
  if (opts.max !== undefined && v > opts.max) return issue(c, path, `must be ≤ ${opts.max}, got ${v}`)
  return v
}

export function asBoolean(c: Ctx, v: unknown, path: string): boolean | undefined {
  if (typeof v !== 'boolean') return issue(c, path, `expected true or false, got ${typeName(v)}`)
  return v
}

/** A value from a closed vocabulary. The message lists the whole vocabulary, because the
 *  person reading it is holding a typo, not a spec. */
export function asEnum<T extends string>(
  c: Ctx, v: unknown, path: string, allowed: readonly T[],
): T | undefined {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    return issue(c, path, `expected one of ${allowed.join(' · ')}, got ${JSON.stringify(v)}`)
  }
  return v as T
}

/** An inclusive `[min, max]` band, as `caps.words` and `caps.resolution` use. */
export function asBand(c: Ctx, v: unknown, path: string): readonly [number, number] | undefined {
  const arr = asArray(c, v, path)
  if (!arr) return undefined
  if (arr.length !== 2) return issue(c, path, `expected [min, max], got ${arr.length} entries`)
  const min = asNumber(c, arr[0], `${path}[0]`)
  const max = asNumber(c, arr[1], `${path}[1]`)
  if (min === undefined || max === undefined) return undefined
  if (min > max) return issue(c, path, `min ${min} is greater than max ${max}`)
  return [min, max]
}

/** An array of strings from a closed vocabulary, deduped in place so a registry cannot make
 *  downstream code think about duplicates. */
export function asEnumArray<T extends string>(
  c: Ctx, v: unknown, path: string, allowed: readonly T[],
): T[] | undefined {
  const arr = asArray(c, v, path)
  if (!arr) return undefined
  const out: T[] = []
  for (const [i, entry] of arr.entries()) {
    const val = asEnum(c, entry, `${path}[${i}]`, allowed)
    if (val !== undefined && !out.includes(val)) out.push(val)
  }
  return out
}

export function asStringArray(c: Ctx, v: unknown, path: string): string[] | undefined {
  const arr = asArray(c, v, path)
  if (!arr) return undefined
  const out: string[] = []
  for (const [i, entry] of arr.entries()) {
    const val = asString(c, entry, `${path}[${i}]`)
    if (val !== undefined) out.push(val)
  }
  return out
}

/** A knob bag: scalars only. A knob that needs an object is a capability in disguise. */
export function asParams(
  c: Ctx, v: unknown, path: string,
): Record<string, string | number | boolean> | undefined {
  const o = asObject(c, v, path)
  if (!o) return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(o)) {
    if (typeof value === 'string' || typeof value === 'boolean') out[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else issue(c, `${path}.${key}`, `expected a string, number or boolean, got ${typeName(value)}`)
  }
  return out
}

/** Lowercase kebab, the one slug shape in the app: registry ids, style slugs, run folders. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Warn about keys nobody reads. A typo'd optional field is otherwise a silent no-op — the
 *  registry looks configured and behaves as if it were not. Comment keys (`$note`) are exempt,
 *  since JSON has none of its own. */
export function noStrayKeys(c: Ctx, o: Record<string, unknown>, path: string, known: readonly string[]): void {
  for (const key of Object.keys(o)) {
    if (key.startsWith('$') || known.includes(key)) continue
    issue(c, path ? `${path}.${key}` : key, `unknown field — nothing reads it`)
  }
}
