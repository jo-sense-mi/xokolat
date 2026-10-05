# Next — everything that is pending, in one place

Rewritten 2026-08-13. `PLAN.md` says what the app **is**; `DECISIONS.md` says what we changed our
minds about after building. **This file is the only place that says what is not built yet**, and it
is deleted from as things land rather than annotated.

Not a gate. A past decision written here never blocks a change of mind — say so and move on.

---

## The frame

The measure for everything below is content-factory's real palette: **23 workflows over 6
checkpoints**, which is roughly what a serious machine looks like after a month. Every ordering
decision here was checked against that list rather than against what ships today.

Four things are settled and worth restating, because most of what follows sits on them:

**Capability first.** A workflow's row in the picker is its **kind**, not its service. The service is
a fact about the workflow, not a mode you are in — which makes a run that spans two services ordinary
rather than special, and that is what compositions will need.

**A workflow belongs to ONE service; the KIND is the portable thing.** `sdxl-style-ref` is Draw
Things' dialect (`target_blocks: "Style"`, an IP-Adapter, a weight); the ComfyUI answer to the same
intent is a graph with different node names. A "portable workflow" would be a translator between
dialects, which is a compiler. Two services offering `cutout` are two workflows and one row, and the
row does the joining — that is the entire reuse story, and it costs nothing.

**Transports are shipped; services are data.** Adding a service must not need a release. The
transports are the small per-family code — gRPC, plain http, OpenAI-compatible, a command — and a
service is a row naming one of them plus where it is.

**The leverage is in the workflow layer, not in any one model.** Anyone can add a checkpoint, a
control or a workflow, and the requirements check tells them what they are missing by name. Picking
the app's next capability by noticing a checkpoint on the disk is the reasoning that layer exists to
make unnecessary — so the work below is about **letting more things in**, not about admitting one
more model.

---

## The order of work

### 1 · The xoko.lat library — the app comes EMPTY and everything arrives from it

**The rule, and it decides every line below: the app owns the FORMAT, the library owns the
CONTENT.** The app ships the ability to *reach* things — transports, service rows, the verb
vocabulary, what a parser will accept. It ships nothing to *run*. Every workflow, engine, style and
composition is fetched from `~/src/xokolat-web`, by hand or by asking xoko.

**Done, 2026-08-16: workflows moved to the library.** They lived in `registries/inference.json` and
the site copied them *out*, which made this repo the author of its own content and made "comes
empty" impossible to arrange — emptying it would have emptied the library too. They are now
`xokolat-web/src/workflows/<service>.json`, joined back onto our service rows by id at build time.
19 workflows, 9 styles and 4 compositions are published and waiting. **Nothing in this repo is the
source of anything on that site any more.**

Six rows gained a `label` on the way, and the reason is a trap worth remembering: an unnamed workflow
does not publish, and **we synthesise a plain t2i for any checkpoint no workflow names**. Take only
`sdxl-i2i` onto an empty app and SDXL is suddenly named, the synthesis switches off, and plain t2i is
gone with nothing in the library to ask for it back. The synthesis is for a checkpoint the library
has never heard of — never for filling a hole the library dug.

**Engine guides** — done, shipping in `web/guides/`, hosted by the site verbatim. Nothing to build.

**Built, 2026-08-16 — the reading half.** `XOKOLAT_LIBRARY` (`src/library/origin.ts`, env only until
there is a UI to point anywhere), the envelope reader (`src/library/payload.ts`), and
`tests/library.test.ts`, which reads the real `../xokolat-web/dist` and puts **every published file
through the reader offline in about a second** — 65 today: 32 workflows, 27 styles (9 image, 10 music,
8 voice) and 6 compositions. It skips clean when the sibling checkout is absent, and it was verified
to catch a deliberately drifted payload.

The reader validates almost nothing itself, on purpose: it knows the envelope, refuses a shape it
does not know **by name**, and hands the inside to the parser that already exists. A style meets
`readDraft` — the same path a style typed into the app takes. A workflow is wrapped in the partial row
`saveService` accepts and run through `parseInferenceRow`, which is what a hand-edited
`<data>/registries/inference.json` meets. Two rules would drift; one cannot.

Two facts worth not re-deriving:

- **A composition lands whole, and runs** (2026-08-22): ⤓ takes the chain, the workflows bundled with
  it, and the services those sit on (from the shipped preset list, reported in `added`); ▶ runs it,
  stopping at a `pick` to hand the decision back. It spent four months refused with a 501 so it
  could be refused *by name*. What is still open is `pre:` steps inside ONE workflow (§3) — a
  different thing from a chain of presses, and the cutout case still wants it.
- **A `kind` is open and a slot is closed, and the two repos disagree on purpose.** The app takes any
  `kind` (a registry, not an enum — somebody adding a service is exactly the person who needs a verb
  this build never heard of); the site's `check.mjs` refuses one the app has no gloss for, on
  editorial grounds. Different questions, both right.

**Built, 2026-08-16 — the taking half.** `POST /api/take` (`src/library/take.ts`). What goes in is
a catalog **id** or a link **on the library this app is pointed at** — never an arbitrary URL, which is a bigger promise than "install from the library" needs to make and
would turn "pasted from the wrong tab" into a silent cross-library install instead of a sentence. An
id becomes a path through the site's own catalog, so the app never rebuilds a URL out of a folder
layout it would have to be re-told about every time the site moved one.

Three things worth not re-deriving:

- **The merge is the whole trick**, and there is a test named after it. `saveService` patches at the
  field level and replaces the whole list *within* a field, so the obvious `saveService({ id,
  workflows: [taken] })` deletes everything installed before it. The effective list (shipped ← yours)
  is read, the new row is dropped in by slug, and the whole list goes back. `engines` by file.
- **`asked: false` rides with the requirements check.** An empty `missing` from a service nobody has
  talked to is no news, not good news — and the catalog is deliberately *not* re-read on a take: a
  cold Draw Things scan is ~40s and would stop a press feeling like a press.
- **One door, wherever the thing lands.** A style taken from 📚 joins the style list and the answer
  says which one; the styles page itself has no ＋ by decision (`web/lib/styles.js`) and its door is
  ✨ xoko. A second entrance to a room that has one on purpose is the thing to keep refusing.

**Done, 2026-08-16 — the app is EMPTY.** `registries/inference.json` lost its 9 checkpoints and 19
workflows (the four service rows stay); `styles/image.json` and the whole `styles/` directory are
gone, and so is the seeding machinery that read them (`seedIfAbsent`, the check-script loop).
DECISIONS.md carries the entry. Four tests asserted the app ships content and now assert the
opposite — including one sweep that must read `readShippedRows`, **not** `loadInferenceRegistry`:
the merged rows include whatever this machine has taken, so an emptiness check there fails for
anyone who has used the app.

