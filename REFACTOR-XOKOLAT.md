# REFACTOR-XOKOLAT — the plan

Two repos — `~/src/xokolat` (the app) and `~/src/xokolat-web` (the library, which is xoko.lat) —
committed separately, direct to `main`. Phases are ordered so each one stands on the last.

---

## Context

Three things are wrong at once, and they compound.

**Music is one workflow called `song`, and it is the slowest one the factory owns.**
`~/src/xokolat-web/src/workflows/comfyui.json` publishes exactly one music row — `song`, on
`acestep_v1.5_xl_sft_bf16`, 55 steps at CFG 3.5 — which is 110 model evaluations per press and is
why a two-minute track took 630 seconds. content-factory's everyday default is `xl-turbo`, 8 steps
at CFG 1.0: **8 evaluations**. The factory has four profiles, a vocal/instrumental axis, ten
genres, four composable axes, keys, languages, bpm. xokolat publishes one row that exposes three
holes (`prompt`, `seed`, `duration`) and hard-codes the rest. And the name is wrong: `song` is one
output, not a path through an engine.

**Voice is a two-node cut of a four-node graph.** The published `voice` workflow is
`FB_Qwen3TTSVoiceDesign → SaveAudioMP3`. The factory's is design → clone-prompt → save-profile →
preview. There is no way to clone a voice from a recording, and there cannot be: `WORKFLOW_INPUTS`
(`src/types/workflow.ts:96`) is five picture slots, `resolveRefs` reads pixels
(`src/jobs/generate.ts:193`), and the comfy adapter uploads PNG. **Audio cannot be attached to
anything.**

**xoko cannot operate a workflow.** It can write `▶ make music: …` and nothing else. It cannot set a
length, a tempo, a key, or lyrics; it cannot choose between a fast workflow and a careful one; it is
not told what the armed workflow takes. Every hole a workflow declares is a knob nobody can reach.
Meanwhile the prompt is 8,231 characters of rules compensating for that — and the loop never
closes, so xoko never learns whether anything it asked for happened.

The outcome: music that is as rich as the factory's and named honestly, voice that can design *and*
clone, and a xoko that reads a workflow's own declared holes and drives it — instead of a paragraph
telling it not to guess.

**Settled since (2026-10-05):** the public noun is `workflow` — see DECISIONS.md.

---

## Phase 1 — the app learns the vocabulary (`~/src/xokolat`)

Nothing here is visible on its own; it is what Phases 2–3 stand on.

### 1.1 Knob tables for the media that have none

`src/inference/knobs.ts` keys by medium and holds `image` only, so `knobsFor('music')` returns
empty. Add `MUSIC_KNOBS` and `VOICE_KNOBS` using the existing `Knob` shape — every field the
ACE-Step and Qwen3-TTS graphs actually expose, with real ranges taken from
`~/content-factory/runners/MUSIC_RUNNER.md` and `palettes/music-keys.json`:

| medium | knob | kind | range / choices | fallback |
|---|---|---|---|---|
| music | `duration` | integer | 10–240 | 120 |
| music | `bpm` | integer | 40–200 | — |
| music | `keyscale` | choice | the 34 ACE-Step keyscales | — |
| music | `language` | text | ISO code | `en` |
| music | `lyrics` | text | — | — |
| music | `timesignature` | choice | 3, 4, 6 | — |
| voice | `voice` | text | the description | — |

Add `'text'` handling where knob editors assume numeric. `knobProblem` already handles `text`.

**This is the load-bearing change.** A hole is only reachable if the app has a word for it, and
`fill()` (`src/inference/comfy/adapter.ts:121`) already skips a hole nothing was sent for — so a
knob table that names more than a graph exposes costs nothing.

### 1.2 A style may carry settings, not only words

`ResolvedStyle` is `positive` / `negative` / `tags` / `seed`. A music genre is words **plus** an
idiomatic tempo and key pool — that is what makes jazz-noir jazz-noir. Add an optional
`params?: Params` to the style shape and merge it in `styleParams()`
(`src/jobs/generate.ts:155`), below the request so a typed value always wins.

Ordering in `startRun`, unchanged in shape: style params → request → workflow params.

### 1.3 Shaping text stops being a gate

Two edits, both small, both already agreed:

- `styleParams()` returns `{}` when there is no saved style, so the voice graph's hard-coded
  narrator answers every unstyled press. Make the slash half of `▶ make <medium>/<…>` accept
  **words**: resolve to a saved style if the text matches a slug, otherwise use the text itself as
  the shaping words. A style becomes optional text, never a prerequisite object.
- Mount `stylesView(ctx, medium)` for **every** medium. It is generic already
  (`web/lib/styles.js`) and imported in exactly one place — `web/lib/pipelines/images.js:128`.
  Music and voice sections in `web/lib/pipelines/made.js` get the same editor. "Save this as a
  style" becomes an after-the-fact affordance.

No style categories for music. Voice deliberately publishes none
(`src/styles/categories.ts` — technique-only, and there is no honest musical equivalent); music
follows it.

### 1.4 The map answers "can I?", not "how many"

`src/xoko/here.ts` prints counts, and when the library is unreachable `stillToTake()` swallows the
error and every medium reads **"nothing left on 📚 for it"** — a false statement handed to xoko
every turn. Rewrite `holdings()` to emit, per medium, one line of:

- READY / NOT YET, and when NOT YET, the **one act that unblocks it**, as a real id read from the
  live index — not a count.
- the armed workflow, what it takes (`prompt`? an attachment?), and its settable knobs.
- `unknown` — never zero — when 📚 cannot be reached.

Fix `web/lib/pipelines/media.js`'s `what:` line while it still exists; it says "how large each
medium is written", which is why xoko described a quality setting as a disk-usage report.

---

## Phase 2 — the library grows a real catalog (`~/src/xokolat-web`)

Content only. `node build.mjs` regenerates `dist/`, which is committed.

### 2.1 Music: retire `song`, publish six

Delete the `song` row. Publish six workflows, all `kind: t2m`, all on the same ACE-Step graph — only
node 104's `unet_name` and node 3's `steps`/`cfg` change between profiles, exactly as the factory
does it (`MUSIC_RUNNER.md` → Profiles).

| slug | label | checkpoint | steps | CFG | lyrics |
|---|---|---|---|---|---|
| `music-fast` | quick instrumental **(default)** | `acestep_v1.5_xl_turbo_bf16` | 8 | 1.0 | — |
| `music-detail` | slow and nuanced | `acestep_v1.5_xl_sft_bf16` | 50 | 3.5 | — |
| `music-base` | CFG-capable base | `acestep_v1.5_xl_base_bf16` | 32 | 3.5 | — |
| `music-light` | 2B, lowest memory | `acestep_v1.5_turbo` | 8 | 1.0 | — |
| `music-sung` | sung, quick | `acestep_v1.5_xl_turbo_bf16` | 8 | 1.0 | ✓ |
| `music-sung-detail` | sung, slow and nuanced | `acestep_v1.5_xl_sft_bf16` | 50 | 3.5 | ✓ |

Widen the holes on all six, from the three today to what node 94 actually takes:

```
prompt   → 94.tags
seed     → 109.value
duration → [94.duration, 98.seconds]     (already a list — the reason lists exist)
bpm      → 94.bpm
keyscale → 94.keyscale
timesignature → 94.timesignature
```
…and on the two sung rows, `lyrics → 94.lyrics` and `language → 94.language`.

The four instrumental rows keep `lyrics: ""` in the graph, which is what makes them instrumental.

### 2.2 Music styles — the shelf that does not exist

`src/styles/` holds `image.json` and `voice.json`. Add `music.json`: the ten curated genres from
`~/content-factory/palettes/music-styles.json`, each as one style —

```
positive : caption + instruments, in ACE-Step's tag idiom
params   : { bpm: <midpoint of the genre's band>, keyscale: <first of its key pool> }
```

cinematic-orchestral · neo-soul · folk-ballad · synthwave · jazz-noir · celtic · bossa-nova ·
blues-rock · chamber-strings · lo-fi-hiphop. No `category` (see 1.3). No seed — unlike a voice, a
song is not one person, and pinning it would make every press of a genre the same track.

The four composable axes (`music-axes.json`) are **not** ported: they are the factory's exploration
harness, and in this app the same job is done by typing words into the slash half (1.3).

### 2.3 Voice: design at two sizes now, clone in Phase 4

The Qwen3-TTS node picks its model by size inside the node (`model_choice`), so the size split is
two workflows over one graph:

| slug | label | model_choice | kind |
|---|---|---|---|
| `voice` | a voice you describe | `1.7B` | `tts` |
| `voice-fast` | a voice you describe, quicker and flatter | `0.6B` | `tts` |

Holes on both: `prompt → 1.text`, `voice → 1.instruct`, `seed → 1.seed`.

**`.qvp` is deliberately not ported.** The factory needed a saved voice profile because it had no
style layer. xokolat has one — eight voices in `src/styles/voice.json`, each a description plus a
pinned seed, which is the same reusable identity in a format the app can read, edit and delete.
Adding `.qvp` would mean widening the voice medium's master extension for a second answer to a
question already answered.

### 2.4 An authoring skill

`~/src/xokolat-web/.claude/skills/publish-workflow/SKILL.md`. The repo has one README and no written
procedure, and the cost is on the record twice: the 55-step music default and the amputated voice
graph. It states: which profile is the default and why fast wins; that a graph's holes must expose
everything the app has a knob for (1.1); that a voice or a genre is a **style**, never a workflow;
and that `node check.mjs` gates a publish.

---

## Phase 3 — xoko drives any workflow

### 3.1 Close the loop

`did` is rendered on screen and never returns to xoko, which is what produced "neither workflow found
a home" — a fluent account of an outcome it was never told. Feed act results back as the next turn's
input. This single change deletes the prompt's "A VERB LINE IS A REQUEST, NOT A RESULT" paragraph.

### 3.2 Tool calls, with the schema generated from the workflow

The `▶` line grammar (`src/xoko/grammar.ts`) becomes the fallback for a brain that cannot call
tools. The primary channel is tool calls, and `make`'s JSON schema is **generated per turn** from:

> the armed workflow's `graph.holes` ∩ `knobsFor(medium)`

So on a machine with `music-detail` armed, xoko is handed a `make` tool with `duration`, `bpm`,
`keyscale`, `timesignature` — each with its real range and enum from the knob table — and on a
machine with `music-sung` armed it also gets `lyrics` and `language`. **That is the whole of
"handles any workflow like an expert":** the workflow declares its holes, the app declares what each
one means, and the schema is the intersection. No prompt paragraph, no per-medium branch, and a
workflow published tomorrow exposing a hole this build has never heard of still gets the knob the
moment the table names it.

`make` also takes an optional `workflow` field, so "make it quick" reaches `music-fast` and "take
your time" reaches `music-detail`. It does **not** take a checkpoint, a step count or a sampler —
those stay the machine, chosen in 🔌.

### 3.3 `look: workflow <slug>`

A sixth look (`src/xoko/look.ts` `LOOKS`) returning one workflow in full: what it makes, what it
needs attached, every knob with range/enum/default, and its notes. Progressive disclosure — the
expert reference is pulled when needed instead of crammed into the prompt.

### 3.4 Budget, not caps

Replace `MAX_MAKES 3 / MAX_ACTS 6 / MAX_LOOKS 3 / MAX_HOPS 3` with a turn-and-time budget. The caps
and the `dropped` list they required both go.

### 3.5 The prompt down to ~1,200 characters

With honest data (1.4), a closed loop (3.1) and enforced schemas (3.2), roughly 2,600 of the
current 8,231 characters delete themselves rather than being rewritten: the map-authority
paragraph, the three-layers paragraph, the cap paragraph, the slug-provenance paragraph, the
request-not-a-result paragraph. What is left is identity and policy. Delete the test that asserts
every rule is still present — it is a ratchet that can only grow.

---

## Phase 4 — ~~attach a recording, and clone a voice~~ — NOT BUILT, wrong premise

Reading content-factory's four-node voice graph before building this showed the premise was false.
Its `FB_Qwen3TTSVoiceClonePrompt` takes `ref_audio` from **the voice node's own output** — the
chain is *design a voice → freeze it as a reusable `.qvp`* — not from a recording anybody attaches.
There is no clone-from-a-file to port, so the `audio` slot this phase was built around has no
consumer, and adding a value to a closed vocabulary with nothing to use it is exactly the
speculative scaffolding Phase 5 deletes.

`.qvp` stays unported for the reason given in 2.3, now better supported: the factory needed a saved
profile because it drives ComfyUI with no style layer. xokolat pins the seed in the style, which
reproduces the same timbre from the same description — the same identity, in a format the app can
read, edit and delete.

