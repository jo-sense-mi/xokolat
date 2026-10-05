// The engine registry's guards. These encode PLAN §4 and §13 as things that cannot be
// written down wrong: caps are declared or minimal (never inferred), a launch mode says what
// it needs, and one row schema covers tiers.

import assert from 'node:assert/strict'
import test from 'node:test'

import { MINIMAL_CAPS } from '../src/inference/caps.ts'
import { parseInferenceRegistryFile, parseInferenceRow } from '../src/inference/registry.ts'
import { ctx } from '../src/validate.ts'

/** Parse one row and hand back both the row and everything that was wrong with it. */
function row(value: unknown) {
  const c = ctx('test')
  return { row: parseInferenceRow(c, value, ''), issues: c.issues }
}

const EXTERNAL_GRPC = {
  id: 'draw-things-grpc',
  transport: { kind: 'grpc', host: '127.0.0.1', port: 7859 },
  launch: { mode: 'external' },
  health: { kind: 'tcp', timeoutMs: 500 },
  caps: {
    negatives: false, idiom: 'prose', words: [20, 120], resolution: [512, 1536],
    stepsLocked: 4, batch: true,
  },
}

test('a complete external row parses with no complaints', () => {
  const { row: parsed, issues } = row(EXTERNAL_GRPC)
  assert.deepEqual(issues, [])
  assert.equal(parsed?.id, 'draw-things-grpc')
  assert.equal(parsed?.caps?.stepsLocked, 4)
})

test('a row with no caps declares nothing, and MINIMAL_CAPS is what it gets', () => {
  const { row: parsed, issues } = row({ ...EXTERNAL_GRPC, caps: undefined })
  assert.deepEqual(issues, [])
  assert.equal(parsed?.caps, undefined)
  // Minimal, NOT permissive: an engine that claims nothing gets nothing.
  assert.equal(MINIMAL_CAPS.negatives, false)
  assert.equal(MINIMAL_CAPS.batch, false)
})

test('a half-declared caps block is an error, not a merge with the minimum', () => {
  const { row: parsed, issues } = row({ ...EXTERNAL_GRPC, caps: { negatives: true, idiom: 'prose' } })
  assert.equal(parsed?.caps, undefined)
  assert.ok(issues.some((i) => i.includes('words')), issues.join('\n'))
  assert.ok(issues.some((i) => i.includes('resolution')), issues.join('\n'))
})

test('a typo in an optional field is reported, not silently ignored', () => {
  const { issues } = row({ ...EXTERNAL_GRPC, canry: { kind: 'render-noise-check' } })
  assert.ok(issues.some((i) => i.includes('canry')), issues.join('\n'))
})

test('a launch mode must be able to start something', () => {
  assert.ok(row({ id: 'w', launch: { mode: 'child' } }).issues
    .some((i) => i.includes('binary or an entry')))
  assert.ok(row({ id: 'w', launch: { mode: 'builtin', binary: 'x' } }).issues
    .some((i) => i.includes('launches nothing')))
  // `external` means the app never manages it — it cannot install one either.
  assert.ok(row({ ...EXTERNAL_GRPC, launch: { mode: 'external', binary: 'gRPCServerCLI-macOS' } }).issues
    .some((i) => i.includes('never manages it')))
})

test('a generator with no endpoint is a row that only looks configured', () => {
  assert.ok(row({ id: 'nowhere' }).issues.some((i) => i.includes('needs a transport')))
  // ⚠️ A BUILTIN DOES NOT, and that is now the whole of the exemption. It used to be carried by
  // `role: 'operator'` as well; the role is retired and the launch mode is what always mattered —
  // a flood-fill is reached by calling it, not over a socket.
  assert.deepEqual(row({ id: 'cutout', launch: { mode: 'builtin' } }).issues, [])
})

// ⚠️ WHOSE MACHINE IS DECLARED, NEVER DERIVED. The tempting rule — a loopback host or a plain
// command is local — gets `claude-code` exactly backwards: no endpoint at all, and as cloud as
// anything here. A transport says how a service is REACHED, not where the thinking happens.
test('where the work happens is a field, because the transport cannot answer it', () => {
  const cli = { id: 'claude-code', role: 'brain', transport: { kind: 'cli', brain: 'claude' } }
  assert.deepEqual(row({ ...cli, where: 'cloud' }).issues, [])
  assert.equal(row({ ...cli, where: 'cloud' }).row?.where, 'cloud')
  // Absent is `local`, which is what every row written before this field existed meant.
  assert.equal(row(cli).row?.where, undefined)
  assert.ok(row({ ...cli, where: 'somewhere' }).issues.some((i) => i.includes('where')))
})