Verified end to end on a fresh data root against a local site: 4 services, 0 styles, no issues —
then ⤓ `klein-t2i` turned a bare discovered checkpoint into *FLUX.2 klein 4B*, stepsLocked 4,
negatives false, and ⤓ `kontext` added an `edit` workflow nothing could have synthesised.

⚠️ **An empty app is not a blank one, and this is the thing to keep true.** On a machine with Draw
Things running, a fresh app still lists every checkpoint the engine reports with a plain `t2i` each
— the one synthesis, untouched. What is missing until you take something is everything that is a
checkpoint PLUS something.

**Done, 2026-08-16 — 📚 the library is a section you browse.** `GET /api/library` reads the site's
two catalogs, merges them and answers every row against this machine: installed · takeable · which
files it names that the service does not report. The paste box on 🔌 is gone (DECISIONS.md — it was
the wrong thing, not a small version of the right one). The old 📁 library section is **📁 files**,
because the word could not mean both the folder your work lands in and the shelf you install from;
`/api/settings` and `/api/reveal` say `files` now.

**Done, 2026-08-17 — the brain most people already have is publishable.** The library carried two
`chat` workflows for Ollama and two for the unbound cloud row, and none at all for `claude-code` — the
one service that needs no key, no endpoint and no configuration. Three are published now
(`xokolat-web/src/workflows/claude-code.json`), and the third is the point of the other two: the app
synthesises a plain `chat` for every model a text service reports, a taken workflow CLAIMS its model,
and the synthesis then skips it. So `chat` is published alongside `prompt-smith` and `style-words`
and all three name `sonnet` — the same trap this file already warned about on the image side, on the
text side. No `engines`: this row's models are compiled in (`src/inference/cli/brains.ts`) precisely
so they cannot go stale in a registry, and a `where: cloud` service publishes `needs: []`.

**Fixed, 2026-08-17 — a failed library read is remembered as a failure.** `readLibrary` cached a
failed fetch with a fresh clock and threw the problem away with the request that hit it, so for five
minutes an unreachable library rendered as an empty shelf under `read at 13:27` — the app claiming it
had looked and found nothing. `at` now moves only on a clean fetch, `issue` rides with the cached
rows, and `triedAt` is what staleness is measured from. The existing test only read once, which is
exactly why it passed.

#### What is left, in order

1. **A ★ or a "new since you last looked"** on 📚, when the library is big enough that scanning it
   stops working. Not yet: 65 items is a page. (`⤓ <id>` as a xoko handoff was the other item here
   and it shipped — `▶ take:` is one of the four verbs, and it brings a missing service with it.)

#### Environments: no second checkout, ever

A `xokolat-dev` copy of this repo diverges the first time either side is fixed, and then every test
result is about which copy you were in. There is also no such thing as an app "prod" — this is not
deployed, it is installed. **The only axis is which library it points at**, and the roots are already
env-overridable (`src/paths.ts`):

```
XOKOLAT_DATA=/tmp/xk-dev XOKOLAT_CONTENT=/tmp/xk-dev-work \
XOKOLAT_LIBRARY=http://127.0.0.1:8080 XOKOLAT_PORT=18081 npm start
```

Both run side by side. **A fresh install is an empty `XOKOLAT_DATA`** — that is the whole "install
it, it comes empty" experience, on the real code, resettable with `rm -rf`. And the reference copy
worth keeping is the *content*, which is already in two safe places: git history, and the published
site that was generated from it.

#### The test plan, in the order a person actually does it

**0 · the agent, and it is Claude.** A `chat` workflow off `claude-code`, published 2026-08-17. It is
the right first take because nothing has to exist under it but the `claude` command you already
logged into: no model pulled, no key, no endpoint. Ollama's two and the cloud twin's two are the
same jobs for people who want them.
⚠️ **An installed `claude` already answers** — the plain `chat` is synthesised. So this step tests
the LIBRARY rather than the brain: taking a named workflow, and getting the plain one back with it.
⚠️ **It can advise before it can act**: the `▶ <medium>: …` handoff presses a section's ▶, and "take
this workflow from the library" is not something it can hand over yet — `⤓ <id>` alongside `▶` is the
shape, and it is small now that `/api/take` exists.

**1 · a non-image medium.** **Image is not first**, deliberately: it is the one that already works,
and proving the machine handles a second medium is worth more than polishing the first. What it
costs is now MEASURED rather than guessed (2026-08-17):

**Everything below the transport is already there.** `MASTER_EXT` names all four (`music: mp3`,
`voice: mp3`, `model3d: glb` — `src/content/run.ts`), quality is a per-medium scale that grows a card
without being edited, `GENERATED_MEDIA` holds them, and the nav rows exist as placeholders. This is
not a medium that has to be invented.

**Three lines of FORMAT were what actually stopped it, and all three are now widened** (2026-08-17,
see *Done*): the adapter boundary answers in bytes, `writeMaster` writes a `<stem>.gen.json` beside
a master that cannot hold its own record, and the Phase-0 gate is gone. The transport followed.

**So the server can make all four media today** and the four workflows are published. What is left is
the front end: 🎼, 🗣 and 🧊 are still `placeholder()` rows, which is §2 below.

⚠️ **VIDEO IS NOT THE CHEAP ONE, despite the checkpoints.** `wan_v2.1_1.3b_480p`,
`wan_2.1_14b_i2v_fusionx` and `skyreels_v2_i2v_1.3b_540p` are all installed in Draw Things and the
gRPC response already carries an ARRAY of images (the app keeps `.at(-1)`) — which makes it look
free and it is not: the config this app writes has no frame field at all
(`src/inference/draw-things/config.ts`), and frames still have to become a file. Flatbuffer work
plus an encoder decision — an animated WebP is reachable with the `sharp` already here; an mp4 is a
binary dependency (§15 rule 3). **Audio first**: voice and music share one output path and pay the
boundary once.

**2 · compositions** — shipped whole on 2026-08-22, take and run, and it is the best demonstration
there is: one payload carries its own workflows inline, so a single press arms a machine that could do
nothing a minute earlier, and one sentence then drives twelve renders, a question back, and four
more. Whether a composition binds a STYLE per step was the open question here and it is **settled
(2026-08-29)**: a chain has styles OF ITS OWN, carrying `says` (words for its `text` steps — the part
no media style can express) and `uses` (one media style NAMED per medium, never copied).

