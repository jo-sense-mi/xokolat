// 🧊 DRAWING A MESH — one canvas, one draw call, WebGL2 and nothing else.
//
// ⚠️ WebGL2, NOT WebGPU, AND THAT IS A SHIPPING DECISION. This app becomes a desktop app on three
// platforms and therefore three browser engines — WKWebView, WebView2, WebKitGTK. WebView2 has
// WebGPU; the other two do not, reliably. A grey flat-shaded mesh needs none of what WebGPU buys,
// and WebGL2 is present on all three.
//
// ⚠️ NO NORMAL BUFFER. The face normal is the cross product of the screen-space derivatives of the
// world position, computed per fragment — which is exactly flat shading, costs one line, and means
// the reader never has to trust (or synthesise) a NORMAL attribute. It is also why a mesh with
// broken normals still looks right here.
//
// ⚠️ AND THE SAME CODE MAKES THE THUMBNAIL. `snapshot()` hands back a PNG blob of what was drawn,
// so the feed's still and the pane's orbit view are one renderer rather than two things that
// disagree. See `mesh-thumb.js` for who calls it and where the file goes.

const VERT = `#version 300 es
in vec3 position;
uniform mat4 mvp;
uniform mat4 model;
out vec3 world;
void main() {
  world = (model * vec4(position, 1.0)).xyz;
  gl_Position = mvp * vec4(position, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
in vec3 world;
uniform vec3 tint;
out vec4 colour;
void main() {
  vec3 n = normalize(cross(dFdx(world), dFdy(world)));
  // Two lights and a floor bounce: a key over the shoulder, a cool fill from the other side, and
  // enough ambient that a face turned away is dark rather than black. Untextured geometry reads as
  // a SHAPE only through its shading, so this is the whole of what makes the mesh legible.
  float key = max(dot(n, normalize(vec3(0.4, 0.7, 0.6))), 0.0);
  float fill = max(dot(n, normalize(vec3(-0.6, 0.2, -0.4))), 0.0);
  float lit = 0.20 + 0.72 * key + 0.22 * fill;
  colour = vec4(tint * lit, 1.0);
}`

function compile(gl, kind, source) {
  const sh = gl.createShader(kind)
  gl.shaderSource(sh, source)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) ?? 'shader would not compile')
  }
  return sh
}

/** Column-major perspective, the one WebGL wants — written out because importing a matrix library
 *  to build four numbers is the dependency this whole file exists to avoid. */
function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2)
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ])
}

/** The model's own matrix: centred on its bounding box, scaled to fit the view, then orbited. */
function modelMatrix(centre, scale, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  // R = Rx(pitch) · Ry(yaw), then uniform scale, then translate the centre to the origin FIRST —
  // so the object turns about itself rather than swinging around the world origin.
  const r = [
    cy * scale, sp * sy * scale, -cp * sy * scale,
    0, cp * scale, sp * scale,
    sy * scale, -sp * cy * scale, cp * cy * scale,
  ]
  return new Float32Array([
    r[0], r[1], r[2], 0,
    r[3], r[4], r[5], 0,
    r[6], r[7], r[8], 0,
    -(r[0] * centre[0] + r[3] * centre[1] + r[6] * centre[2]),
    -(r[1] * centre[0] + r[4] * centre[1] + r[7] * centre[2]),
    -(r[2] * centre[0] + r[5] * centre[1] + r[8] * centre[2]),
    1,
  ])
}

/**
 * A mesh on a canvas.
 *
 * ⚠️ IT DOES NOT DRAW, AND THE CALLER'S ORDER IS LOAD-BEARING (2026-08-30): attach the canvas,
 * THEN call `draw()`. `getComputedStyle` cannot read `--mesh-ground` off a node that is not in the
 * document, so a first frame painted during construction uses the hardcoded fallback ground rather
 * than the card's own colour — and a feed tile draws once and never again, so that wrong ground
 * would be permanent.
 *
 * @param mesh    what `readGlb` returned
 * @param size    the canvas's CSS size in pixels, square
 * @param orbit   whether dragging turns it. A feed still is drawn once and never touched again;
 *                the ⓘ pane is where you actually look at the thing from another side.
 * @param tint    the surface colour, 0–1 per channel
 * @returns `{ node, draw, snapshot, dispose }`, or null when WebGL2 is not available — which the
 *          caller must handle rather than assume, because that is exactly the case a packaged app
 *          hits on a machine with no GPU driver worth the name.
 */