// ⚠️ A CLOUD ROW MAY SHIP AS A SLOT. "Cloud" is not a vendor: which service, which model and which
// key are the user's, and a shipped endpoint would be this app picking their provider for them. So
// the row arrives declared-but-unconfigured and the transport is added in settings. A LOCAL
// generator with no transport is still the mistake it always was — that is the pair asserted here.
test('a cloud generator may ship with no endpoint, because the endpoint is yours to choose', () => {
  assert.deepEqual(row({ id: 'cloud-text', role: 'brain', where: 'cloud' }).issues, [])
  assert.ok(row({ id: 'cloud-text', role: 'brain', where: 'local' }).issues
    .some((i) => i.includes('needs a transport')))
})

test('port "auto" is meaningless for an engine the app never launches', () => {
  const { issues } = row({ ...EXTERNAL_GRPC, transport: { kind: 'grpc', host: '127.0.0.1', port: 'auto' } })
  assert.ok(issues.some((i) => i.includes('auto')), issues.join('\n'))
})

test('ONE row schema — tiers is an optional field, and it replaces the row-level launch', () => {
  const cutout = {
    id: 'cutout',
    tiers: [
      { id: 'flood-fill', launch: { mode: 'builtin' } },
      {
        id: 'onnx',
        launch: { mode: 'child', entry: 'src/workers/cutout.ts' },
        supervise: { maxRssMb: 3000, onCap: 'recycle' },
        provision: { kind: 'download', url: 'https://example.invalid/rmbg.onnx', sha256: 'a'.repeat(64) },
      },
    ],
  }
  const { row: parsed, issues } = row(cutout)
  assert.deepEqual(issues, [])
  assert.equal(parsed?.tiers?.length, 2)
  assert.equal(parsed?.tiers?.[1]?.supervise?.maxRssMb, 3000)

  assert.ok(row({ ...cutout, launch: { mode: 'builtin' } }).issues
    .some((i) => i.includes('per tier')))
})

test('a provisioned download is https and hash-pinned', () => {
  const bad = {
    id: 'x',
    launch: {
      mode: 'child', binary: 'b',
      provision: { kind: 'download', url: 'http://example.invalid/x', sha256: 'nope' },
    },
  }
  const { issues } = row(bad)
  assert.ok(issues.some((i) => i.includes('url')), issues.join('\n'))
  assert.ok(issues.some((i) => i.includes('sha256')), issues.join('\n'))
})

test('a file reports every problem in one pass, and drops the rows it cannot vouch for', () => {
  const c = ctx('inference.json')
  const rows = parseInferenceRegistryFile(c, {
    services: [
      EXTERNAL_GRPC,
      { id: 'Bad Id', transport: { kind: 'grpc', host: 'h', port: 1 } },
      { id: 'draw-things-grpc', transport: { kind: 'grpc', host: 'h', port: 2 } },
      // `operator` was the third role until 2026-09-06 and is now exactly what it looks like:
      // a word that is not in the enum. A file still carrying one is told so.
      { id: 'ghost', role: 'operator', transport: { kind: 'grpc', host: 'h', port: 3 } },
    ],
  })
  assert.deepEqual(rows.map((r) => r.id), ['draw-things-grpc', 'ghost'])
  assert.equal(c.issues.length, 3, c.issues.join('\n'))
  assert.ok(c.issues.some((i) => i.includes('Bad Id')))
  assert.ok(c.issues.some((i) => i.includes('duplicate id')))
  assert.ok(c.issues.some((i) => i.includes('operator')))
})

// ── models ────────────────────────────────────────────────────────────────────────────────────

test('a model caps PATCH may be partial — that is the difference from an engine one', () => {
  const { row: parsed, issues } = row({
    ...EXTERNAL_GRPC,
    engines: [{ file: 'klein.ckpt', label: 'klein', default: true, caps: { stepsLocked: 4 }, params: { steps: 4 } }],
  })
  assert.deepEqual(issues, [])
  assert.equal(parsed?.engines?.[0]?.caps?.stepsLocked, 4)
  assert.equal(parsed?.engines?.[0]?.caps?.negatives, undefined, 'a patch states only what changes')
  assert.equal(parsed?.engines?.[0]?.params?.['steps'], 4)
})