**Everything above is tested by installing from the site.** With xoko or by hand, but always through
the take path — a hand-edited registry proves nothing about the thing we are building.

#### And then the other half: xoko ALONE, with no library at all

The test that matters after all of the above: an app holding **only** a brain and whatever engines
are on the machine, asked to make something good — a composition, a style, a set — with nothing
fetched. The library is the curated path; this is the honest measure of whether the agent is worth
having when there is nothing to curate from. Not scheduled and not blocked on anything above, and
the result decides how much weight the library carries versus the brain.

### 2 · ~~Three media sections~~ — done 2026-08-17, see *Done* below

The three rows are real sections now (`web/lib/pipelines/made.js`), and the two open questions this
section held both got answered rather than deferred:

- **The player** is `group.player` off the index, and it grew past the tags a browser has. `img`
  and `audio` are elements; `file` is "nothing can draw this" and was a mesh's answer for two
  weeks. **`mesh` replaced it on 2026-08-30** — not a script from somewhere else, which this app
  still does not load, but a few hundred lines reading the triangles out of the `.glb` and drawing
  them with WebGL2 (`web/lib/glb.js`, `mesh-view.js`). Hunyuan output is untextured, so flat-shaded
  grey IS the object. ⤢ is still not offered — 📁 reveal is the verb for a mesh.
- **Quality for the new media is deliberately still absent**, and that is now the settled answer
  rather than an open one. `writeMaster` writes non-image bytes exactly as they arrived — the graph
  chose the container — so a level here would be a knob the app cannot honour. `quality.ts` already
  says a medium with no row has nothing to choose. If a bitrate is ever worth asking for it is a
  HOLE in the workflow's graph (`SaveAudioMP3` has one), not an app setting.

What is genuinely left in this area is `WORKFLOW_INPUTS`: it has a word for an attached picture and
none for an attached *audio* or *mesh*, which is what voice cloning and mesh texturing need. See the
map below.

### 3 · `pre:` steps inside a workflow — and then compositions

A cutout that runs *before* the IP-Adapter, which is what content-factory's `--cutout-ref` does.
Controls supplied the second use this was waiting for; the first was rembg.

It costs the picker **nothing**: a workflow with steps inside it is still one row. And it is the
groundwork for compositions — a named thing with member assets and typed references — because a
composition is a chain that outlives one press.

**Where a composition's workflows are defined: in 🔌 inference, always.** A composition *references*
workflows; it never defines them. A workflow is a fact about a service (a checkpoint, control files and
LoRAs on this machine) and the requirements check already knows how to say what is missing — let a
composition define its own and the same workflow lives two lives with that check reimplemented inside
it. What *is* composition-local is the **binding**: which workflow fills each step, and that step's
overrides (steps, cfg, seed, strength, prompt fragment, which slot the previous output lands in).
Those are not facts about the service, and they live in the composition's own subsection.

A step should reference **by kind** where it can ("this step is a `cutout`"), pinning a specific
workflow only when the operator deliberately picks one — that is what lets a composition downloaded
from xoko.lat survive on a machine with different filenames.

The step picker wants exactly *"show me things that can do X"*, which the capability view (shipped)
and the ▶ dock already are. Reuse it; do not build a third.

**Compositions landed and then grew a spine (2026-08-22, 2026-08-24).** A chain runs, stops for a
choice, and — since the 24th — can END IN SOMETHING OF ITS OWN: a `BindStep` takes every asset an
earlier step made and writes one file under `builds/<composition>/<run>/`, `each` runs a step once
per item instead of N times over one, and `list` turns one text answer into many. `book` is the
shape proved by all three at once.
What is still `pre:` and not built is the other half of this section: a cutout that runs *inside* one
workflow, before the IP-Adapter. A composition cannot express that and should not — it is one press.

**What compositions want next, in order:**

1. **A title page and a cover.** A build is named by the run, which is the sentence you typed. Both
   are one more page in `writePdf` and neither is needed to find out whether the shape is right.
2. **A second container.** `BINDS` holds one word. A contact sheet, a sticker sheet, a cut file: the
   step is medium-agnostic, only the writer is short.
3. **Per-step knobs.** A step names a workflow and fills its inputs and cannot say `steps: 8`. The
   place for it is the binding, not the workflow (see above), and nothing needs it yet.
4. **A picture of what a chain made.** A build lists as a name, a page count and a size, which is
   right for a PDF a browser will not draw in a feed and still thin. `writePdf` could put page one
   beside the master as a preview.
5. **A composition inside a composition.** The half of *a build must be able to become a piece* that
   is actually about nesting — a chain usable as a step of another chain. Nothing needs it yet, and
   reading that rule as "a chain's output earns a medium" is what produced `book`.

### 4 · A mask, and what it unlocks

Paint a region on the attached reference, encode it as the request's second tensor, and three
intents become possible at once: `inpaint` (change just this bit), empty-prompt inpaint (remove
this object), and `outpaint` (extend the canvas). Today every change redraws the whole frame, so
the parts you liked come back different.

SAM (`mask-generation` — point at a thing, get a mask) is what makes it pleasant rather than merely
present, and it is a model we do not have.

### 5 · Is a cloud's model menu really 433 workflows?

One OpenRouter row reports 409 models; each becomes a checkpoint and a synthesised workflow, so this
machine's 433 workflows are 412 `chat` and 21 of everything else. Draw Things' nine are checkpoints
you *installed*; OpenRouter's 409 are a catalog you *browse*, and they arrive through the same
synthesis and get counted the same way.

The 🔌 page now caps and filters, so this is comfortable rather than broken — which is exactly the
risk. Worth deciding what a cloud row's catalog *is* before more of the app grows around the answer
it has.

### 6 · Paging `/api/manifest`

It still ships the entire index in one response. Invisible at a few hundred assets, painful at the
few thousand this is being built for. Cheap to do the day the feed feels slow.

### 7 · A `builtin` transport — tried, reverted the same day

A service that runs in-process and needs no install. It was built on 2026-08-24 to carry the binder
and taken out again hours later: binding reaches no engine, so it is not a press, so it does not
want a service, a workflow or a medium. It is the last step of a composition now (`src/builds/`,
DECISIONS.md *A book is not a medium*).

**What is still open is the rest of the list** — crop, resize, format, alpha trim, outline — and the
question the revert asks of it: is any of those something a person ASKS for, or is each of them a
step inside a chain? A built-in background remover is still possible (`onnxruntime` + u2net) and
still a large dependency and a model download — exactly what security rule 3 says to justify before
taking, and rembg on a port already answers it.

