// 🧊 READING A .glb — enough of glTF 2.0 to get triangles out of it, and nothing else.
//
// ⚠️ WHY THIS IS HAND-WRITTEN AND NOT A PACKAGE. xokolat ships as a desktop app on three platforms,
// which means three DIFFERENT browser engines: WKWebView on macOS, WebView2 (Chromium) on Windows,
// WebKitGTK on Linux. A few hundred lines of our own code against a spec all three implement
// behaves identically on all three; a vendored loader behaves like whatever it does on WebKitGTK,
// which is the engine nobody tests and the one we would be debugging alone. It is also the
// dependency rule (§15.3): three.js under `<model-viewer>` is 300KB+ of permanent download for a
// grey untextured mesh.
//
// ⚠️ POSITIONS AND INDICES, AND THAT IS THE WHOLE READER. Hunyuan3D writes an untextured mesh — no
// materials, no UVs, no normals — so a flat-shaded grey render is not a degraded view of the
// object, it IS the object. Normals are computed in the shader from the screen-space derivatives
// of the position (see mesh-view.js), so not even a normal buffer is read. When a textured model
// arrives this file grows a `TEXCOORD_0` and an image; nothing here has to be undone for that.
//
// ⚠️ AND THE NODE TRANSFORMS ARE APPLIED. A mesh can sit under a rotated, scaled node — and glTF's
// canonical exporter chain often puts a -90° X rotation there to get from Z-up to Y-up. Skipping
// the scene graph draws some models on their side, which reads as a broken renderer rather than a
// missing multiply.

/** glTF's own numbers for the accessor component types we can read a position or an index from. */
const COMPONENT = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
}
const COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }

const MAGIC = 0x46546c67   // 'glTF'
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

/** A 4×4 identity, column-major — the order glTF stores a matrix in and the order WebGL wants. */
const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

function multiply(a, b) {
  const out = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
        + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]
    }
  }
  return out
}

/** A node's own transform: an explicit `matrix`, or the TRS triple glTF offers instead. */
function localMatrix(node) {
  if (node.matrix) return new Float32Array(node.matrix)
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  // Quaternion to a rotation basis, then scaled per axis — the standard expansion, written out
  // rather than composed from three matrices we would only multiply back together.
  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2
  return new Float32Array([
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ])
}

/** One accessor as a typed array, honouring the buffer view's `byteStride` when it interleaves. */
function readAccessor(gltf, bin, index) {
  const acc = gltf.accessors?.[index]
  if (!acc) return null
  const Type = COMPONENT[acc.componentType]
  const per = COUNT[acc.type]
  if (!Type || !per) return null
  // ⚠️ A SPARSE OR VIEWLESS ACCESSOR READS AS ZEROS, per spec — and that is the honest answer here
  // rather than a throw: a mesh that uses one still draws, it simply contributes nothing.
  if (acc.bufferView === undefined) return new Type(acc.count * per)

  const view = gltf.bufferViews[acc.bufferView]
  const start = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const stride = view.byteStride ?? 0
  if (!stride || stride === per * Type.BYTES_PER_ELEMENT) {
    return new Type(bin.buffer, bin.byteOffset + start, acc.count * per)
  }
  // Interleaved: copy element by element rather than handing WebGL a stride it would also have to
  // be told about at every draw.
  const out = new Type(acc.count * per)
  for (let i = 0; i < acc.count; i++) {
    const at = bin.byteOffset + start + i * stride
    out.set(new Type(bin.buffer, at, per), i * per)
  }
  return out
}

/**
 * Every triangle in the file, in world space, as one buffer pair.
 *
 * ⚠️ ONE MESH OUT, WHATEVER WENT IN. A glTF scene is a tree of nodes and a node may hold a mesh of
 * several primitives; all of it is one object to look at, and merging here means the viewer holds
 * exactly one vertex buffer and issues exactly one draw call — which is what makes a thumbnail
 * cheap enough to draw for every cell in a feed.
 *
 * @returns `{ positions, indices, min, max }`, or null if the file holds no triangles.
 */
export function readGlb(bytes) {
  const dv = new DataView(bytes)
  if (dv.byteLength < 12 || dv.getUint32(0, true) !== MAGIC) throw new Error('not a .glb')

  let gltf = null
  let bin = new Uint8Array(0)
  let at = 12
  while (at + 8 <= dv.byteLength) {
    const length = dv.getUint32(at, true)
    const kind = dv.getUint32(at + 4, true)
    const body = new Uint8Array(bytes, at + 8, length)
    if (kind === JSON_CHUNK) gltf = JSON.parse(new TextDecoder().decode(body))
    else if (kind === BIN_CHUNK) bin = body
    at += 8 + length + ((4 - (length % 4)) % 4)
  }
  if (!gltf?.meshes?.length) return null

  const positions = []
  const indices = []
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  const emit = (meshIndex, world) => {
    for (const prim of gltf.meshes[meshIndex]?.primitives ?? []) {
      // mode 4 is TRIANGLES. Strips, fans, lines and points are legal glTF and are not what a
      // generated mesh is; skipping them beats drawing them as though they were triangles.
      if ((prim.mode ?? 4) !== 4) continue
      const p = readAccessor(gltf, bin, prim.attributes?.POSITION)
      if (!p) continue
      const base = positions.length / 3
      for (let i = 0; i < p.length; i += 3) {
        const x = world[0] * p[i] + world[4] * p[i + 1] + world[8] * p[i + 2] + world[12]
        const y = world[1] * p[i] + world[5] * p[i + 1] + world[9] * p[i + 2] + world[13]
        const z = world[2] * p[i] + world[6] * p[i + 1] + world[10] * p[i + 2] + world[14]
        positions.push(x, y, z)
        if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x
        if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y
        if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z
      }
      const idx = prim.indices === undefined ? null : readAccessor(gltf, bin, prim.indices)
      if (idx) for (let i = 0; i < idx.length; i++) indices.push(base + idx[i])
      // A primitive with no index buffer is triangles in order — legal, and rare enough that
      // writing the sequence out is cheaper than a second draw path.
      else for (let i = 0; i < p.length / 3; i++) indices.push(base + i)
    }
  }

  const walk = (nodeIndex, parent) => {
    const node = gltf.nodes?.[nodeIndex]
    if (!node) return
    const world = multiply(parent, localMatrix(node))
    if (node.mesh !== undefined) emit(node.mesh, world)
    for (const child of node.children ?? []) walk(child, world)
  }

  const scene = gltf.scenes?.[gltf.scene ?? 0]
  if (scene?.nodes?.length) for (const n of scene.nodes) walk(n, identity())
  // ⚠️ A FILE WITH NO SCENE STILL DRAWS. It is out of spec and exporters produce it anyway; the
  // meshes are right there, and refusing to show them would be pedantry with a blank box in it.
  else for (let i = 0; i < gltf.meshes.length; i++) emit(i, identity())

  if (!indices.length) return null
  return {
    positions: new Float32Array(positions),
    // Uint32 unconditionally: a generated mesh routinely passes 65 535 vertices, and WebGL2 has
    // `OES_element_index_uint` in core so there is no reason to branch on the count.
    indices: new Uint32Array(indices),
    min, max,
  }
}