**What the reading found instead**, and what was built in its place:

`GET /object_info/<node>` on a running ComfyUI returns every enum and every range a node really
has. Asking it produced three corrections and one missing capability:

- `bpm` shipped as 40–200; the node takes **10–300**. A guess at what music sounds like, in the
  file whose stated rule is declare-never-infer, that would have refused a legal 208.
- `timesignature` was omitted as unverified. Verifying was one request: exactly `2 · 3 · 4 · 6`.
- `duration`'s 240s ceiling is **ours**, not the model's (it takes 2000) — now said out loud.
- **Voice could only speak English.** `FB_Qwen3TTSVoiceDesign` offers eleven languages and the
  published graph had `"English"` baked in with no hole, so every line the app ever spoke was read
  as English whatever it was written in. There is a hole now, defaulting to the node's own `Auto`.

The two `language` knobs stay two vocabularies from two vendors' nodes — ACE-Step takes ISO codes,
Qwen3-TTS takes English names. One shared list would send `ca` to a node expecting `Catalan`.

## Phase 5 — the small honest ones

- Move the image quality control out of the `🖼 media` settings section into the **images section's
  ⚙ dock band**. A setting that names a medium lives in that medium's section.
- Rename its levels from `balanced` / `exact` to `WebP q92` / `lossless`
  (`src/types/quality.ts`, `src/content/master.ts:IMAGE_ENCODERS`), keeping lossy default.
  Measured: 112 kB vs 623 kB on a 1024².
- Delete `web/lib/pipelines/media.js`, its nav row in `web/lib/shell.js`, and the per-medium
  scaffolding. **Quality is images-only. No other medium gets one.**

---

## Files

**`~/src/xokolat`** — `src/inference/knobs.ts` (new tables) · `src/types/style.ts` +
`src/jobs/generate.ts` (style params, inline shaping text) · `src/xoko/here.ts` (capability map) ·
`src/xoko/{prompt,grammar,look}.ts` + `src/server/app.ts` (loop, tools, budget) ·
`src/types/workflow.ts` + `src/inference/comfy/adapter.ts` (audio slot, Phase 4) ·
`registries/kinds.json` · `web/lib/pipelines/{made,images,media}.js` · `web/lib/{styles,shell}.js` ·
`src/types/quality.ts` + `src/content/master.ts`. Bump the single cache tag (`?v=51` → next) —
`scripts/check.ts` enforces exactly one.

**`~/src/xokolat-web`** — `src/workflows/comfyui.json` · `src/styles/music.json` (new) ·
`src/first-seen.json` (the build stamps new slugs) · `.claude/skills/publish-workflow/SKILL.md` ·
rebuilt `dist/`.

**Read-only reference, never edited, never depended on:** `~/content-factory/palettes/music-*.json`,
`runners/MUSIC_RUNNER.md`, `~/src/agent-skills/media/comfy-generate-voice/`.

---

## Verification

Per phase, and you drive the browser — I report what changed and what needs a refresh.

1. **App** — `npm run check` in `~/src/xokolat` (tsc, the front-end module list, one cache tag,
   shipped registries, the test suite) stays green at every commit. New unit tests: the music and
   voice knob tables round-trip through `knobProblem`; `styleParams` merges a style's `params`
   under a request value; `holdings()` says `unknown` for every medium when the library fetch
   throws.
2. **Library** — `node check.mjs` in `~/src/xokolat-web`, then
   `SITE_ORIGIN=http://127.0.0.1:8080 node build.mjs` and `node serve.mjs`. Confirm six music rows
   and two voice rows in `dist/library/index.json`, no `song`, and `music.json`'s ten styles.
3. **End to end, by hand** — with `.env.dev` pointing `XOKOLAT_LIBRARY` at :8080: take
   `comfyui/music-fast`, take a music style, press ▶ with a length. **The wall-clock is the test** —
   8 steps against the 55 that took 630s.
4. **xoko** — ask it "can you make me a jazz song, about 90 seconds, slowish". It should read the
   armed workflow's knobs, call `make` with `duration`, `bpm` and the style, and — after Phase 3.1 —
   report what actually came back rather than what it expected.
5. **Voice** — three published voices read the same line, distinguishably. Then Phase 4: drop a
   recording on the bar and hear it back.

Commit after each phase, both repos separately, direct to `main`.