### 8 · The `exec` transport

A service that needs a local binary run. It is an `exec` row with a fixed argv template **in the
registry file on disk**, where the UI can fill only declared holes. It will never be a text field on
a web form (§15 rule 1). Parked until something needs it — and it is also what an "install this as a
service for me" button would be built on, which is why that button does not exist.

### 9 · A workflow you can give back

**The workflow is the only noun in this app you can take and cannot remove.** Everything else already
has the door: a composition is `POST /api/compositions { slug, forget: true }`, a style is
`/api/styles/<medium>/delete`, an asset is `/api/delete`, a whole service is
`POST /api/inference { id, remove: true }`. A workflow has nothing, anywhere, and the only deletion
that touches one takes its entire service row with it.

**What that costs, seen once (2026-08-30).** `recraft-t2vec` sat in a registry months after ✒ vector
was retired, because every write to that file is additive by two deliberate rules — `saveService`
patches at the FIELD level ("what you did not mention, you keep", since two forms write one row), and
workflows merge per SLUG (write your own and you keep the ten already there). Neither has an inverse.
The library cannot help: a take is a PULL, one row, initiated by you — unpublishing removes something
from the shelf, never from a machine that already took it, and any other design would mean an edit on
xoko.lat silently deleting things off your disk.

**Shape:** the mirror of `mergeWorkflows` — read the stored row, drop by slug, write back. Same guard
`removeService` already states: only what is YOURS can be forgotten, and a synthesised workflow is not
in the file at all so the button does not appear on it. **Where:** the 🔌 workflow row that already
draws the `stale` flag, because that is where you find out a workflow should not be there any more.
**Remove, not retire** — a "retired but kept" state is a third thing to carry, and
something-nobody-revisits is the whole reason the ghost existed.

⚠️ **Still open: whether `▶ take:` gets an opposite verb.** It is a scope decision, not a safety one:
taking is a thing you ask for and removing is a thing you notice, and only one of those is a sentence.

### 10 · A style that can say what MACHINE it needs — and the format question under it

**Parked deliberately on 2026-08-30, with two thirds of it already built and unused.**

The prompt: a papercut press came back a photograph. Four things stacked, and two were fixed the
same day (the style now LEADS the prompt instead of trailing it, and xoko is told what look is in
force before it writes the ask — `composePrompt`, `pickedStyles`). The other two were about the
MACHINE, and they are what is written down here:

- papercut's `avoid` list — half of what makes it papercut, aimed squarely at "photo, photorealistic,
  3d render" — **was never sent**, because `klein-t2i` declares `negatives: false`. A distilled model
  has no CFG branch, so it is a channel that does not exist rather than a knob that was refused.
- it ran at **4 steps, CFG 1**, which is the least room there is to honour anything non-structural.

**The capability is already here and nothing uses it.** A style may carry `params`, they are
validated against that medium's knob table on parse, and they merge UNDER the request in
`styleParams` — so `papercut` could publish `params: { steps: 24, cfg: 3.5 }` today, in the library,
with zero app code. Music genres already do exactly this with `bpm` and `keyscale`; the image styles
simply never did. **That half is a content change and can happen any day.**

**What parks it is the operator's objection, and it is the right one: this would make a style
per-engine.** Up to now a style is TEXT plus one flat set of parameters, and that is what lets the
same nine styles ride any workflow on any service. The moment one says `steps: 24` it is talking to a
particular kind of machine: `steps` means nothing to Recraft, `cfg: 3.5` is actively wrong on any
distilled checkpoint, and `klein-t2i` is `stepsLocked` so it would be ignored there and honoured
three rows down. A style would silently become good on some engines and wrong on others, with
nothing on screen saying which.

**So the real question is not "may a style set steps" — it is what a style IS.** Three shapes, and
the answer decides several other things:

1. **Words only, forever.** A look is what you ask for; the machine is what the person armed in 🔌.
   Then papercut cannot state that it needs a negative channel, and the fix for the dog picture is
   entirely in 🎨's notes field and in xoko reading them.
2. **Words plus a WISH the app may refuse.** The style says what it wants; the ⚙ picker MARKS it
   against the armed workflow — the `lineage` pattern, which already orders a chain step's options by
   the family of the picture it is handed and marks strangers rather than forbidding them. This is
   the shape that fits everything else in this app.
3. **A style per engine.** One identity, N realizations, `caps` declared per model. content-factory
   went here (`styles.json` ★ per domain × regime × model) and it works — at the cost of a matrix
   that has to be filled in and kept true, which is the thing an empty app cannot ship.

⚠️ **AND THE SAME QUESTION IS UNDER "more axes".** Camera, lighting, palette, mood want to be
NAMED PARTS that compose, and today a style's words are one flat string per channel and exactly one
style applies per press — so you cannot stack `papercut` + `low angle`, and you cannot override the
camera without rewriting the look. `{prompt}` is one split point, not a structure. If that is wanted,
the shape is: a style's words become an ordered list of named parts (`positive` staying the one-part
case), and a press takes a LIST of styles merged part-by-part, later winning per part. **Cheap now at
27 published styles, expensive at two hundred** — which is the only argument for deciding it early.

⚠️ **What the app should do REGARDLESS of which shape wins:** say when it can only send half a
style. It knows `klein-t2i` has no negative channel, and the 🎨 editor already prints "— not read by
&lt;model&gt;" over the word channel the armed engine ignores. The same sentence over `avoid`, and a
mark in the ⚙ picker for a style whose settings the armed workflow would refuse, turns this from a
mystery after ▶ into a fact before it. That is a UI change with no format decision under it.

### 11 · The three rows that came out of the menu — 💡 ideas, 📓 runbooks, 🔍 judge

**Deleted from the nav on 2026-08-31, and written down here because the ideas are good.** They were
`placeholder` rows: real destinations that printed their own sentence and *Phase 3* under it. Three
of them, holding two whole groups (`batches`, `review`) — about a fifth of the menu announcing that
it was not the app yet. With them went `web/lib/pipelines/placeholder.js`, the `ph()` helper, the
`.soon` nav style and the `— NOT BUILT YET` line xoko read out of the map. There is no mechanism for
a placeholder row any more, on purpose: an unbuilt thing belongs in this file, and each of these
comes back as a section module or not at all.

