// A minimal FlatBuffers WRITER — enough to build one table, which is all Draw Things asks of
// us: its `configuration` field is a FlatBuffer-encoded GenerationConfiguration.
//
// Why not the `flatbuffers` package: it would be dependency number six, to serialise a single
// table into a format that is small, frozen and fully specified. §15 rule 3 says prefer stdlib
// over a package, every time, and §14 says five is the number to defend. Reading a FlatBuffer
// we did not write would be a different argument; we only ever write this one.
//
// The format, in the four facts that make the code below make sense:
//   1. The buffer is built BACKWARDS, from the end. Every offset is measured from the end.
//   2. A table is a vtable (field → where it is) plus the field data. The table's first 4 bytes
//      are a SIGNED offset back to its vtable.
//   3. ⚠️ A FIELD EQUAL TO ITS SCHEMA DEFAULT IS NOT WRITTEN AT ALL. The reader substitutes the
//      default. So the only way to send `false` for a field whose default is `true` is to write
//      it explicitly — see `addBool` and its callers in config.ts.
//   4. Everything is aligned to its own size, so the reader can read in place.

const SIZEOF_INT = 4
const SIZEOF_SHORT = 2

export class FlatBufferBuilder {
  #bytes: Uint8Array
  #view: DataView
  /** Free bytes at the FRONT — the write head moves down from the end. */
  #space: number
  #minalign = 1
  /** Per-field position within the table under construction; 0 means "not written". */
  #vtable: number[] = []
  #objectStart = 0
  #inObject = false

  constructor(initial = 1024) {
    this.#bytes = new Uint8Array(initial)
    this.#view = new DataView(this.#bytes.buffer)
    this.#space = initial
  }