test('`stepsLocked: null` is a meaningful patch — "the engine locks, this one does not"', () => {
  const { row: parsed, issues } = row({
    ...EXTERNAL_GRPC,
    engines: [{ file: 'dev.ckpt', caps: { stepsLocked: null } }],
  })
  assert.deepEqual(issues, [])
  assert.equal(parsed?.engines?.[0]?.caps?.stepsLocked, null)
  assert.ok('stepsLocked' in (parsed?.engines?.[0]?.caps ?? {}), 'present, not merely absent')
})

test('two defaults is a coin flip that looks like a decision', () => {
  const { issues } = row({
    ...EXTERNAL_GRPC,
    engines: [{ file: 'a.ckpt', default: true }, { file: 'b.ckpt', default: true }],
  })
  assert.ok(issues.some((i) => i.includes('default')), issues.join('\n'))
})

test('a model row IS the model — it cannot also name one', () => {
  const { issues } = row({
    ...EXTERNAL_GRPC,
    engines: [{ file: 'a.ckpt', params: { model: 'b.ckpt' } }],
  })
  assert.ok(issues.some((i) => i.includes('params.model')), issues.join('\n'))
})

test('an empty caps patch is a typo, not a declaration', () => {
  const { issues } = row({ ...EXTERNAL_GRPC, engines: [{ file: 'a.ckpt', caps: {} }] })
  assert.ok(issues.some((i) => i.includes('changes nothing')), issues.join('\n'))
})

test('the same checkpoint cannot be described twice', () => {
  const { issues } = row({
    ...EXTERNAL_GRPC,
    engines: [{ file: 'a.ckpt' }, { file: 'a.ckpt', label: 'again' }],
  })
  assert.ok(issues.some((i) => i.includes('duplicate engine')), issues.join('\n'))
})

// ── a workflow's controls ───────────────────────────────────────────────────────────────────

const withControl = (control: unknown, inputs = ['prompt', 'look']) => row({
  ...EXTERNAL_GRPC,
  engines: [{ file: 'a.ckpt' }],
  workflows: [{ slug: 'r', kind: 'style', model: 'a.ckpt', inputs, controls: [control] }],
})

test('a control points at a slot the workflow actually takes', () => {
  // Otherwise the picture can never arrive: the tray only draws the slots in `inputs`. The symptom
  // without this is a workflow that looks right and renders as though the adapter were not there.
  const { issues } = withControl(
    { file: 'ip.ckpt', from: 'ref', inputType: 'Shuffle' }, ['prompt', 'look'])
  assert.ok(issues.some((i) => i.includes('nothing fills a ref slot')), issues.join('\n'))
})

test('the control vocabularies are closed, because the index IS the wire value', () => {
  const bad = withControl({ file: 'ip.ckpt', from: 'look', inputType: 'Vibes' })
  assert.ok(bad.issues.some((i) => i.includes('inputType')), bad.issues.join('\n'))
  const blocks = withControl(
    { file: 'ip.ckpt', from: 'look', inputType: 'Shuffle', targetBlocks: 'Everything' })
  assert.ok(blocks.issues.some((i) => i.includes('targetBlocks')), blocks.issues.join('\n'))
})

test('a control that stops before it starts never applies', () => {
  const { issues } = withControl(
    { file: 'ip.ckpt', from: 'look', inputType: 'Canny', start: 0.9, end: 0.2 })
  assert.ok(issues.some((i) => i.includes('stops before it starts')), issues.join('\n'))
})

test('a good control survives the parse whole', () => {
  const { row: parsed, issues } = withControl({
    file: 'ip.ckpt', from: 'look', inputType: 'Shuffle', weight: 0.8, mode: 'Balanced',
    targetBlocks: 'Style',
  })
  assert.deepEqual(issues, [])
  assert.deepEqual(parsed?.workflows?.[0]?.controls, [{
    file: 'ip.ckpt', from: 'look', inputType: 'Shuffle', weight: 0.8, mode: 'Balanced',
    targetBlocks: 'Style',
  }])
})