**💡 ideas — a board of asks waiting to become runs.** The gap it fills: an ask you have but do not
want to press yet, and there is nowhere to put one. Today the only holding places are the ask bar
(one line, gone when you type over it) and your own head. ⚠️ Check it against ▶ queue before
building: a queued run is already an ask that has not happened, and two lists of not-yet is the
`review`/`stats` duplication again. The honest version is probably *unpressed* asks living in the
queue's own panel, not a section.

**📓 runbooks — one recorded sequence, replayed on demand.** ⚠️ **Mostly answered already, and that
is why it never got built.** Play-plans were retired in favour of runbooks as the single batch
primitive, and then compositions landed and became the thing you take, own and press with one
sentence. What a runbook row would still add over a composition is CAPTURE — press four things by
hand, then keep what you did — versus a chain you declare up front. Worth building only if the
capture is the point.

**🔍 judge — everything unrated, side by side, at the size it will be seen.** The one with the least
overlap and the clearest job: 👍/👎 exists on every card and there is no place that serves you the
unseen ones in a row at real size. ⚠️ It is a VIEW, not a section — the same argument that put styles
inside the section that uses them (PLAN §4d). A judge view on 🖼 that filters to unseen and shows one
at a time is the whole feature, and it does not need a group to live in.

### 12 · Draw Things' 36 hardcoded fields — the one place model knowledge still leaks in

**The shell is empty everywhere except here.** `src/inference/draw-things/config.ts` builds the
protocol's FlatBuffer by hand: a field-number table `C = {…}`, `CONTROL_FIELDS = 10`, and **36
`b.add*` calls**. That table IS the app's knowledge of Draw Things, and a 37th field is a source
edit. ComfyUI has no equivalent — a workflow there is a graph shipped verbatim, which is why
`minimax-h3-t2v` dropped in for a model that did not exist when the code was written, without
touching one line.

**Seen once, 2026-09-04.** `Control.file` was `string`, required — which quietly asserted that a
reference always feeds an adapter checkpoint. That is SDXL's belief, not the protocol's: the wire
has always kept `hints` and `configuration.controls` as separate fields of the request, and FLUX.2
klein reads a reference through its own moodboard channel with no file at all. Three call sites had
to stop assuming. The fix made the shell **emptier** — a constraint removed, not a feature added —
but it was still a source edit to publish a workflow, and that is the smell.

**Shape:** move the field table out of code and into a shipped registry file — `{ name, field,
type, default }`, about 36 rows — and write generically. A FlatBuffer field is a number, a type and
a default; the encoder does not need to know what `guidanceEmbed` MEANS to put a float at slot 22.
Then a workflow may name any field in the table and a new Draw Things field is a library edit, exactly
like a new node in a graph. The app knows the ENCODING, the workflow knows the MEANING.

**The floor this cannot go below**, and it is the same floor ComfyUI has: opening the connection,
turning pixels into a ccv tensor at the render size in RGB, the positional pairing of hint tensors
to controls. Wire mechanics are implemented or nothing works. A "pure shell" exists in neither
direction; what can go to zero is *model* knowledge, and only that.

**⚠️ Not scheduled, deliberately.** It pays off only if Draw Things keeps adding protocol fields,
and it does not move fast — 36 have covered everything asked of it. There is also a ceiling no
refactor reaches: Draw Things does what Draw Things implements, so a model its engine lacks is
unreachable however flexible the format gets, while ComfyUI is expressible the day someone writes a
node. **The trigger to build this is a second `file: string` moment.** Until then, new capability
goes on ComfyUI, where adding never touches the app.

### 13 · The library ships the BEST, not the most

**A decision about what xoko.lat publishes, 2026-09-04, and it reverses the instinct the catalog was
built on.** The frame at the top of this file measures against content-factory's *23 workflows over 6
checkpoints* — a working palette for someone who wants to compare engines. That is the wrong target
for an end user. **They do not want every option. They want the option that gives a good result.**

**What that looked like in practice.** Fifteen image workflows over three lineages became three over
one. SDXL went entirely — seven workflows resting on an IP-Adapter that AVERAGES the embeddings it is
shown, so a subject came back as a blend of itself rather than as itself; it never worked well and
keeping it published meant publishing a disappointment with a nice label. FLUX.1 went with it: dev,
schnell, fill and Kontext. What is left is FLUX.2 klein, which gives better results at four steps,
plus the moodboard channel it reads natively.

**The rule going forward: a model earns its row by producing good results, not by existing.** New
rows are added when a model is *better*, not when it is *different* — a second way to do the same
thing at lower quality is a worse catalog, not a richer one. An A/B palette is a *factory* concern;
the library is a shelf of things worth pressing.

**⚠️ THIS IS ABOUT THE LIBRARY, NOT THE FORMAT.** The app must stay able to express everything —
§12 above is the opposite instinct and both are right. Anyone may publish anything into their own
registry; what xoko.lat *ships* is curated. Breadth in what is possible, taste in what is offered.

**Open:** what happens to a workflow already taken when its row is unpublished. §9 says a take is a
pull and unpublishing never reaches a machine that already took it — which is correct, and it means
curation is about new users, not existing ones. Whether the shelf should say *why* a row left
(retired, superseded by X) is unanswered; a `superseded` pointer would let a take offer the
replacement, and would also be the first thing the library says about a workflow that is not there.

### 14 · A take is a CAPABILITY, not a workflow — and the model is a black box under it

**The noun is wrong at the moment of taking, 2026-09-04.** Nobody shops for a checkpoint. They want
a picture; whether they attached a reference is a fact about their request, not a mode they picked.
Frontier models made that the expectation — one endpoint, you type, you optionally attach, it does
the right thing — and against that, asking someone to choose between `klein-t2i`, `klein-i2i` and
`klein-moodboard` is this app showing its plumbing as a menu.

**The economics say the same thing.** Taking `klein-t2i` costs 8GB of weights and hands back ONE of
the three things those weights can do. The other two are a few kilobytes of JSON naming **the same
checkpoint already on disk**. Going back to the shelf twice more for files that cost nothing is a
bad deal dressed as a choice.

**The unit is the CHECKPOINT, not the "family".** Same file → bring every workflow that names it, the
marginal cost is text. Different file → a second 8GB, which is a purchase and never silent:
`flux-2-klein-9b` must stay its own decision. `Workflow.model` is already the field to key on.

**Shape:** the shelf offers *images — everything klein can do*, and installs the lot. The user never
sees three doors. A sibling that needs an extra file (an adapter, a LoRA) still arrives — `take.ts`
already computes what is missing BY NAME, so it lands marked not-ready rather than silently
withheld. And the take must **say what it brings before it brings it**: announced, three rows read
as generous; discovered afterwards, they read as the app doing things nobody asked for.

