// A minimal FlatBuffers READER — for tests only, and for exactly one job: saying what is actually
// in a `configuration` buffer, ours or the reference implementation's.
//
// ⚠️ WHY READ RATHER THAN COMPARE BYTES. Two correct FlatBuffers of the same table are routinely
// different byte strings: the writer may lay fields out in any order, and padding follows from that
// order. A byte comparison against the Python bridge would therefore fail on nothing — and, worse,
// could be made to pass by matching its write order, which proves nothing about what the server
// reads. What the server reads is the field map, so that is what the test compares.
//
// The format, in the four facts this needs (the mirror of src/inference/draw-things/flatbuffer.ts):
//   1. A uint32 at 0 points at the root table.
//   2. A table's first 4 bytes are a SIGNED offset BACK to its vtable.
//   3. The vtable is: its own size, the table's size, then one uint16 per field — the field's
//      position relative to the table, or 0 for "not written, use the schema default".
//   4. Strings and vectors are pointed at by a uint32 offset relative to the pointer's own position.

export type FieldType = 'u16' | 'u32' | 'i8' | 'f32' | 'bool' | 'str' | 'strs' | 'tables'

export type FieldTypes = Readonly<Record<number, FieldType>>

/** What one table says: field index → value. A field absent from the vtable is absent here, which
 *  is the whole point — "not written" is a real answer, and it means the schema's default. */
export type Fields = Record<number, unknown>

const u16 = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8)

const view = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength)

/** Where a table's fields live, by index. Undefined for a field the writer left out. */
function slots(b: Uint8Array, table: number): Map<number, number> {
  const vtable = table - view(b).getInt32(table, true)
  const vtableBytes = u16(b, vtable)
  const out = new Map<number, number>()
  for (let i = 0; i * 2 + 4 < vtableBytes; i++) {
    const at = u16(b, vtable + 4 + i * 2)
    if (at) out.set(i, table + at)
  }
  return out
}

function readString(b: Uint8Array, pointer: number): string {
  const at = pointer + view(b).getUint32(pointer, true)
  const length = view(b).getUint32(at, true)
  return new TextDecoder().decode(b.subarray(at + 4, at + 4 + length))
}

/** The element positions of a vector, plus its length. */
function vector(b: Uint8Array, pointer: number): number[] {
  const at = pointer + view(b).getUint32(pointer, true)
  const length = view(b).getUint32(at, true)
  return Array.from({ length }, (_, i) => at + 4 + i * 4)
}

export function readTable(b: Uint8Array, table: number, types: FieldTypes): Fields {
  const out: Fields = {}
  for (const [index, at] of slots(b, table)) {
    const type = types[index]
    if (!type) {
      // ⚠️ NOT SKIPPED. A field one side writes and the other does not is exactly the divergence
      // this test exists to find, so an unnamed one is reported rather than quietly dropped.
      out[index] = `<field ${index}, not in the type table>`
      continue
    }
    const d = view(b)
    out[index] = type === 'u16' ? d.getUint16(at, true)
      : type === 'u32' ? d.getUint32(at, true)
      : type === 'i8' ? d.getInt8(at)
      : type === 'bool' ? d.getInt8(at) !== 0
      : type === 'f32' ? Math.round(d.getFloat32(at, true) * 1e6) / 1e6
      : type === 'str' ? readString(b, at)
      : type === 'strs' ? vector(b, at).map((p) => readString(b, p))
      : vector(b, at).map((p) => p + d.getUint32(p, true))
  }
  return out
}

/** The root table of a finished buffer. */
export const rootOf = (b: Uint8Array): number => view(b).getUint32(0, true)

/** A vector-of-tables field, read through with a second type table. */
export function readNested(b: Uint8Array, positions: unknown, types: FieldTypes): Fields[] {
  return (positions as number[] | undefined ?? []).map((at) => readTable(b, at, types))
}