export function meshView(mesh, { size = 320, orbit = false, tint = [0.80, 0.79, 0.76] } = {}) {
  const canvas = document.createElement('canvas')
  canvas.className = `mesh-canvas${orbit ? ' mesh-orbit' : ''}`
  canvas.width = canvas.height = Math.round(size * Math.min(devicePixelRatio || 1, 2))
  canvas.style.width = canvas.style.height = `${size}px`

  // `preserveDrawingBuffer` is what makes `toBlob` return the frame instead of a cleared buffer.
  // It costs a copy per frame and this draws on demand, not in a loop, so the cost is nothing.
  const gl = canvas.getContext('webgl2', {
    antialias: true, preserveDrawingBuffer: true, alpha: false,
  })
  if (!gl) return null

  let program = null
  try {
    program = gl.createProgram()
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'shaders would not link')
    }
  } catch {
    return null
  }

  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const vbo = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0)
  const ibo = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)

  gl.enable(gl.DEPTH_TEST)
  // ⚠️ NO BACK-FACE CULLING, ON PURPOSE. A generated mesh is not guaranteed to be watertight or
  // consistently wound, and culling turns one flipped triangle into a hole you can see through.
  // Drawing both sides costs a mesh this size nothing and never lies about the shape.
  gl.disable(gl.CULL_FACE)

  const centre = [0, 1, 2].map((i) => (mesh.min[i] + mesh.max[i]) / 2)
  const span = Math.max(...[0, 1, 2].map((i) => mesh.max[i] - mesh.min[i]), 1e-6)
  // 1.7 leaves a margin so the silhouette never touches the edge — a mesh cropped by its own frame
  // reads as a rendering bug.
  const scale = 1.7 / span
  const proj = perspective(Math.PI / 5, 1, 0.01, 100)
  // The camera sits back along -Z; the model is already centred and normalised, so this never
  // changes and the whole of "the view" is the two angles below.
  const view = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3.6, 1])

  // A three-quarter view: the angle a person would turn an object to before deciding what it is.
  let yaw = -0.6
  let pitch = 0.32

  function draw() {
    const model = modelMatrix(centre, scale, yaw, pitch)
    const mv = new Float32Array(16)
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        mv[c * 4 + r] = view[r] * model[c * 4] + view[4 + r] * model[c * 4 + 1]
          + view[8 + r] * model[c * 4 + 2] + view[12 + r] * model[c * 4 + 3]
      }
    }
    const mvp = new Float32Array(16)
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        mvp[c * 4 + r] = proj[r] * mv[c * 4] + proj[4 + r] * mv[c * 4 + 1]
          + proj[8 + r] * mv[c * 4 + 2] + proj[12 + r] * mv[c * 4 + 3]
      }
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
    // ⚠️ THE GROUND IS PAINTED, NOT LEFT TRANSPARENT. `alpha: false` means an unpainted canvas is
    // black, which on a light theme is a hole in the page. Read from the stylesheet so the ground
    // follows the viewer's theme like everything else does.
    const ground = getComputedStyle(canvas).getPropertyValue('--mesh-ground').trim()
    const rgb = ground.match(/[\d.]+/g)?.slice(0, 3).map((n) => Number(n) / 255)
    gl.clearColor(rgb?.[0] ?? 0.09, rgb?.[1] ?? 0.09, rgb?.[2] ?? 0.10, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    gl.useProgram(program)
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'mvp'), false, mvp)
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, model)
    gl.uniform3fv(gl.getUniformLocation(program, 'tint'), tint)
    gl.bindVertexArray(vao)
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0)
  }

  if (orbit) {
    let from = null
    canvas.addEventListener('pointerdown', (ev) => {
      from = { x: ev.clientX, y: ev.clientY, yaw, pitch }
      canvas.setPointerCapture(ev.pointerId)
    })
    canvas.addEventListener('pointermove', (ev) => {
      if (!from) return
      yaw = from.yaw + (ev.clientX - from.x) * 0.01
      // Clamped just short of the poles: past them the object appears to flip, which reads as a
      // bug rather than as a view you asked for.
      pitch = Math.max(-1.5, Math.min(1.5, from.pitch + (ev.clientY - from.y) * 0.01))
      draw()
    })
    const stop = () => { from = null }
    canvas.addEventListener('pointerup', stop)
    canvas.addEventListener('pointercancel', stop)
  }

  return {
    node: canvas,
    draw,
    /** What was last drawn, as a PNG blob — the feed's still, made by the pane's renderer. */
    snapshot: () => new Promise((ok) => canvas.toBlob(ok, 'image/png')),
    /** ⚠️ CALLED WHEN A CELL LEAVES THE PAGE. A browser allows a small, fixed number of live WebGL
     *  contexts — around 16 — and silently kills the oldest past it. A feed that opened one per
     *  mesh and never let go would blank the earlier tiles as you scrolled. */
    dispose: () => gl.getExtension('WEBGL_lose_context')?.loseContext(),
  }
}