**⚠️ THE SPLIT DOES NOT DISAPPEAR, IT STOPS BEING A QUESTION PUT TO THE USER.** Attaching a picture
does not say which of two opposite things was meant: `klein-i2i` REDRAWS that picture (re-noised at
0.65, the description survives on what is left), `klein-moodboard` reads the SUBJECT and makes a new
picture somewhere else. Same attachment, opposite outputs. Frontier models resolve it from the words
— *"change the bag to blue"* versus *"the same character, on a beach"* — and something must read
that intent here too. **That something is xoko**, which is exactly the judgment the agent exists
for. The workflows survive as an implementation detail; the choice does not survive as a menu.

**Not in tension with §1.** The app still comes empty and everything still arrives as a pull. What
changes is the SIZE of one pull. And not in tension with "capability first" in the frame either:
that rule is about the picker, AFTER install. Taking is a different moment, and it turns out to
want the same noun — the capability — for a different reason.

### 15 · Quality tiers — the honest replacement for a filename

**Parked as an idea, 2026-09-04.** If §14 makes the model a black box, something has to take its
place, because the model was never really a technical choice to a user — it was *how good is it*.
`flux_2_klein_4b_i8x` is not information; it is a filename someone is being asked to evaluate.

**Shape, when it happens:** a coarse tier published per engine on xoko.lat, so the shelf reads
*images — good* rather than a checkpoint name, and picking is picking a standard rather than a
model.

**⚠️ THE TRAP, AND IT IS WHY THIS IS PARKED RATHER THAN BUILT.** "Quality" is not one axis. Fast and
rough, slow and faithful, and follows-the-prompt-exactly are three different goods, and klein at
four steps wins one of them while losing another — a single ★ would flatten that into a lie. A tier
is still far better than a filename; it just has to be honest about which good it is ranking, and
that question is unanswered. **Related:** §13 already decided the shelf publishes only what is worth
pressing, which is a cruder version of the same instinct — curation as a one-bit tier.

### 16 · What look does a generated composition arrive with?

**Open question, 2026-09-04.** The composition builder writes a chain and installs it. That chain
arrives with `params` per step and whatever its checkpoint does by default — and **no style at all**,
because a chain style is a separate object in the styles registry and the install envelope carries
only `{composition, workflows}`. `readComposition` refuses anything else, on the grounds that a
composition carrying a style would be a second place styles arrive from.

So a trading-card chain that was described as "one consistent magical-fantasy look" ships with that
sentence buried inside a step's `says`, where you cannot swap it, cannot see it in ⚙, and cannot
reuse it. Three answers, and we have not chosen:

- **A pack.** The builder writes a chain style too, and the envelope carries it — installed through
  `takeStyle`, the same door a 📚 style uses, so it is a second COURIER and not a second source.
  Best result, most work, and it makes the builder responsible for a look as well as a shape.
- **Empty, as today.** The chain runs, and the look is yours to set afterwards in ⚙. Honest, and it
  means every generated chain's first render is the checkpoint's default — which for most people
  reads as the tool being bad rather than unset.
- **`styles: false`.** The generated chain declares it takes no style, like the builder itself. Only
  right for a chain whose output really is not a look; wrong for anything that draws, and a lazy
  default would quietly remove styling from most of what the builder makes.

**⚠️ IT IS NOT A UI QUESTION.** All three are one line in the ⚙ band; the question is what a chain
somebody has never seen should DO the first time they press ▶ on it. **Related:** §14 (a take that
brings what it needs) is the same instinct one level up — the argument there was that a pull should
be big enough to work, announced rather than discovered.

---

## The map — what a person can ask for, and what each is blocked on

A list **by user intent**, not by architecture, so that when something lands we know where it sits.
The closest canonical registry is Hugging Face's task taxonomy (`text-to-image`, `image-to-image`,
`image-segmentation`, …) with Diffusers' pipeline names underneath it; both name **ML tasks, not user
intents**, and the gap is the whole reason for the workflow layer — roughly fifteen of the rows below
collapse into a single `image-to-image` there. Use them to cross-check vocabulary (they are why we
say `t2i` and not `make`), never as the menu.

| | meaning |
|---|---|
| ✅ | shipped |
| 🎭 | needs a **mask** (§4 above) |
| 🚚 | needs a **non-gRPC transport**, or no service at all — pure pixels |
| 🖥 | the engine answers and the workflow is published — it needs a **section to press ▶ in** (§2) |
| 🆕 | needs a **model we do not have** |

### Image · make

| Intent | Brings | Field name | |
|---|---|---|---|
| Make a picture from a description | words | `t2i` | ✅ |
| More like this one | picture | `i2i` (low strength) | ✅ |
| Make it bigger and sharper | picture | `upscale` | 🚚 |

### Image · change

| Intent | Brings | Field name | |
|---|---|---|---|
| Redraw this, following a description | picture + words | `i2i` | ✅ |
| "Make the sky night" — instruction editing | picture + words | `edit` | ✅ |
| Same picture, different look · relight · recolour | picture + words | `edit` | ✅ |
| Change just this region | picture + mask + words | `inpaint` | 🎭 |
| Extend the canvas · change the aspect | picture + words | `outpaint` | 🎭 |

### Image · guide — bring a reference

| Intent | Brings | Field name | |
|---|---|---|---|
| The same character again | words + subject ref | `sdxl-ref` | ✅ |
| Keep this face | words + face ref | `sdxl-face` | ✅ |
| Use this look · moodboard | words + style ref | `sdxl-style-ref` | ✅ |
| This subject, in this look | words + both | `sdxl-slide` | ✅ |
| Follow this outline · depth | words + structure ref | `sdxl-canny` · `sdxl-depth` | ✅ |
| Follow this pose | words + pose ref | ControlNet pose | 🆕 |
| Put this object into that scene | words + 2 or more pictures | multi-ref `edit` | 🆕 |

### Image · clean up — mostly no prompt at all

| Intent | Brings | Field name | |
|---|---|---|---|
| Cut out the background | picture | `cutout` (rembg) | ✅ |
| Remove an object | picture + mask | empty-prompt inpaint | 🎭 |
| Fix a face · restore · denoise an old photo | picture | restoration | 🚚 |
| Colourise a black-and-white photo | picture | colourise | 🆕 |
| Line art · grayscale · trim · pad · outline · platform sizes | picture | — | 🚚 (pure pixels) |

### Image · read — a picture in, *not* a picture out