test('a workflow may stack a LoRA, which is what makes four steps a workflow', () => {
  const { row: parsed, issues } = row({
    ...EXTERNAL_GRPC,
    engines: [{ file: 'a.ckpt' }],
    workflows: [{
      slug: 'fast', kind: 't2i', model: 'a.ckpt', inputs: ['prompt'],
      params: { steps: 4 }, loras: [{ file: 'four-step.ckpt', weight: 1 }],
    }],
  })
  assert.deepEqual(issues, [])
  assert.deepEqual(parsed?.workflows?.[0]?.loras, [{ file: 'four-step.ckpt', weight: 1 }])
})

// ── the guide link (2026-08-13) ───────────────────────────────────────────────────────────────
//
// A shelf whose job is to say "not running" needs somewhere to send the person who read that, and
// the answer is a page. Which makes a registry string into an `href` on a card — so the scheme is
// the thing under test, not the prose.

test('a guide is a page this app ships or a page on the web, and nothing else is a scheme', () => {
  for (const help of ['/guides/draw-things.html', '/guides/', 'https://xoko.lat/engines']) {
    const { row: parsed, issues } = row({ ...EXTERNAL_GRPC, help })
    assert.deepEqual(issues, [], help)
    assert.equal(parsed?.help, help)
  }
})

test('a registry cannot put code behind a link on a card', () => {
  // ⚠️ THE USER LAYER IS A FILE ON DISK, so "who would write that" is not the question — anything
  // that can write <app data>/registries/inference.json could, and this string reaches an href.
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>x</script>',
    'file:///etc/passwd', 'http://xoko.lat/engines']) {
    const { row: parsed, issues } = row({ ...EXTERNAL_GRPC, help: bad })
    assert.ok(issues.length, `${bad} was accepted`)
    assert.equal(parsed?.help, undefined)
  }
})

test('plain http is refused for a guide for the same reason a key needs tls', () => {
  const { issues } = row({ ...EXTERNAL_GRPC, help: 'http://example.com/g' })
  assert.ok(issues.some((i) => i.includes('help')), issues.join('\n'))
})

/**
 * ⚠️ SOME KNOBS ARE NOT INDEPENDENT, AND ONE OF THEM RUINS A RENDER (2026-08-31).
 *
 * `ace-step` runs the turbo checkpoint at `steps 8, cfg 1.0`; the sft profile wants `50 / 3.5`.
 * Cross them in either direction and the track distorts, so "a good default cfg" is not a number —
 * it is half of a pair, and a preset is how the library says which halves go together.
 *
 * What is checked here is the failure a preset can have: naming a hole the graph has not got.
 * `fill()` skips such a value in silence — the rule that lets the knob table grow ahead of the
 * catalog — so the render succeeds, at the published value, and the only clue that the whole preset
 * went nowhere is that the track is not what was asked for.
 */
test('a preset that would set nothing is refused where it is written', () => {
  const withPresets = (presets: unknown) => row({
    ...EXTERNAL_GRPC,
    id: 'comfyui',
    transport: { kind: 'comfy', host: '127.0.0.1', port: 8188 },
    workflows: [{
      slug: 'ace-step', kind: 't2m', model: 'acestep.safetensors', inputs: ['prompt'],
      graph: {
        nodes: {
          3: { class_type: 'KSampler', inputs: { steps: 8, cfg: 1 } },
          107: { class_type: 'SaveAudioMP3', inputs: {} },
        },
        out: '107',
        holes: { steps: '3.steps', cfg: '3.cfg' },
      },
      presets,
    }],
  })

  const good = withPresets({ quick: { steps: 8, cfg: 1.0 }, careful: { steps: 50, cfg: 3.5 } })
  assert.deepEqual(good.issues, [], 'a preset over this workflow\'s own holes is ordinary')
  assert.deepEqual(good.row?.workflows?.[0]?.presets?.['careful'], { steps: 50, cfg: 3.5 })

  const bad = withPresets({ careful: { steps: 50, shift: 3 } })
  assert.match(bad.issues.join('\n'), /no shift hole/,
    'a preset naming a hole the graph has not got applies cleanly and does nothing')
  // ⚠️ AND NEVER THE CHECKPOINT UNDER THE APP'S OWN WORD. A graph that swaps its weights does it
  // through a hole like anything else; `model` is what the app fills with the resolved checkpoint.
  const named = withPresets({ careful: { model: 'other.safetensors' } })
  assert.match(named.issues.join('\n'), /names its checkpoint in `model`/)
})
