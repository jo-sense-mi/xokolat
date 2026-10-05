// 🧊 THE .glb READER — the one piece of the mesh viewer that can be silently wrong.
//
// ⚠️ A RENDERER CANNOT BE TESTED HERE AND THIS IS NOT AN ATTEMPT TO. `mesh-view.js` needs a GPU and
// a canvas; what it draws is judged by looking at it. The READER is arithmetic — chunk framing,
// accessor offsets, a scene graph multiplied out — and every one of those fails as a mesh that
// renders perfectly while being the wrong shape, on its side, or empty. That is exactly the failure
// a person cannot tell from "the model came out badly", which is why it is checked here.
//
// The module is plain browser JS with no imports, so node runs it unchanged.

import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error — a front-end module with no types; this file is what checks its shape.
import { readGlb } from '../web/lib/glb.js'

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

/** A .glb container around one JSON document and one binary blob, padded exactly as the spec
 *  requires — the padding is half of what the chunk walk has to get right. */
function glb(json: unknown, bin: Uint8Array): ArrayBuffer {
  const text = new TextEncoder().encode(JSON.stringify(json))
  const pad = (n: number) => (4 - (n % 4)) % 4
  const jsonLen = text.length + pad(text.length)
  const binLen = bin.length + pad(bin.length)
  const total = 12 + 8 + jsonLen + 8 + binLen
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonLen, true)
  dv.setUint32(16, JSON_CHUNK, true)
  out.set(text, 20)
  // JSON pads with SPACES and BIN pads with zeros. Getting this wrong makes a valid file unreadable
  // by other tools, which is the kind of bug that only shows up in somebody else's viewer.
  out.fill(0x20, 20 + text.length, 20 + jsonLen)
  dv.setUint32(20 + jsonLen, binLen, true)
  dv.setUint32(24 + jsonLen, BIN_CHUNK, true)
  out.set(bin, 28 + jsonLen)
  return out.buffer
}

/** One triangle: three vec3 positions then three uint16 indices, in one buffer. */
function oneTriangle(): { json: unknown; bin: Uint8Array } {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const indices = new Uint16Array([0, 1, 2])
  const bin = new Uint8Array(positions.byteLength + 8)
  bin.set(new Uint8Array(positions.buffer), 0)
  bin.set(new Uint8Array(indices.buffer), positions.byteLength)
  return {
    json: {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bin.length }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
        { buffer: 0, byteOffset: positions.byteLength, byteLength: 6 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    },
    bin,
  }
}

test('a .glb comes back as triangles and a bounding box', () => {
  const { json, bin } = oneTriangle()
  const mesh = readGlb(glb(json, bin))
  assert.ok(mesh)
  assert.deepEqual([...mesh.indices], [0, 1, 2])
  assert.deepEqual([...mesh.positions], [0, 0, 0, 1, 0, 0, 0, 1, 0])
  // The bounds are what the view is fitted to, so an off-by-one here is a mesh that renders
  // cropped or as a dot in the middle of the frame.
  assert.deepEqual(mesh.min, [0, 0, 0])
  assert.deepEqual(mesh.max, [1, 1, 0])
  // ⚠️ Uint32 WHATEVER THE FILE SAID. The source indices are uint16 here; a generated mesh
  // routinely passes 65 535 vertices, and one buffer type means one draw path.
  assert.ok(mesh.indices instanceof Uint32Array)
})

test('a node\'s transform is applied, so a Z-up export is not drawn on its side', () => {
  const { json, bin } = oneTriangle()
  // The -90° X rotation the glTF exporter chain puts on the root of a Z-up model, as a quaternion.
  const rotated = {
    ...(json as Record<string, unknown>),
    nodes: [{ mesh: 0, rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], scale: [2, 2, 2] }],
  }
  const mesh = readGlb(glb(rotated, bin))
  assert.ok(mesh)
  // `+ 0` normalises the -0 a rotation produces: it is equal to 0 everywhere except deepEqual.
  const at = (i: number) => [...mesh.positions.slice(i * 3, i * 3 + 3)]
    .map((n) => Math.round(n * 1e4) / 1e4 + 0)
  assert.deepEqual(at(0), [0, 0, 0])
  // x is scaled and untouched by a rotation about x…
  assert.deepEqual(at(1), [2, 0, 0])
  // …and the vertex that was at +y is now at -z. Rotation THEN scale, in that order: a reader that
  // applied them the other way round gets the same answer for a uniform scale and the wrong one
  // for every non-uniform export.
  assert.deepEqual(at(2), [0, 0, -2])
})

test('what is not a mesh comes back as nothing, never as a throw at the caller', () => {
  const { bin } = oneTriangle()
  // A file with no meshes at all — legal glTF, nothing to draw.
  assert.equal(readGlb(glb({ asset: { version: '2.0' } }, bin)), null)
  // A primitive that is a line strip, not triangles.
  const lines = {
    ...(oneTriangle().json as Record<string, unknown>),
    meshes: [{ primitives: [{ mode: 3, attributes: { POSITION: 0 }, indices: 1 }] }],
  }
  assert.equal(readGlb(glb(lines, bin)), null)
  // Not a .glb at all. This one DOES throw — `drawMesh` catches it and leaves the glyph card up,
  // and a reader that returned null here would be indistinguishable from an empty model.
  assert.throws(() => readGlb(new Uint8Array([1, 2, 3, 4]).buffer), /not a \.glb/)
})

test('a mesh with no scene still draws, because exporters write them', () => {
  const { json, bin } = oneTriangle()
  const orphan = { ...(json as Record<string, unknown>) }
  delete orphan['scenes']
  delete orphan['scene']
  delete orphan['nodes']
  const mesh = readGlb(glb(orphan, bin))
  assert.ok(mesh, 'out of spec is not a reason to show a blank box')
  assert.equal(mesh.indices.length, 3)
})