| Intent | Brings | Field name | |
|---|---|---|---|
| Describe it · ask a question about it · read its text | picture (+ words) | caption · VQA · OCR | 🆕 |
| Get a prompt back out of it | picture | interrogate | 🆕 |
| Point at a thing — **produces the mask everything above needs** | picture + words | SAM | 🆕 |
| Score it | picture | aesthetic scoring | 🚚 |

### Cross-medium

`image → video` (animate) · `image → 3D` · `sketch → image`. The first two are new **mediums**, not
new image kinds — the same reason `wan_v2.1_1.3b_480p_q8p.ckpt` sits installed and undeclared.
`sketch → image` is an image kind: what comes out is a picture.

### The four that exist, and the two that are not media

Filled in 2026-08-17, when the first workflow for each became real (the rule this section always
carried: write a row when there is a service to run it, never before). Rewritten 2026-08-23,
when the question "what media am I missing?" turned three of the answers into something else.

| Intent | Brings | Field name | |
|---|---|---|---|
| Read this line aloud, in a voice I describe | words | `tts` | ✅ |
| A song from a handful of tags | words | `t2m` | ✅ |
| Turn this subject into a mesh | picture | `i23d` | ✅ |
| A mesh of a thing I can only name | words | `t23d` | ✅ |
| Sung lyrics, not just instrumental | words | `t2m` | ✅ |
| Clone a voice from a sample I bring | audio | — | 🆕 |
| Texture the mesh I just made | mesh + picture | `paint` | 🆕 |
| Sing this in the voice I just made | audio | — | 🆕 |

⚠️ **THREE OF THESE NEED A SLOT THAT DOES NOT EXIST.** `WORKFLOW_INPUTS` is `prompt · ref · look ·
control · mask`, and every one of them that carries a file carries a PICTURE; the ComfyUI adapter
uploads PNG. A voice sample and a mesh are attachments this app still has no word for. **Widening it is one change that buys
three capabilities** — voice-clone, sing-in-that-voice, and video-to-audio once video lands — which
is why it is one line here rather than three. Unscheduled on purpose: it is the only item on this
page that widens a closed vocabulary, and inventing a slot before something asks for it is the
mistake the `look`-was-called-`style` rename already paid for once.

⚠️ **`t23d` IS A KIND TOO, AND IT IS ONE PRESS** (2026-08-30). A mesh from a sentence looks like a
chain — draw it, cut it out, build it — and running it as one would file the mesh in the chain's own
feed, because anything generated in a section stays in that section. Somebody who asks for a 3D
dragon should find it in 🧊. So it is a workflow whose GRAPH holds both halves: an SDXL checkpoint
draws the subject and Hunyuan3D builds it, one engine, one ask, one `.glb`. Nothing to download that
`i23d` did not already need, plus any SDXL — and the drawing checkpoint is a knob, because the
published default is only a common fast one. **It also makes 🧊 wordy**: with `i23d` alone the
section is FROM A PICTURE ONLY and nothing xoko can do puts a file on the tray.

⚠️ **`paint` IS A KIND, NOT A MEDIUM.** Texturing a mesh returns a `.glb` with its materials baked
in — glTF carries its own textures — so the output is still a model3d and 🧊 needs no new shelf for
it. **Whether a mesh arrives textured is a fact about the workflow that made it**, not a second
press and not a setting: publish a paint workflow and meshes come out painted; publish a bare `i23d`
and they come out grey.

⚠️ **SINGING IS A COMPOSITION.** A designed voice cannot be handed to a singing engine — the
Qwen3-TTS identity is a seed inside that node, not a portable model — but a *recording* of it can,
because singing engines take a reference clip. So it is 🗣 then 🎼, two presses, one sentence, and
what comes out is a **song**. See `DECISIONS.md` 2026-08-23.

⚠️ **THERE IS NO 📝 SHELF, EVER. TEXT IS xoko.** The three chat engines exist to run it, not to fill
a gallery, and written things are **fields on the asset they belong to** — lyrics on the song, the
script on the voice run — which they already are, in provenance and in ⓘ.

### The one that landed 2026-08-24 — `book`, and the thing that makes one

Eight media now, and the eighth is the first that **no engine renders**. It arrived because a
composition produced one and it had nowhere to go — which is the whole test for adding a medium, and
the reason `book` was added last rather than first.

What came with it, and what each is for:

| | | |
|---|---|---|
| `each` | one press per item — **not** `repeat` | twelve pages, not twelve takes of page one |
| `list` | a text step whose one answer is many | how a sentence becomes twelve of anything |
| `binds` | the LAST step: what the chain is for | reaches no engine; the app writes the file |

Two compositions in the library exercise it: **`book`** (say the subject or list the
concepts → pages written → a picture per page → bound into one PDF) and **`mascot`**,
which finally has the cut-outs it always wanted — `each` over the cast, through `rembg/cutout`, so
every member comes back on transparency in the form a mascot is actually used in.

⚠️ **A BOUND BOOK SHOWS AS A `file` IN 📖**, like a mesh — no thumbnail, because a browser will open
a PDF in a tab and will not draw one in a feed. Writing a preview of page one beside the master is
the fix and it is small; see §3.

### The three that landed 2026-08-23 — video, sound, ~~vector~~

Built the day they were agreed. What each one actually needs is now a fact rather than an estimate:

**video — Wan 2.1 VACE 1.3B, and nothing to download.** `wan2.1_vace_1.3B_fp16.safetensors` was
already on the machine with `umt5_xxl_fp16` and `wan_2.1_vae` beside it. Two workflows on one graph:
`wan-t2v` and `wan-ref2v`, which is the same graph with `reference_image` wired to an attached
picture — **a reference, not a first frame.** Master is mp4/h264, and `PLAYERS` gained its fourth
value. ⚠️ **No preview frame is written**, so a clip's tile is a black `<video>` until it is played;
a poster would mean decoding one frame at index time and there is no decoder in this app.
⚠️ **AND THERE IS NOW A PATTERN FOR IT.** A mesh draws itself once in the browser and posts the
still to `/api/preview`, which writes it beside the master; from the next read on the tile is an
ordinary `<img>` (`web/lib/mesh-thumb.js`). A `<video>` seeked to one frame into a canvas is the
same three steps and the same endpoint — the decoder we do not have is the one in the page.

**sound — two workflows, and only one of them runs today.** `ambience` is the ACE-Step music graph
asked for something else: it is good at continuous texture and bad at one-shot foley, because three
seconds is less than a music model takes to settle. `stable-audio` is the one built for the job and
it is the only item in this whole change that **needs a download**:
`stable-audio-open-1.0.safetensors` into `models/checkpoints/`.