  /** Distance from the end of the buffer — the coordinate everything else is expressed in. */
  #offset(): number {
    return this.#bytes.length - this.#space
  }

  #grow(): void {
    const old = this.#bytes
    const next = new Uint8Array(old.length * 2)
    next.set(old, old.length) // the data lives at the END, so it moves to the second half
    this.#bytes = next
    this.#view = new DataView(next.buffer)
    this.#space += old.length
  }

  /** Make room for `size` bytes (aligned) plus `additional` bytes that will follow it. */
  #prep(size: number, additional: number): void {
    if (size > this.#minalign) this.#minalign = size
    const alignSize = (~(this.#bytes.length - this.#space + additional) + 1) & (size - 1)
    while (this.#space < alignSize + size + additional) this.#grow()
    for (let i = 0; i < alignSize; i++) this.#bytes[--this.#space] = 0
  }

  #writeInt8(v: number): void { this.#view.setInt8(this.#space -= 1, v) }
  #writeInt16(v: number): void { this.#view.setInt16(this.#space -= 2, v, true) }
  #writeInt32(v: number): void { this.#view.setInt32(this.#space -= 4, v, true) }
  #writeInt64(v: bigint): void { this.#view.setBigInt64(this.#space -= 8, v, true) }
  #writeFloat32(v: number): void { this.#view.setFloat32(this.#space -= 4, v, true) }

  /** Remember that the field at `index` lives at the current position. */
  #slot(index: number): void {
    while (this.#vtable.length <= index) this.#vtable.push(0)
    this.#vtable[index] = this.#offset()
  }

  startObject(fields: number): void {
    if (this.#inObject) throw new Error('nested startObject')
    this.#inObject = true
    this.#vtable = new Array<number>(fields).fill(0)
    this.#objectStart = this.#offset()
  }

  /** Finish the table and return its offset. */
  endObject(): number {
    if (!this.#inObject) throw new Error('endObject without startObject')
    this.#prep(SIZEOF_INT, 0)
    this.#space -= SIZEOF_INT // placeholder for the offset back to the vtable
    const tableLoc = this.#offset()

    // Trailing empty slots carry no information, so the vtable is trimmed to its last used one.
    let last = this.#vtable.length - 1
    while (last >= 0 && this.#vtable[last] === 0) last--

    for (let i = last; i >= 0; i--) {
      const at = this.#vtable[i] ?? 0
      this.#writeInt16(at === 0 ? 0 : tableLoc - at)
    }
    this.#writeInt16(tableLoc - this.#objectStart) // size of the table's data
    this.#writeInt16((last + 1 + 2) * SIZEOF_SHORT) // size of the vtable itself
    const vtableLoc = this.#offset()

    // Every vtable is written out, even an identical one. Deduplication is an optimisation for
    // buffers with many tables; we write one.
    this.#view.setInt32(this.#bytes.length - tableLoc, vtableLoc - tableLoc, true)
    this.#inObject = false
    return tableLoc
  }

  addInt8(index: number, value: number, dflt: number): void {
    if (value === dflt) return
    this.#prep(1, 0); this.#writeInt8(value); this.#slot(index)
  }

  addBool(index: number, value: boolean, dflt: boolean): void {
    if (value === dflt) return
    this.#prep(1, 0); this.#writeInt8(value ? 1 : 0); this.#slot(index)
  }

  addInt16(index: number, value: number, dflt: number): void {
    if (value === dflt) return
    this.#prep(2, 0); this.#writeInt16(value); this.#slot(index)
  }

  addInt32(index: number, value: number, dflt: number): void {
    if (value === dflt) return
    this.#prep(4, 0); this.#writeInt32(value | 0); this.#slot(index)
  }

  /** uint32 fields (`seed`, `steps`) — the wire is 4 bytes either way; only the reader's
   *  interpretation differs, so the value is masked into range rather than sign-extended. */
  addUint32(index: number, value: number, dflt: number): void {
    if (value === dflt) return
    this.#prep(4, 0); this.#view.setUint32(this.#space -= 4, value >>> 0, true); this.#slot(index)
  }

  addInt64(index: number, value: bigint, dflt: bigint): void {
    if (value === dflt) return
    this.#prep(8, 0); this.#writeInt64(value); this.#slot(index)
  }

  addFloat32(index: number, value: number, dflt: number): void {
    if (value === dflt) return
    this.#prep(4, 0); this.#writeFloat32(value); this.#slot(index)
  }

  /** A reference to something already written (a string, a vector, a nested table). */
  addOffset(index: number, value: number): void {
    if (value === 0) return
    this.#prep(SIZEOF_INT, 0)
    this.#writeInt32(this.#offset() - value + SIZEOF_INT)
    this.#slot(index)
  }

  /** Write a string and return its offset. Strings are length-prefixed AND null-terminated —
   *  the terminator is not counted in the length. */
  createString(s: string): number {
    const utf8 = new TextEncoder().encode(s)
    this.#prep(1, 0); this.#writeInt8(0) // null terminator
    this.#prep(SIZEOF_INT, utf8.length)
    this.#space -= utf8.length
    this.#bytes.set(utf8, this.#space)
    this.#writeInt32(utf8.length)
    return this.#offset()
  }

  /** A vector of offsets (`controls`, `loras`), written last element first. */
  createOffsetVector(offsets: readonly number[]): number {
    this.#prep(SIZEOF_INT, SIZEOF_INT * offsets.length)
    for (let i = offsets.length - 1; i >= 0; i--) {
      const value = offsets[i] ?? 0
      this.#prep(SIZEOF_INT, 0)
      this.#writeInt32(this.#offset() - value + SIZEOF_INT)
    }
    this.#writeInt32(offsets.length)
    return this.#offset()
  }

  /** Finish the buffer with `root` as its root table, and hand back the bytes. */
  finish(root: number): Uint8Array {
    this.#prep(this.#minalign, SIZEOF_INT)
    this.#writeInt32(this.#offset() - root + SIZEOF_INT)
    return this.#bytes.subarray(this.#space)
  }
}