**~~vector~~ — RETIRED 2026-08-29, and the reason is the shape of the whole app.** It was a FORMAT
filed as a material, which is the other direction of the `book` mistake: an SVG is markup, a browser
draws it and a cutter follows it, and nothing renders it. Markup is words, and words are xoko. Both
Recraft workflows and the kinds under them are deleted; `svg` joins `pdf` as a BIND container — a
`text` step writes the document and the bind step files it, with no engine anywhere in the chain
(library composition `svg-images`).

⚠️ **A LOCAL TRACER IS STILL WORTH HAVING, and it is now an IMAGE→file step, not a medium.** vtracer
and potrace are binaries, not ComfyUI nodes, and this app has four transports — grpc, comfy, plain
http, cli-for-text — none of which runs a binary over an image. Either a rembg-shaped daemon on a
port (the pattern already works, §7/§8) or the `exec` transport.

---

## What the map says about the ordering

**The cheap wins cluster, and the clusters are transports, not features.** One channel unlocked the
whole *guide* group — five intents, no new checkpoints, one wire message. One transport unlocks most
of *clean up*, and half of those need no model at all. Ordering work by intent would spread both
clusters across a year; ordering by what the intents share does five at a time.

**Some rows are steps, not destinations.** Background removal is the clearest: in the factory it is a
*pre-step inside other workflows* — before the IP-Adapter, before image→3D, as step one of every
sticker export — at least as often as it is something asked for on its own. That is §3 above.

---

## Done, and why it is worth remembering

Kept short on purpose: these are the entries that explain the shape of what is left.

- **A press can be seen, named and repeated** (2026-08-23). Four things that were each invisible in
  a different way. A hole called `model` was filled with the app's own resolved checkpoint, which is
  what answered Qwen3-TTS with a 400 — now refused at publish, at parse and at press. Every knob a
  *workflow* declares is checked before a job exists, not only the ones with hand-written TypeScript.
  ComfyUI's socket became a **progress line** (the socket is a feed and never a result; `/history`
  stays the sole authority on completion). A run carries a **name** — read off the ask, settable four
  ways, and a rename rewrites one JSON field and moves nothing, because the folder is the identity.
  And a run carries a **subject**: for 🗣 the ask is the SCRIPT and the speaker is the thing being
  made, so the name comes from the medium's shaping knob when it has one — no branch on the medium
  anywhere. **The seed became a knob for 🗣 and 🎼.** A graph writes it as a bare address with no
  shape, and no table named it, so the adapter minted a random one every press with nothing on
  screen mentioning it — and for a voice-design node that number *is* the speaker. Four presses of
  one description were four strangers, and the field that was moving was the one field nobody could
  see.

- **Four media, four sections** (2026-08-17). 🎼 · 🗣 · 🧊 are one factory, `made.js`, because they
  differ in the words on the bar and one knob and agree about everything else. Three things came out
  of building them that were not visible before: a third `player` value (`file` — a mesh is a result
  no browser draws, and saying so is better than an <img> with a broken box in it); the ⓘ band
  extracted to `asset-detail.js` before it could be copied four times; and **a service row with no
  `medium` was invisible to every medium's picker** — strict equality hid ComfyUI from all four
  sections, so the filtering moved onto the workflow's KIND, where the server had already put it.
- **A cutout you can take** (2026-08-17). The `rembg` service row ships and three matting workflows are
  published. It closed the last gap between the operator's own app and a cleared one: rembg was the
  single thing they had added by hand, and nothing in 📚 could give it back.
- **The graph is content and the holes are format** (2026-08-17). The ComfyUI transport, and with it
  three media at once. Every other adapter knows what a render IS on its service; ComfyUI has no
  vocabulary — a song, a voice and a mesh come out of node families that share nothing — so the
  workflow carries the graph, published verbatim, and declares the few holes the app may write into.
  `Workflow.graph` = `{ nodes, out, holes }`; one word may fill several nodes, because ACE-Step states
  its length in two places. **The `comfyui` row is the only service row with no `medium`** — it
  serves four — so the press checks the KIND's medium, which is the only authority that can be right
  about it. Four workflows published: two voices, a song, a mesh.
- **An adapter can answer in bytes** (2026-08-17). `RenderOutput.asset` is pixels *or* bytes with the
  container they arrived in. Pixels keep their own shape because the app really does decode them; an
  mp3 is written through untouched, with its provenance in a `<stem>.gen.json` beside it — a WebP
  carries its record inside itself and a `.glb` cannot. The Phase-0 medium gate is gone: a medium is
  reachable when a row declares it and an adapter answers for it.

- **Kinds are a registry, not an enum** (2026-08-12). A closed five could not hold a real palette,
  and a person adding a service is exactly the person who needs a verb this build never heard of.
- **The picker is indexed by capability** (2026-08-12). A workflow on a service you had not armed was
  invisible; now the service is a subtitle.
- **A workflow is an editable object** (2026-08-12) — including its controls and LoRAs. Adding the one
  thing you want to be able to DO used to be a JSON edit.
- **＋ service with the plain-http transport** (2026-08-12). Nothing about rembg is in this source
  tree; the tool is a registry row.
- **The brain, with no credential at all** (2026-08-12). Two transports: `openai` for a model on this
  machine, and `cli` for a client you logged into in a terminal — because a subscription is not a
  key. It streams, it keeps a transcript, ⏹ keeps what arrived, and an answer may end with
  `▶ <medium>: …`, which the browser presses through the *section's own* ▶.
- **Controls, hints, and the requirements check** (2026-08-12). Fifteen of the factory's workflows are
  one line — an adapter stacked on a checkpoint — and its acceptance was a render, not an argument.
- **A key is a name in the registry and a file at 0600** (2026-08-12).
- **🔌 inference groups two ways** (2026-08-13). By service to install and fix; by capability to ask
  what this machine can do at all — including the kinds nothing answers for, which a list of what
  you have can never show. Capabilities band by **medium**, declared on the kind's own registry row:
  eight image verbs and `chat` were already peers in a flat list, and every medium below brings five
  or six more. **A verb that spans two media is two kinds** — which is what keeps the map above a
  list rather than a matrix, and what the music/voice/3D sections should be filled in as.
- **Getting an engine running is a page we write** (2026-08-13). `help` on a service row, loudest on
  a card that is not answering, pointing at guides that ship in `web/guides/` — the same files
  xoko.lat publishes, so they can also be read before installing anything.
