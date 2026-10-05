# xokolat — plan

**Status: agreed premise, nothing built.** This document is the whole context. It was written after
a design conversation that no future session will have in its history, so it states the decisions
*and the reasons*, because the reasons are what let you decide the cases it doesn't cover.

## How to read this — the contract is CODE

⚠️ **From commit 1, `src/types/` is normative and this document is a rationale sidecar.** Where a
type and this prose disagree, **the type wins and the prose gets fixed.** miraverse learned this the
expensive way (its DEC-1) and so did three review rounds here: every shape written in English —
`caps`, the request, the provenance record, the inference row — drifted or was read two ways, because
**prose cannot hold a schema.**

So the split is:

| | lives in | enforced by |
|---|---|---|
| **shapes** — request, caps, inference row, provenance, manifest | `src/types/*.ts` | `tsc`, on every commit |
| **why the shape is that shape**, and what must stay true | this document | a human reading it |

**Consequence for whoever writes commit 1:** the types come *first*, before the server does
anything. The sketches in §4 and §13 are illustrations of intent, not the definition — copy them
into `src/types/` and they stop being sketches.

**And one fact has exactly one home here.** If you find something restated in two places, that is a
bug in this document: delete one and point at the other. Most defects found in review were a stale
second copy, never a wrong first one.

### ⚠️ Two words, and they are not interchangeable

| | is | has | lives in |
|---|---|---|---|
| **inference** | a SERVICE that runs — Draw Things, ComfyUI, Ollama, a cutout daemon | an install/running state you could be asked to fix | `registries/inference.json`, the 🔌 section |
| **engine** | what a service can be ASKED FOR — a checkpoint, or a capability that is not one | facts and knobs; never a running state | each service's `engines: []`, the 🧩 section |

Renamed in one pass on 2026-08-03 (DECISIONS.md). Before that, "engine" in this document meant the
service and there was no word for the second thing — which is why models were filed inside the
service card and the checkpoint level had nowhere to put `stepsLocked: 4`.

**"Engine" rather than "model"** because not every one of them is a model: a background remover and a
flood-fill cutout belong in the same list as a checkpoint, and "models" would have excluded them.

Two places keep the OLD common vocabulary on purpose, and both are outward-facing: the provenance
record still calls the checkpoint `model`, and so does the `params.model` knob that goes on the wire.
Those speak to readers outside this app.

---

## 1. What it is

A **local content-generation app**: the user says what they want to make, picks nothing they don't
have to, and gets a finished, validated artifact — a die-cut sticker pack, a printable coloring
book, a mascot with a design language, a song, an image, a voice, a mesh.

Shaped like ComfyUI: a local server on a port plus a browser UI, no build step on the front end,
works on the phone over the LAN/tailnet, later wrapped as a desktop app.

**The differentiator, stated plainly:** LM Studio hands you a *model*. ComfyUI hands you a *canvas*
and asks you to build the pipeline. xokolat hands you a **finished artifact** — a LINE-aligned pack
with provenance, an Etsy zip, a KDP interior. Outcome-shaped, not node-shaped. That layer is empty
in the market because it is the hard one.

`xoko.lat` (domain owned) is the download + marketing site. **A hosted version is explicitly not in
scope**: it would mean routing every job to cloud AI and charging the user per render — a different
business with real per-render cost, where one GPU serving many users is a queue rather than a slower
response. It stays possible only because inference services sit behind adapters; nothing else is built for it.

---

## 2. Where it comes from

**`~/content-factory`** — the operator's private content factory. Single-user, opinionated,
taste-loaded, and the proving ground for everything here. xokolat **borrows from it and does not
depend on it**: no imports, no shared files, no symlinks. Read it, port what is proven, leave it
running as it is.

Read these before writing code (all in `~/content-factory`):

| File | Why |
|---|---|
| `ARCHITECTURE.md` | **The five-layer classification.** This is the spine of xokolat too. |
| `studio/README.md` | The shell: nav, four-band dock, the shared media gallery, ratings. |
| `PROMPTING_FINDINGS.md` | Model facts (layer B in §5). These ship as code. |
| `FORMAT.md`, `STICKERS.md`, `COLORING.md`, `MASCOTS.md` | The bundle contracts. |
| `IDEAS.md` (search for "SPUN OUT as `xokolat`") | *History, not build material.* Why the project exists and which blockers were real — **with two decisions since revised**, see §3. |
| `private/_brew-service-*/` (never shipped, never published) | How the services are actually kept running — see §13. The operator's own orchestration; formulas install from the `xokolat/local` tap. |

**Zero dependency on miraverse.** `~/src/miraverse` is a separate product. content-factory's
manifest builder imports `@miraverse/content-kit` only to walk works/universes/stories — which
xokolat defers (§8), so nothing here links against miraverse code even though xokolat is itself a
Node project (§14). Same npm registry, no shared package.

**What must never be copied here:** the operator's `content/` (their generated bundles), their
`ratings.json` / `published.json`, and their curated taste data — `palettes/styles.json` ★ curation,
`palettes/artifact-lexicon.json` entries, culture pools. Those stay private. What ships instead is
described in §5.

---

## 3. Decisions already made

These were settled in conversation. Two of them **revise** what `IDEAS.md` says; where they
conflict, this document wins.

1. **Local app, ComfyUI-shaped.** Server + browser UI. Desktop launcher comes late and is thin.
2. **No hosted version now.** See §1.
3. **Zero miraverse dependency.**
4. ⚠️ **REVISION — the app does NOT own its inference.** `IDEAS.md` calls "the app loads models
   itself" *the defining requirement*. Rejected for v1: it means shipping torch + per-platform GPU
   wheels, a multi-GB installer, and driver support tickets — the thing most likely to kill the
   project before the outcome layer is proven. Instead the app **connects to inference the user
   already runs** (Draw Things, ComfyUI, Ollama, LM Studio, cloud keys). Bundled inference becomes a
   possible *later adapter* ("no service? use ours"), paid for once there is proof the outcome layer
   sells. Consequence to accept openly: the pitch is no longer "installing the app is the whole
   install" — it is *"the outcome layer on top of the services you already run"*, with a first-run
   screen that helps you get one. That is also a better wedge: ComfyUI and Draw Things users already
   own the services and are missing exactly this layer.
5. **macOS first, multiplatform by construction.** Platform reach follows the adapter set, not a
   build matrix. Draw Things is macOS-only; ComfyUI and Ollama run everywhere.
6. **One OpenAI-compatible chat adapter** for the writing brain — covers Ollama, LM Studio,
   Lemonade *and* cloud BYO-key in one code path.
7. ⚠️ **REVISION — no agent CLI.** content-factory shells out to `agy` / `claude` (a full coding
   agent that reads a `SKILL.md`, walks a folder and iterates). That cannot ship: a stranger has no
   such CLI, and a local 8B model cannot drive one. Builders become **deterministic code making
   typed, schema-constrained LLM calls**. See §5.
8. **Skills split four ways; three ship, one is an empty box.** See §5.
9. **One required input: a sentence.** Plus two optional controls with defaults. **Culture is not an
   axis** — if the user types it, it is words in the sentence. See §6.
10. **Tags, not axes, for finding things.** The LLM tags what it generated; tags become gallery
    facets. See §6.
11. **Tokens are an optional aid in the prompt**, designed like Claude Code's slash commands. See §7.
12. **The LLM picker is not a top bar.** It lives in the 🔌 inference band with a readout beside ▶ and a
    working default. The product hands you an artifact, not a model picker.
13. **TypeScript on Node for the server; the front end is lifted unchanged as vanilla JS.** See §9
    and §14. Decided 2026-08-02 after weighing Python: the app does **zero** inference in-process
    (§3.4), so "Python is the AI language" does not apply — its core is data shapes moving between a
    server and a browser, which is where types pay. It also makes the cutout in-house (§13), makes
    the gRPC client pure JS, and gives Phase 4 the mature Electron signing/notarization/auto-update
    path instead of PyInstaller. Cost accepted: the Draw Things gRPC client must be re-derived rather
    than read.
14. **v1 scope excludes works / universes / stories / series.** See §8.
15. **No auth.** One user, their own machine. If it ever binds beyond localhost the user does that
    deliberately (content-factory's precedent: a tailnet is the perimeter).

---

## 4. Architecture

### The five layers (from `content-factory/ARCHITECTURE.md` — read it, it is short)

| Layer | What it is |
|---|---|
| **Inference** | a SERVICE that turns a request into bytes — Draw Things, ComfyUI, Ollama, a cutout daemon. Has an install/running state. |
| **Engine** | what a service can be ASKED FOR — a checkpoint, or a capability that is not one (a background remover). Has facts and knobs, never a running state. |
| **Medium** | what kind of output — image · text · voice · music · 3D · video |
| **Style** | reusable settings that shape what a verb produces. Lives with the section that uses it (§4c), never in a registry of its own. |
| **Asset** | one produced file carrying its own provenance (`main.webp`, record embedded — §4) |
| **Composition** | a named thing: its own assets, member assets, and typed references to other compositions. A sticker pack, a coloring book, a mascot, a work, a universe, a story (§4b). |

Plus **Export** (a deterministic transform over a composition: a KDP PDF, a LINE zip — code makes
it, no service involved).

⚠️ **`asset` means one produced file and nothing else.** The reusable named things — a mascot, an
artifact, a work — are **compositions**, not "assets". Two meanings for one word is the
`engines`/`inference` mistake again, and this is the one home of the distinction. (An earlier draft
also had a **Subject** layer for "the address of an asset inside a composition"; it was a reference
with a fancy name and is gone.)

The rules that keep them apart, carried over verbatim:

- **A service made it → Asset. Code composed it → Export.** This is what stops the medium registry
  growing a row per output format.
- **An asset has exactly one service, one parameter set, one provenance record, one ★.** A character whose
  art came from FLUX and whose voice came from a TTS cannot honestly carry one provenance record.
- **Every asset carries its provenance** — one shape for every medium, written **into the file** where
  the format allows (see below), so the provenance chip, the index and a re-run read it without
  knowing which service made it. **Canonical field list — this is its one home in this document, and
  `src/types/` is its one home in the codebase:** `modality · provider · model · workflow · prompt ·
  seed · params · tags · runId · createdAt · durationMs · quality`.
- **A medium's preview must be renderable by a browser as-is.** That is what lets one gallery card
  serve every medium.
- **A composition is optional.** A one-off song is an asset belonging to nothing. Libraries browse *assets*.

**Adding something new stays orthogonal:** a new service touches layers 1–2 only; a new composition
kind touches layer 5 only; a new export touches neither. A new idea should never force you to touch
the other two. This is the whole point of the classification, and the nav order reflects it:
**media → compositions → batches → review → settings** (§4d).

### 4a. Three nouns, five verbs — the whole model

⚠️ **Settled 2026-08-04**, replacing three earlier drafts of §4a–4c. Those accreted nouns —
bundles, subjects, products, shared-vs-deliverable, treatments, slots — and most of them turned out
to be the same thing wearing a different hat. What is left is deliberately small, because the point
of the model is that it can GROW (§4e) without anyone holding more of it in their head.

**Three nouns.**

```
asset          one produced file, carrying its own provenance
composition    a named thing: its own assets, member assets, typed references
style          reusable settings that shape what a verb produces
```

A mascot, an artifact, a sticker pack, a work, a universe, a story and a deck are **all
compositions**. They differ in what they are FOR, never in what they ARE — which is why there is no
"shared vs product" split and no subjects layer.

**Five verbs**, and the count is fixed by policy:

| verb | does | built? |
|---|---|---|
| **generate** | ask an inference service for an asset | ✅ |
| **transform** | per-asset ops — cutout, upscale, recolour, resize | partly (operator rows) |
| **compose** | place assets, text and shapes on a canvas per a layout spec | ✗ |
| **assemble** | gather existing assets into a composition | ✗ |
| **export** | render a composition into a deliverable | ✗ |

**A verb is a generic machine; its input is data.** Build the compositor once and every layout after
it — card faces, colouring pages, sticker sheets, contact sheets, book interiors — is a JSON
document rather than code. That is what makes §4e tractable instead of a plugin API.

**Growth happens in a machine's VOCABULARY, never in the verb count.** Teaching the compositor the
word "bleed" is routine; a sixth verb is a deliberate, argued decision. That asymmetry is the whole
defence against becoming a framework.

⚠️ `compose` the verb and `composition` the noun coexist deliberately. The noun is broader — a
mascot is a composition that nothing composed — and renaming either was considered and rejected as
churn.

### 4b. Levels: there are none

⚠️ **Settled 2026-08-04**, replacing both a `bundle > item > asset` containment tree AND the
"references may nest but the UI shows one hop" rule that replaced it. Both were wrong, and in the
same way: they treated depth as structure.

**References form a GRAPH, and the UI shows one composition at a time with its references as links**
— the way the web works. Nothing nests. Nothing has a depth. There is no breadcrumb trail and no
"which universe am I in" mode.

Hierarchy is therefore **emergent**, appearing whenever references happen to line up:

```
📖 story ──► 🌌 universe ──► 📕 work
                  └────────► 🧸 character ──► 🏺 artifact
```

Three "levels", and the app never knew about them. The same mechanism puts one mascot in a pack, a
deck and a book at once. (miraverse had to make this structural because its bundles were folders on
disk that needed to be git-diffable. Here it falls out of typed references, and nothing has to know.)

**A composition is a SELECTION, not a container.** You do not declare a deck and fill it; you make
card designs and a deck emerges from the ones you kept. Because it holds only references:

- one asset sits in several compositions — no copies, nothing to keep in sync;
- an asset that joins nothing is not orphaned, it is just an asset;
- compositions are cheap and disposable — three decks from the same sixty cards costs nothing;
- **direction is free.** Candidate-first (make, then gather) and composition-first (declare 52 slots,
  fill them over weeks) are the same data. Empty references are a to-do list, not a defect.

### 4c. Styles live with the section that uses them

⚠️ **Settled 2026-08-04**, replacing "one identity with per-medium realizations" — a central style
registry carried over from content-factory, where it belonged because the *factory* was the product.
Here the sections are the product, and a user asking "where are the image styles?" deserves one
obvious answer.

**Media styles are TECHNIQUE ONLY.**

```
🖼 images   flat vector · pencil sketch · watercolour · ink line · 3d render
🎼 music    genre · instrumentation
```

Not themes. "Catalan folk" is a *what* — it belongs in your sentence or in a referenced composition,
never in the style list. Technique-only is what keeps the list short, stable and browsable, and it is
what makes a style safe for xoko to author.

**Composition styles are the product's own look**, plus an optional reference to a media style as
their default:

```
🏷 pack style "folk stickers"
     art     → 🎨 flat vector      a REFERENCE, not a copy — a press-time pick still wins
     outline   3px warm black
     margin    die-cut safe
```

**Transformations belong to the composition, never to the style.** Colouring, die-cut, isolation,
bleed: a sticker is isolated on plain ground with a margin *whatever technique drew it*. Filing those
as style variants was the "treatment axis" of an earlier draft, and it put a product requirement
inside an unrelated object.

**Access is automatic.** A section that generates images offers every image style, with no
declaration and no wiring — it generates images, so the picker is populated.

So one press stacks three optional layers on one required one:

```
your sentence                        ← the ONE required input, in the whole app
  + the media style                  ← picked at press time, or the composition's default
  + what the composition requires    ← isolated · plain ground · die-cut margin
```

Precedence reads the same direction as params already do: press-time beats declared default.

### 4c-bis. A style list is a grid of SWATCHES

⚠️ **Added 2026-08-04**, after the first styles view shipped as a list of text cards and was
correctly rejected. You cannot tell `ink-linework` from `cel-shaded` by reading their words, and
choosing between looks is the entire job of the page. So every entry carries a probe render, and
the words move into the detail of the one you clicked.

- **One fixed subject and one fixed seed, shipped, NOT configurable.** Two styles rendered on two
  different subjects compare nothing. content-factory shipped a configurable probe subject and
  deleted it in its simplification pass; this starts where that ended.
- **The subject is a chick, a chocolate egg and a cake** — the *mona de Pasqua*, which is the app's
  own name in a picture. Chosen for technique: three surfaces styles treat in three ways — down
  (soft, fibrous), chocolate (smooth and specular), cake (matte crumb) — plus a clear silhouette.
  Flat vector kills the highlight on the chocolate, watercolour blooms it, cel-shading bands it.
  ⚠️ **The exact wording is operator-tested, not reasoned** — four revisions, each fixing a real
  bad render, all documented beside the constant in `src/styles/probe.ts`. Two rules came out of
  it: **judge a subject on the weakest model in the list, not the best** (every regression was
  invisible on FLUX and obvious on SDXL), and **keep it short** — the style's own words follow it,
  and a long subject pushes them where CLIP weights them less, making every style less distinct.
  ⚠️ Changing the sentence invalidates every swatch on disk — clear `styles/swatches/` with it.
- **★ is how a list is organised**, the same star an image gets, and starred styles are lifted
  into their own group at the top of the ⚙ picker — which is where it pays, because that dropdown
  is where you choose in a hurry. ⚠️ **★ is a SORT in the picker and a FILTER in the grid**: a
  grid that re-sorts when you star something moves the thing you were just looking at.
- **Three shelves, by how the mark is made** (2026-08-04): `drawn` · `painted` · `graphic`. A
  closed vocabulary per medium (`src/styles/categories.ts`), because the split has to be one a
  THEME cannot pass through — "is this drawn, painted or printed?" has an answer for every
  technique and none for "halloween". A **stored field, not a slug prefix**: content-factory
  derives its family from the slug, which is free and right for 220 entries imported once, but
  here the slug is identity (the ★ key, the swatch path), so a prefix would make re-filing a
  style rename it and lose both. Not its twelve names either — `sai`/`artstyle`/`neo`/`ads`
  arrived with a preset pack, and `misc` holds 21 of its 220, which is what a half-fitting
  taxonomy looks like.
- **Small — at the MODEL's declared minimum** (`caps.resolution[0]`, snapped to a multiple of
  64), never a number chosen by us. A shipped 512 is simply refused by an engine whose floor is
  768, and below its declared minimum a model stops representing itself: a cheap swatch that
  misrepresents the model is worse than a slow one. This is content-factory's rule verbatim.
  The render IS the cost; resolution is the lever, not batching.
- **Lazy and cached.** A style with no swatch shows a placeholder and a ↻; a style you just SAVED
  gets one immediately, because that is the moment you want to see it. Never a wall of renders on
  a page load.
- **Editing a style drops its swatch.** The old picture is not true of the new words, and a swatch
  that lies about its style is worse than none.
- ⚠️ **A swatch is NOT content.** It lives in app data, is never indexed, never appears in the
  gallery and is never exported — the rule §9 already gives the canary probe. Deleting one is
  free because it regenerates.

**The grid is ONE MODEL's grid** (2026-08-04, second pass). A swatch is addressed as
`(medium, service, model, style)` and lives at `styles/swatches/<medium>/<service>/<model>/<slug>.webp`;
the 🔌 band's model is the column, the tally names it, and switching the band repaints. Keying by
style alone meant a card could show a picture from an engine you were not using, with no way to
say so — and the same words genuinely are a different picture on a different checkpoint, which is
the same fact that will later justify per-model wording (a style's default words plus an optional
per-model override, resolved the way `caps` are).

**A cell says what it cost.** The swatch's own embedded `durationMs` is shown on the card (the
same `.media-took` a gallery tile carries) and in ⓘ — because before pressing ▶ shoot on twenty
styles, "3s each or 8s each" is the whole question, and it is a fact about the model as much as
about the style. Measured on the shipped five: klein ~2.8s, SDXL ~8.4s.

**A failure is a result.** When a probe cannot render, the reason is written beside where the
picture would be and the cell becomes a ✗ carrying the engine's own words. A failure that only
flashed is a style you try again tomorrow for the same reason.

This is also **xoko's judging surface** (§4e): propose → probe → ★ keep / 🗑 discard. Building it
here means xoko invents nothing.

### 4c-ter. The styles page is a WORKBENCH

⚠️ **Added 2026-08-04**, after the swatch grid shipped and was still not usable. The gap was never
layout — it was that content-factory's page lets you *work* and ours only let you *look*:

- **A top bar of one line**: filter · ★ only · tally · **▶ sweep** · ✨. The sweep fills every
  missing cell in one press; the tally says how many are shot and on which model.
- **`💾 save & re-shoot` is ONE button.** Changed words make the swatch a lie, so re-shooting is
  the save completing — that removes a button and the stale-picture bug together.
- **The editor is a panel, not a form.** A head row, the fields as bare rows, no hint paragraph
  under each. Every field a style HAS is in it, because saving replaces the entry and a field the
  form hides is a field the save deletes.
- **The axes fold** (`▸ style axes — examples`): the dimensions a style should answer, with a few
  ingredient words each, click-to-append, closed by default. Shipped reference — **not** a
  registry: see `src/styles/axes.ts` for why the half of content-factory's axes machinery that
  served unattended batches has no consumer here.
- **No `＋ new style`.** A blank form you hand-type comma-tags into is the authoring shape that
  does not survive a model change; content-factory deleted its ＋ for the same reason. The door is
  ✨ xoko, which writes one or pulls one and shows the probe render before it joins the list.

### 4d. References are typed, and that is how a kind is defined

A composition kind declares what it accepts, with cardinality. This is simultaneously how
compositions interlink and the whole definition of a kind:

```
kind: sticker pack
   references   character   required, 1
                artifact    optional, any
   produces     sticker     image assets
   styles       image + its own
   verbs        generate → transform → assemble → export
   exports      LINE 8–40 · Etsy clipart
```

`required` is what lets the ✍ dock ask the right question instead of showing a blank box. Everything
else stays optional, per the founding rule.

**The left menu is flat**, and every row is one of exactly two things:

```
🖼  media                    SHIPPED — one row per medium, fixed
      🖼 images        feed · 🎨 styles
      🎼 music         feed · 🎨 styles
      🗣 voices        feed · 🎨 styles
      🧊 3D            feed · 🎨 styles

🧩  compositions             GROWS — one row per KIND
      🧸 characters    feed · 🎨 styles     (the "line" / shared DNA IS this style list)
      🏺 artifacts     feed
      🏷 sticker packs feed · 🎨 styles
      🖍 colouring books feed · 🎨 styles
      🃏 cards & decks feed · 🎨 styles     (later)

📚  batches      💡 ideas · 📓 runbooks
🔍  review       🔍 judge
⚙  settings     📚 library · 🔌 inference · 📁 files · 🖼 media
```

**Any section may have a `🎨 styles` view**, holding the styles that section uses — one uniform rule
rather than three special cases. A view is a **child row in the nav, shown only while its parent is
active**, so the menu grows by one row and not by nine, and every view gets a URL
(`#/images/styles`) for free.

⚠️ Not a tab strip over the feed — that was built first and undone. The centre pane already carries
the gallery's search, facets, view toggle and tile sizing; a third row of controls makes a
place-you-go read as one more toolbar. The nav is the map of the app, and a child row says *this
section contains a place*.

⚠️ **Child rows are COLLAPSED by default**, behind a twisty on the parent. A place visited
occasionally does not belong permanently in the menu; navigating into a view expands it, because
being somewhere invisible is worse than an extra row.

⚠️ **THE DOCK FOLLOWS WHERE YOU ARE.** A view owns the ⚙ and ⓘ bands while it shows — the section's
launch knobs are for making things and mean nothing on a page about styles, and a picked style is
described in ⓘ like every other selection in this app. A view that declares neither falls back to
its section. **The feed is the things; ⓘ is the thing** — a detail block inside the feed was the
first attempt and broke the rule the four bands exist to state. (An earlier draft had a `workbench`
group collecting styles and artifacts centrally; it is gone, because it answered "where do I look for
image styles?" with "somewhere else". A 🧬 `lines` row is gone for the same reason — shared character
DNA is a style list under 🧸 characters, not a section.)

`works · universes · stories` are deliberately absent: that shape FITS the model (§4b) but is
miraverse's scope, not xokolat's (§8).

### 4e. Growing: xoko creates, or pulls

Adding something is always exactly one of two **data** moves — never a new noun, never a new verb:

```
a new style              a row in a section's style list
a new composition kind   a definition naming its references, verbs, styles and exports
```

Both arrive the same way, from either of two sources:

```
   ✨ create ──┐
               ├──► a proposed definition ──► probe render ──► ★ keep / 🗑 discard ──► user layer
   📚 pull ────┘
```

- **create** — the user describes it, the LLM writes the definition, constrained to the schema so a
  malformed one is not emissible. The `parse*` validators stay as the second line of defence.
- **pull** — install a ready-made style or workflow from the library. Built 2026-08-16 as `/api/take`
  and the ⤓ box; what is left is xoko being able to press it (NEXT §1).

One destination: the **user layer** that already exists for registries and style lists — which is
now the *only* layer, since the app ships nothing runnable. Pulling is creating with a head start —
not a second mechanism.

**Where it opens (2026-08-04).** xoko is a **popup, never a nav section** — the popup is the
conversation, the feed is the result. **Two doors, one popup**: the header `✨` opens it cold; a
view's own `✨` opens it *pre-framed* with where you are, so the first sentence is about the style
and not about the app. Its **brain is an inference row like any other** — `medium: 'text'`, its
models in the row's `engines` list — so **local (Ollama) and cloud (Anthropic, plus a key) are two
rows on the same shelf**, and choosing between them is the same two-level pick as choosing a
checkpoint, collapsed into the popup's header. The cloud row's "not there" is *no key* rather than
*not installed*: one declared credential name and a paste button, not a subsystem.

⚠️ The 🔌 **picker filters by the section's medium**, or the writing brain appears in the images
section's engine dropdown and picking it queues a job that cannot succeed. Every section that
launches declares its `medium`.

**xoko only ever PROPOSES.** It never presses buttons on the user's behalf, which is what keeps it
from becoming a second half-maintained way to do everything the UI does — and what keeps v1 free of
tools, library access and any agent loop. Its first job is *classification*, because most asks are a
style, a reference or an existing section with an argument, and only rarely a new kind. When
something is impossible it says which VERB is missing; that list is the roadmap.

⚠️ **The schema must be able to say NO.** The day a definition grows a "custom JS" escape hatch, the
safety argument is gone.

⚠️ **Not scheduled beyond styles.** Composition kinds are not authored before the machines they
compose exist — designing that schema now would be designing against imagination. Styles need no new
verb, which is why they are xoko's first and only v1 target (§8).

### 4f. Judging is one star, and delete is a delete

⚠️ **Changed 2026-08-03**, from 👍 / 👎 / unseen.

👎 only ever meant *hide this everywhere* — a delete that frees no disk and shortens no list. Once
delete is real, it is a second way of saying *not good*, so: **★ or not, plus delete.** One button
that fills, and the header's ★ toggle drops everything unstarred out of every feed at once.

**Rating is a FILTER, not a gate.** It is available everywhere, no one ever has to complete it, and
it gates nothing — selection into a bundle (§4b) stays explicit. It exists so that picking six out
of two hundred is possible.

**No trash, no undo, no confirmation.** Generation is cheap and the user is an adult. And the record
goes with the file *by design*: provenance is embedded, so it has exactly one lifetime and can never
be orphaned. A ledger of deleted things would reintroduce the orphan problem embedding solves, and
would then need its own deletion rule.

Deleting the last asset in a run takes the husk with it — the engine folder, the run folder and the
`run.json`, because a run record describing no assets is a card for a picture that is not there.
Pruning stops at `media/<medium>/`, which is structure. Nothing outside `media/` is deletable through
the API: the library is the user's folder and they may keep anything in it.

### The four invariants

Everything above collapses to these. If a change breaks one, it is the change that is wrong:

1. **Media is shipped.** A new medium is an adapter, an encoder, a preview and an export path. It is
   never authored from inside the app.
2. **The verb count is fixed.** Vocabulary grows; the machine list does not.
3. **Growing is a data move** — a style or a composition kind. Never a noun, never a verb.
4. **One required input: the sentence.** Style, references and knobs are optional or defaulted,
   everywhere, always.


### The shell

Ported near-verbatim from `content-factory/studio` (see §9):

- **Left nav** — the classification above, not a feature list.
- **Center** — the section's content **feed**, with the ✍ **prompt dock** underneath. Generate → the
  run streams into the feed → the finished composition replaces it.
- **Right dock — four bands, always these four, always this order:**

| Band | Answers | Default |
|---|---|---|
| 🔌 **inference** | which service, then which engine of it | shut, global |
| ⚙ **`<section>`** | the section's launch knobs (titled from the nav entry) | open, per section |
| ⓘ **selection** | what you just picked in the feed | open, per section |
| ▶ **queue** | what is running — the single status surface, with the live log tail | shut, global |

Every band wears the same header — caret · icon · title · **summary** — and the summary is
load-bearing: a shut band still answers its own question (`local · flux-klein`, `▶1 ⏳2 · ≈18m`).
Two bands reopen themselves and only for a reason: ⓘ on a pick, ▶ when a job **fails**.

**A pipeline contributes CONTENT to a band and never a layout.** No section invents a heading or a
detail pane. This is what makes sections feel like one app.

**One breakpoint, 860px, in one place.** Below it nothing is removed, things only move: nav → ☰
drawer, dock → ⚙ bottom sheet. Don't hardcode widths in JS.

### The builder shape — and why it must be replicable

**Adding a new kind of generation must always be the same four parts**, so the tenth one is written
the same way as the second:

```
schema        what the LLM must return (JSON schema — the LLM's whole job)
prompt        a short grounded instruction (~30 lines, not 219)
gates         deterministic code: render, cut out, validate, assemble, refuse to emit invalid output
registry row  one DATA row that makes it appear in the UI
```

Plus **one golden payload in `tests/`**. No new endpoint, no new JavaScript, no bespoke layout.
content-factory proved this at the family level (`server/runbooks.py FAMILIES` — the browser renders
whatever descriptor the server serves and has no family knowledge at all); xokolat applies the same
discipline at the builder level.

**The LLM's job is filling a schema.** Everything else is deterministic. That is what lets the app
work against a small local model, a big cloud model, or anything in between, without caring which.

### How the schema is actually enforced

"One OpenAI-compatible adapter" is **one transport, not one structured-output mechanism** — that part
is genuinely not uniform, and glossing it is how Phase 2 gets re-litigated badly:

| endpoint | mechanism |
|---|---|
| OpenAI / most cloud | `response_format: { type: "json_schema", strict: true }` |
| LM Studio | the same, on recent versions |
| Ollama | `format` — plain `"json"` on older builds, a schema on newer |
| llama.cpp | GBNF grammars |
| anything else | nothing — prose that *looks* like JSON |

So it is a **capability, declared like every other one**: the text service's `caps` carries
`structured: "json_schema" | "json" | "none"`, and the adapter uses the best mechanism the endpoint
admits to.

**And then it validates anyway.** Never trust the mechanism — parse the response, check it against the
schema in code, and on failure **retry with the validation error fed back to the model**. Two retries,
then **fail the job with a clear message**. A builder never proceeds on partial or coerced output:
half a sticker pack silently becomes a bad composition, and the whole point of gates is that invalid things
cannot be emitted.

This is what makes `structured: "none"` survivable — a weak endpoint just fails validation more often
— and it is why a small local model is viable at all.

### The request, and where assets land

**Every generation is the same request shape:**

```
{ medium, text, style, inference: [{ id, params? }], refs: [{ asset, role }], count, params }
```

`style` is a namespaced slug from the medium's style list (`xk:flat-vector`, `user:my-look`). It was
called `preset` until 2026-08-04, while layer 3 was called `palette`; both names moved together when
**Style** became the layer (§4a). The old rationale — that the CONTROL is labelled per medium while
the field is one — still holds and is not a reason for the field to disagree with its layer. What
that paragraph originally warned against remains true, and is why the word `palette`
word already names layer 3 of the classification *and* the shipped directory; and not `style`,
because the control is labelled per medium (style for image, genre for music, dna for a mascot) even
though the field is one.

`count` is a top-level field, not a knob: it says **how many assets**, which is structurally different
from how each one is made. **When `count` > 1 and the service declares `batch: false`, the runner loops
serially with N seeds** — one job, N assets, either way.

`params` is the service knob bag (seed, steps, resolution…). **It is per-service, with the top-level
one as a shared default** — because `caps` differ per service, a single bag "validated against that
service's caps" is a lie the moment two are selected. One service, the common case, writes
nothing extra.

A violation is **rejected with a named error, never silently clamped** — the UI builds its controls
from `caps`, so a rejection means a bug or a hand-made request, and quietly substituting a different
value is exactly the silent-wrong-answer failure §13 exists to prevent.

**One press is one RUN, and the server mints it.** The request arrives with no path in it; the server
creates a run record with a server-derived `<slug>-<ts>` id, then queues N jobs that reference that
run id — which is how N services land in one folder without the browser ever naming a path. (The
factory does the opposite: `media.js` mints the run folder client-side, precisely because two runners
started a second apart would stamp two different timestamps. Same problem, solved one level up.)

A reference is never just "an image" — it carries a **role**, and a service declares in `caps` which
roles it accepts:

| role | means | used by |
|---|---|---|
| `subject` | reproduce *this thing* | image→3D · character i2i · IP-Adapter |
| `style` | look like this | image style references |
| `start` | begin from this frame | video |
| `edit` | change this region | Kontext / inpaint |

So the input control is the same everywhere: a prompt box plus a **reference tray showing only the
roles the chosen service accepts**. Image→3D requires one `subject` and has no prompt; voice and music
show no tray. **A reference points at an ASSET, not an upload** — "3D this character" is picking the
character; an upload is just an imported asset.

### `caps` — declare the capability, never infer it

`caps` is the most load-bearing shape in the app: composition branches on it, the reference tray is
built from it, `params` is validated against it, and the 🔌 shelf prints it. **A new service states
its facts in a registry row instead of provoking a code change** — and the shelf shows what a build
will actually act on, never a tidier version.

```jsonc
"caps": {
  "negatives": false,            // does a negative prompt reach anything at all
  "idiom": "prose",              // prose | tags — how this model wants to be addressed
  "words": [20, 120],            // useful prompt-length band
  "resolution": [512, 1536],     // supported band
  "stepsLocked": 4,              // a fixed step count, or null when free
  "refs": ["subject", "style"],  // which reference ROLES it accepts (the table above)
  "batch": true                  // can it return N images in one request
}
```

**Never infer a capability from a model's name.** The two Draw Things services are the standing
example: same vendor, and only `caps` distinguishes the one with ControlNet/IP-Adapter from the one
without. A service that claims nothing gets nothing — a row with no `caps` is treated as minimal, not
as unknown-therefore-permissive.

### Caps resolve in TWO levels: service ← engine

⚠️ **Half the capability facts are not SERVICE facts.** Phase 0 shipped with one level and the gap
showed up as a wrong render rather than as a design argument: the registry declared
`stepsLocked: null` on Draw Things (true — the server locks nothing) while the ⚙ band defaulted steps
to 4 (true of klein and of nothing else), so **SDXL rendered at 4 steps and FLUX.1-dev at 4 instead
of 28**. Neither statement was wrong. They are statements about *different things*, and there was
nowhere to put the second one.

So an inference row carries **`models`**: facts about individual checkpoints, each a **`CapsPatch`** — a
partial `caps` stating only what it changes — plus the knobs that checkpoint wants (`steps`, `cfg`,
`sampler`, `shift`). A service's caps are complete; a model narrows them. That asymmetry is the whole
rule, and it is why a partial `caps` is an error on a service and the normal case on a model.

**⚠️ `models` is NOT an inventory.** What is on this machine is answered by the service's catalog, at
runtime, always — never by the presence of a row. The merge has three honest states, the same
*declared · actually-there* reading the 🔌 shelf gives services, one level down:

| state | means | in the picker |
|---|---|---|
| `known` | declared here **and** in the catalog | yes — its facts apply |
| `discovered` | in the catalog, nothing declared | yes — it gets the **service's** caps, and the shelf says so |
| `declared` | declared here, **not** on this machine | **no.** Listed, never offered, never the default |

A checkpoint nobody described still renders; it just gets no assumptions. Declaring one a stranger
does not have costs nothing — it simply never appears in their picker.

The **model sits between the service and the request** in the params merge — narrower than "Draw
Things", wider than "what this person asked for":

```
service.defaults  →  engine.params  →  request.params  →  that service's own params
```

That ordering is what makes *picking a checkpoint* mean 4 steps or 28 without either number being
typed. `idiom` travels with it: the same style reaches SDXL as comma-separated tags and klein as
prose, because that is a checkpoint fact.

**The catalog is asked once and cached** (`src/inference/catalog.ts`), by the shelf and the render path
together. `/api/inference` polls every 15 seconds and never asks — a cold Draw Things scan is ~40s — so
the shelf reports the cache and says *"not asked yet"*, which is never drawn as *"nothing
installed"*. A failure is remembered so the shelf can show it but is never sticky: the next real read
tries again, or one bad second means rendering without model metadata for the life of the process.

**A media generation belongs to no composition, so it lands in a run folder — and the run folder IS
the group the gallery draws:**

```
<content>/media/<medium>/<slug>-<ts>/<service>/<master>
```

**`<slug>` is derived by the SERVER** from the request text — slugified, length-capped, ASCII — and
never chosen by a model or sent by the browser. §15 rule 2 applies directly: a path an LLM names is a
path an LLM can name `../`.

**One press with N services selected queues N serial jobs sharing one run folder**, one cell per
service. A single-service run is the same thing with one cell — which is why a comparison needs no
separate mode: grouping is the general case, and A/B is just a group with N > 1.

**File naming inside `<service>/`:** `NN.webp`, zero-padded from 1, in request order — so `count: 3`
lands `01.webp · 02.webp · 03.webp`. A name is never taken from model output.

**Two shapes carry "which service made this", and only ONE of them is a gallery group.** A media run
puts the service in the *path*; a composition's MEMBER puts it in the *filename* beside a stable
master (`main.webp`, `alt-<service>.webp`, §4 below). That difference is deliberate — a run is an
ask, a member is a durable slug you can hang a second medium off — and it has a consequence worth
stating: **members do NOT project into `manifest.media`.** Compositions are browsed by their own
sections, where a candidate set is a property of one member, not a group of its own. The shared
gallery stays "one component over one index" because that index is media runs; the sticker shelf is a
different view of different data.

⚠️ "Member" is a POSITION inside a composition, not a fourth noun (§4a). An earlier draft called it a
*subject* and gave it a layer of its own; it was a reference with a fancy name.

**Inside a composition, a member is a folder and media are subfolders under it:**

```
<composition>/members/<slug>/image/main.webp
                            /voice/voice.qvp + voice.mp3
                            /model/model.glb + preview.png
```

One level of ceremony, uniform, so no tool branches on layout and nothing needs migrating the day a
member gains a second medium.

**Comparing services is a feature of one subject, never a subject per render.** Candidates sit beside
the master (`main.webp` promoted; `alt-<service>.webp` each carrying its own provenance); promotion is a
rename, discarding is a delete, and **the subject's slug never moves** — which is what makes it safe
to hang a voice or a mesh off it later. Positional identity (`take-1`, `take-2`) is the shape this
replaces.

### Provenance lives IN the file, not beside it

⚠️ **Changed from the factory, deliberately (2026-08-02).** content-factory writes a
`<stem>.gen.yaml` sidecar next to every master. xokolat **embeds the same record in the file** —
`sharp` writes PNG/WebP metadata directly — and keeps a sidecar only as the fallback for formats that
cannot hold one.

**Why the change.** The sidecar is inherited from miraverse, where it earned its place for reasons
that do not survive: miraverse bundles had to be git-diffable, assets were uploaded to object storage as
separate blobs, some modalities had no metadata story, and — the real one — **agents wrote the files
by hand**, which is far easier in YAML than in image metadata. That is also where the "boilerplate"
feeling came from: every skill had to *remember* to write one, enforced by prose in a 219-line
`SKILL.md`. Here the render path writes it in code, in one place, and no builder ever thinks about
it. **Removing the agent removed the boilerplate; provenance itself was never the cost.**

**Why embedding is better here.** It is what the whole ecosystem does — A1111 and Forge write
prompt/seed/sampler/model into a PNG text chunk, ComfyUI writes the entire workflow graph — and it
makes the file **self-describing once it leaves the app**, which a sidecar never is. It also halves
the file count, cannot orphan, and buys a real feature almost free: **drop a sticker back in →
"make more like this."**

**The carrier is XMP, and the interop claim is deliberately weak.** Two facts kill the obvious
version: A1111's format is a PNG `tEXt` chunk named `parameters`, and **`sharp` has no API for PNG
text chunks** (it offers `withExif` / `withXmp` / `withIccProfile`) — and our masters are `.webp`
anyway, which no PNG-info reader looks at. So: **write XMP** (`sharp.withXmp()`, present in 0.34+;
we are on 0.35.3). XMP is plain text, so it is written and read back **without a parser** — which
matters, because `sharp` hands EXIF back as a raw `Buffer` and parsing it would mean a sixth
dependency (`exif-reader`) for no gain. The honest statement of the goal is **self-describing to us,
best-effort to others** — not A1111 compatibility.

**In Phase 0–2 that means exactly one mechanism**, since everything is PNG/WebP. The sidecar fallback
does not appear until music and 3D in Phase 3 (`.mp3` via ID3, `.glb` via `asset.extras`, and a
sidecar for anything with no story at all).

⚠️ **Exports strip it.** A LINE pack or an Etsy zip is a file the user *sells*; embedding their
prompt in it publishes their method. **Provenance is for the library, not the deliverable** — the
export step removes metadata, and that is a gate, not an option.

### Masters are WebP, and lossy by default

⚠️ **Added 2026-08-03.** One stored format, one extension: **`.webp`**. Nothing downstream — the
index, `/content/…`, the gallery, exports — ever branches on how a master was encoded, which is the
whole reason this stays cheap.

**Lossy q92 by default, lossless as a library setting** (📁, `settings.masterLossless`). Measured on
a real 1024² render: **112 kB lossy · 623 kB lossless · 1133 kB PNG**. So WebP-lossless is ~45%
smaller than PNG and there is no reason to keep PNG as a stored format at all.

What lossy costs is **exactness**: re-encoding a decoded master moves **31.6% of channel values**
(max delta 9), lossless moves none. That matters for line art, for anything a cutout will flood-fill
along a border, and for work heading to print — because **every export derives from the master**. It
does not matter for the common case, and 5.5× the bytes on every render does.

**The encoder comes from `provenance.lossless`**, not from a second argument: one field both decides
the encoding and describes it, so the record can never disagree with the file. A library may hold
both kinds, and the ⓘ band says which one you are looking at.

**PNG stays as a BOUNDARY format** — the clipboard takes it, LINE and KDP require it. An export
converting to PNG is the export layer doing its job, not a second master.

**Rejected: lossless as the default.** Correct in the abstract, wrong for an app whose output is
mostly not print-bound; paying 5.5× on everything to protect a Phase 2 gate that does not exist yet
is paying now for a maybe.

**Rejected: a per-run toggle.** A folder where some masters are exact and some are not, for reasons
nobody remembers a month later, is worse than either choice made once. It is a property of the
library.

### One job at a time

**Builds run on a SERIAL lane**, one at a time — there is one GPU, and content jobs run minutes, not
milliseconds. CPU-only work (exports, cutouts, packaging) runs on a **separate parallel fast lane**,
because making someone wait behind a render to get a zip is absurd.

This is not a limitation to design around later; it is the shape from the first commit. The ▶ queue
band exists because of it, and so does the ETA (median of our own telemetry per unit, and silence
rather than a guess for a job type never run).

**A job can be stopped.** With one lane and minute-long renders, a queue with no ✕ is a queue that
holds you hostage — content-factory has this gap open in its own backlog and xokolat must not inherit
it. Queued: drop it. Running: **kill the process group, not just the parent** (a service's children
outlive a `kill` on the wrapper), then mark it `cancelled`.

**A restart never resumes.** In-flight jobs are marked `interrupted` on startup, not restarted — the
partial run folder stays on disk and the builder's gate rejects it, which is the honest outcome. A job
that silently re-runs after a crash is how you get two half-packs and no way to tell them apart.

---

## 5. Skills — what ships and what doesn't

A `SKILL.md` in the factory (e.g. `~/src/agent-skills/content/sticker-builder/SKILL.md`, 219 lines)
glues together four different kinds of knowledge. They have different answers, and separating them
is the whole design:

| | What it is | Example | Ships as |
|---|---|---|---|
| **A. Gates** | what makes output *valid* | real transparent pixels; LINE 370×320; the composition validates | **code.** The builder cannot emit an invalid artifact. Not taste — the difference between a file that works and one that doesn't. |
| **B. Model facts** | how the tools actually behave | FLUX takes no negative prompt, so a constraint must be phrased as something *present*; style must be typed into the prompt; a cultural clause loses its shape when it trails a long prompt, so it goes first | **code + `caps` data.** Not taste — anyone with the same model hits the same wall. This is most of what makes a stranger's first render not-garbage. |
| **C. Subject brief** | turning a spine into N subjects | "every sticker answers a chat moment someone would send"; "specific over generic" | **a short generic prompt + schema.** ~30 lines. This is where *don't overdo it* applies. |
| **D. Curated taste** | the operator's data | tested `drawPrompt` strings, ★ style curation, culture pools | **an editable registry, seeded thin.** A Japanese user needs a different lexicon than a Catalan one, so it has to be user-owned anyway. The operator's version stays in their factory. |

**Consequence to accept openly:** xokolat's output will be more generic than the factory's. That is
the right trade, because the part worth keeping private is *culturally specific* and a stranger's
culture isn't the operator's. What survives generically — B plus a decent C — is already well above
"16 images about coffee".

**Skills stop being documents.** Do not port `SKILL.md` files. Port the four layers into the builder
shape in §4.

---

## 6. Inputs and tags

### One sentence in

A build takes **a spine: one free-text sentence.** "coffee before 9am". "cats being dramatic".
"catalan food". Plus **two optional controls with real defaults**: a style (or *surprise me*) and a
count. Everything else that was an axis in the factory — kind, era, mood, cast, artifact — leaves
the launch form and becomes a default or a post-hoc refinement.

**Culture is not a field.** No pool, no rule that a culture pack must do X. The factory needed a
rule saying "never invent a culture to fill a field"; with no field, the rule is unnecessary.

Every axis you keep is a pool someone must curate, a validator someone must write, and a decision
the user doesn't know how to make.

### Tags out

**The LLM tags what it generated** — `catalan culture`, `food`, `winter`, `expressions` — and they
are projected into the index, where they surface as **gallery facets** (the filter mechanism already
exists in `gallery.js`), so "show me everything related to catalan culture" works without anyone
having pre-declared a culture axis.

**Where they live:** asset-level tags go in the **embedded provenance record** (§4) as a `tags` field
— they describe the asset, so they travel with it; composition-level tags go in the **composition manifest**,
which is a real file.

⚠️ **Tags must be known BEFORE the master is written, and the builder shape already gives you that.**
The same schema call that produces the subjects produces their tags (§4) — so tags are in hand at
render time and the provenance record is written once. This is not a nicety: **`sharp` has no
in-place metadata write.** Adding a field afterwards means piping the file through `sharp` again,
which re-encodes the pixels — generation loss on every master, on every tagging pass. A media run
with no builder derives its tags from the request text at queue time, for the same reason.

**If a tag ever genuinely arrives late** (a user edits one), it goes in the **index only** and never
triggers a rewrite of the master. The index is a derived cache (§9) and can hold what the file
cannot.

Two disciplines that keep this from decaying:

- **Tags are descriptive output, never generation input.** The moment a tag feeds back into a
  prompt, it is an axis again through the back door.
- **Normalize lightly** (lowercase, trim, dedupe) rather than curating into pools. The vocabulary
  grows with the content; that is the feature.

This is the split the factory's axes were missing: axes were doing double duty as *controls* and as
*organization*, and only the second job was ever really needed.

**Axes survive in exactly one place: the 🖼 images `🎨 styles` view**, as a design tool — roll a composition,
probe it, ⭐ promote a winner into a style. Never a launch control.

---

## 7. The prompt: free text first, tokens as an aid

The prompt is **plain text and always works**. Tokens exist to *suggest what is possible*, not to
form a required grammar. Design them the way Claude Code designs slash commands, adapted:

- **`/` opens a menu of what's available in THIS section**, each with a one-line description;
  typing filters. Discovery is the point — a user who never types `/` loses nothing.
- **A token fills a VISIBLE control.** `/genre jazz` moves the genre control in the ⚙ band and shows
  it moved. It never sets a hidden parameter. (content-factory learned this from its idea bank:
  whatever an idea adds is *printed on the row you ticked*, never applied invisibly — filling only
  the theme is what once turned "polite ways to say no" into eight office objects.)
- **Two reserved values everywhere**, so a token never forces a decision: a style slug, or
  `random` (a curated style), or a plain free-text value where the medium allows one.
- **Tokens are a registry, not code** — one data row per token per section (`{ token, label, control,
  values }`), so a new one costs nothing and the browser needs no per-token knowledge.
- **One token per dimension.** The factory's rule: `/style` for image, `/genre` for music, `/dna` for
  a mascot genome — never a parallel `/axes` token. Steering individual axes lives in the styles view.

Rule of thumb for whether something deserves a token: *would a user who doesn't know the domain be
better off seeing this word exists?* `/genre` yes. `/seed` no (that's a control).

---

## 8. Scope and phases

**THE MENU — and every row of it exists from the first commit.** A section that is not built yet is
a placeholder saying which phase builds it, rather than being absent and making the app look like it
has two features. `SECTIONS` in `web/lib/shell.js` **is** the nav; there is no second list.

```
MEDIA           🖼 images · 🎼 music · 🗣 voices · 🧊 3D
COMPOSITIONS    🧸 characters · 🧬 lines · 🏷 sticker packs · 🖍 coloring books
WORKBENCH       🎨 styles · 🏺 artifacts
BATCHES         💡 ideas · 📓 runbooks
REVIEW          🔍 judge
SETTINGS        📚 library · 🔌 inference · 📁 files · 🖼 media
```

⚠️ **🔌 inference and 🧩 engines are SETTINGS rows** — corrected here, because this list used to file
them under a `workbench` group while Phase 1 below was headed *"inference is a settings section"*, and
the code followed the wrong one. (The workbench group itself is gone as of §4d: styles live with the
section that uses them.) Making things happens in a section — styles, artifact
wording, DNA — and everything in it produces content. Neither of these does: one says what is
installed and reachable, the other says what it can be asked for. Settings is also where Phase 1's
other rows go (content location, appearance, app defaults), so the group earns itself immediately.

**They are two sections and not one.** The engine list was first built into the service card, which
turned a settings card into a wall — the same filing error one level down (DECISIONS.md).

**Deferred:** works, universes, stories, series. They are the most complex builders, they are the
only reason a Node dependency would exist, and the app is a complete product without them.

### Phase 0 — the skeleton proves the port

Server + registries + the lifted shell + the media gallery + **one medium (image)** against **one
inference adapter — Draw Things gRPC in `external` mode**, pointed at whatever is already running on the
dev machine (`127.0.0.1:7859` today). No supervisor yet: that is Phase 1's job, and skipping it is
what keeps Phase 0 small.
Embedded provenance (§4), the serial job lane, and ★ from the first commit.
**Gate:** with a service already running, one prompt renders an image into a run folder, it appears
in the gallery with its provenance chip, and it can be rated. ✅ **Built, and then corrected on
three counts once it could be used** — the model level (§4), the sheet feed (§9), and 🔌 inference
moving to settings (§8). All three are recorded in `DECISIONS.md`, which is where changes of mind
about a built thing go from here.

### Phase 1 — inference is a settings section, and a LIFECYCLE

The section is already **in** settings (§8); this is where it gains a lifecycle.

The inference registry becomes **editable in the app** — including the `models` rows §4 introduced, so
declaring "this checkpoint is the 4-step one" stops needing a text editor. Add an endpoint, describe
a model, declare `caps` **and a launch policy** (the four modes are tabled once in §13 — `external` · `child` · `user-agent` ·
`builtin`), plus health, supervision and provisioning. One supervisor implements them; nothing about
a service is bespoke code.
Live checks with the three distinct failure modes (**server down** → start it · **not installed** →
download it · **can't check** → never reported as missing), over a plain TCP probe that does not
share a lane with the work (§13.2).
Text adapter (OpenAI-compatible) lands here — it is just another inference row.
**Also here:** the Draw Things first-run path — fetch the first-party `gRPCServerCLI` binary, install
it as a **user launch agent** (never a child of the app server — §13.1), point it at a models
directory, probe a free port, verify with the **canary render**. This is the single riskiest piece of
the first-run experience and it deserves the whole phase.
**Gate:** a machine with nothing configured is walked to a working render; every failure it can hit
says which of the three it is; and a service that starts but renders noise is caught, not shipped.

### Phase 2 — the first real builder

**Sticker pack** — one builder, written as the *template* the next ones copy (§4) — because it
exercises everything: schema → prompt → render loop → **cutout gate** → composition → export. Mascot and
coloring book come after; the three share a flat-family shape in the factory
(`runners/flat_family.py`).
**Needs the cutout operator:** tier 1 — a `sharp` border flood-fill over the flat background the
builder's own framing words produce (§13). No model, no download, no new dependency. Tier 2 escalates
only where the gate says tier 1 failed.

**Exports: LINE here, KDP with the coloring book.** LINE is the sticker pack's own export, so it
lands in this phase. **KDP is a coloring-book interior and there is no coloring book until Phase 3**
— shipping it here would mean validating a PDF against a hand-made fixture, which proves nothing.
(This corrects §11's earlier "both in Phase 2".)
**Gate:** one spine sentence produces a valid pack a stranger could upload, with tags.

### Phase 3 — the rest of the media, and the design views

Mascot and coloring-book builders (copying the Phase 2 template) plus the **KDP export** the coloring
book feeds. Music, voice, 3D through the shared gallery — all four media are one component,
`pipelines/media.js`, instantiated per medium. The `🎨 styles` views (the list, the swatch grid, the roll
bench). Text artifacts registry. Ideas + runbooks. The review lane.

### Phase 4 — packaging, and only then

**`npx xokolat`, Node 26 required, the browser as the window** (DECISIONS 2026-10-05): the app is
an npm package, and a person runs `npx xokolat` — it copies itself into app data once per version,
installs its locked dependencies, and opens their default browser. Electron was the plan, then a
Swift window on macOS shipped as a `.dmg` (0.1.x), then a zip for a day; each buys something at
the price of one more artifact to build and host. Per-OS native apps come back if there is traction.

Optionally the bundled-inference adapter, if there is proof the outcome layer sells — as a spawned
sidecar process, which is what it would have been in a Python app too (§12).

**Before there are users, there is no packaging.** Phases 0–3 install by `git clone && npm ci`.
Don't build this early; just don't make it impossible, which is what §15 is for.

### Not scheduled

Works / universes / stories / series. Hosted version. Bundled inference before proof.

---

## 9. Code: what to lift, what to rewrite

### Lift near-verbatim — `~/content-factory/studio/`

It is vanilla JS, no framework, no build step, phone-proven, and it just converged after a long
simplification pass. Rewriting it would throw away the most settled thing available in exchange for
a toolchain.

| From | What it is |
|---|---|
| `lib/shell.js` | routing, the four-band dock assembly, the service/LLM readout, `/api/status` polling, nav badges |
| `lib/launch-kit.js` | `dockSection`, `promptDock`, `ratingWidget`, `provChip`, the token/field helpers |
| `lib/gallery.js` | **the shared media gallery** — one component over one index for every medium |
| `lib/shared.js` | `el()` (lazy `<img>` by default), fetch helpers |
| `lib/idea-map.js` | an idea's tags → which controls they fill; shared by the board and the docks |
| `lib/mascot-style.js` | the mascot style/DNA helpers |
| `lib/pipelines/media.js` | **one generic component instantiated per MEDIUM** (voice, 3D — Phase 3); not a section of its own, which is why the section count and the module count differ |
| `lib/pipelines/*.js` | the rest, one module per section — see the drop list below |
| `app.css` | including the single 860px mobile layer at its foot |
| `index.html`, `app.webmanifest`, `icon.svg` | the shell + home-screen install |

**Of `lib/pipelines/`, drop exactly three:** `works.js` and `universes.js` (deferred scope, §8) and
`home.js` (the nav has no home slot — media → compositions → batches → review →
settings).

⚠️ **`gallery.js` is no longer verbatim.** It was lifted whole and one thing about it turned out to
be wrong here — see the sheet, below. Everything else in it stays diffable against the factory's
copy.

### The feed is a SHEET, because a group is provenance and not a layout unit

The factory drew every group as a full-width block with a header (slug, timestamp, the ask). That is
right for the case it was written for — two services answering one brief — and wrong for the common
one. Twelve one-off renders became twelve stacked bands: a log, not a gallery. Worse, that header
**duplicated the ⓘ band**, which already says all of it about whatever is picked.

So the default view is a **sheet**: consecutive single-cell groups flow into one dense grid, and a
multi-cell group keeps its framed card, because *there* the header earns itself. Adjacency is free —
cells of one press share a timestamp and are already neighbours — so collapsing costs only the
repeated header, which is the thing it was meant to remove. The ask survives on the tile's tooltip
and in ⓘ. `runs` stays available as a second view for reading the feed as history.

**Tile size is a control (S/M/L), not a mode** — and it replaced the global 👁 squint toggle for
media. Two controls answering one question is how they drift apart; squint's remaining CSS belongs to
the Phase 2/3 shelves and is dormant until those exist.

⚠️ **`imageab.js` is NOT a drop — it is the 🖼 images section.** The name is a leftover from when it
was a standalone A/B page; it is now task-scoped launches over the shared gallery. The A/B tabs that
*were* deleted lived in `music.js`. Dropping `imageab.js` would delete the images section, which is
Phase 0's only medium.

Two things travel with it and must not be lost:

- **Verdict ids are stable, server-side, and never invented client-side** (`stickers:<path>`,
  `mascots:<path>#<member>`). A reshaped index must never orphan a rating somebody gave.
- **`?v=` cache-busting on every module specifier**, bumped everywhere at once — two specifiers for
  the same file load two module instances.

⚠️ **"Near-verbatim" is FALSE for the launch path — and this is the biggest correction in §9.**
What is lifted is the **layout, dock, gallery and routing**. Every section's *payload builder* is
rewritten to §4's request shape, because the factory's payloads contradict it in four ways:

| the factory does | §4 requires |
|---|---|
| the browser mints the run folder (`media.js` `run_id`) | the **server** mints the run id; no path in a request |
| per-medium snake_case payloads (`ref_text`, `octree`, `cutout`) | one shape, `{ medium, text, style, inference[], … }` |
| a run *name* is a required typed input | the only required input is a sentence (§6) |
| service-specific fields spread across the payload | `inference: [{ id, params }]` |

Rewriting them is a small job — they are the last ~20 lines of each module — but it must be
*intended*, not discovered. **What a payload builder produces is `src/types/` `Request`, always.**

⚠️ **Lifting also PINS the manifest shape — expect this in the first hour.** The lifted modules are
not generic: `gallery.js` expects `manifest.media` as groups-with-cells, the section modules expect
their own arrays, and `provChip` expects the provenance identity subset. So the new server must emit
what they already read, or you consciously change both together. Two consequences:

- **Type the manifest FIRST.** It is the contract between the lifted JS and the new TS server, so it
  is the first thing in `src/types/` and the thing `tsc` should be protecting from day one.
- **Read `content-factory/studio/build-manifest.mjs` as the spec for that shape** — it is already
  JavaScript, so this is the one place where reading the factory's implementation closely is right
  rather than a trap.

**The index is built in-process, not by a separate script.** The factory shells out to
`build-manifest.mjs` because its server is Python and its manifest builder is Node; that split
disappears here. Build the index in the server, rebuild it when a job finishes (the factory's
behaviour), and keep a manual rebuild for content changed outside the app.

⚠️ **Embedding provenance made indexing more expensive, and the plan should own that.** A sidecar
could be read without touching the master; now a full rebuild opens **every** file. So: **the index
is a derived cache** — persisted in app data, updated incrementally by mtime (a finished job appends
its own entries and touches nothing else), and a full rebuild is an explicit, `O(files × metadata
read)` action rather than something that happens on a page load. `sharp` reads metadata without
decoding pixels, so a rebuild is fast, but it is not free and it is not a hot path.

The front end stays **vanilla JavaScript with no build step** — it is not converted to TypeScript
and gets no framework. It is the most settled asset in the project (phone-proven, just converged
after a long simplification pass), and rewriting it would destroy the one thing worth lifting. TS
lives on the server; the shared types reach the browser as `.d.ts` for editor support only, never as
a compile step the UI depends on.

### Rewrite in TypeScript — everything the Python did

`~/content-factory/studio/serve.py` + `server/*` + `runners/*` is where every single-operator
assumption lives: hardcoded `~/content-factory` paths, a hand-started gRPC server, `agy`/`claude`
shell-outs, flat JSON files behind process locks, one style layer. **Read it for the logic, do not
port it** — it is a different language now, which makes translating it line by line a trap rather
than a shortcut. Take the *decisions*, not the code.

Worth reading closely before writing the equivalent:

*(Paths below are relative to `~/content-factory`.)*

- `runners/factory_common.py` — the single source of paths + registry loaders shared by server and
  runners. xokolat needs the same idea with a **two-layer read**.
- `studio/server/launch.py` `build_job` — the whitelist that means *the browser never sends a command
  line*. Keep this property absolutely.
- `studio/server/runbooks.py` `FAMILIES` — the families-as-data pattern.
- `studio/server/engines.py` — declared vs actually-there vs caps, and the three failure modes.
- `runners/image-runner.py` — the render path, cutout, and the acceptance gates.
- `~/src/agent-skills/media/draw-things-grpc/` — the gRPC client and its `.proto`. **The one place
  worth reading closely rather than re-inventing:** the request shape, the LoRA MetadataOverride, and
  the uncompressed-float16 pixel decode. Python's numpy made that decode a line; in TypeScript it is
  a `DataView` and a half-float conversion. This is the accepted cost of the language choice.
- `tests/` — golden payloads (`payloads.py`, `golden.json`) as the regression net for builders.

### Repo structure

```
xokolat/
  PLAN.md          this file — the premise
  CLAUDE.md        the standing rules
  package.json     + package-lock.json (committed); npm ci, never npm install, in CI
  tsconfig.json
  src/
    paths.ts       the THREE ROOTS, and the only module that computes a path (§15 rule 2)
    validate.ts    the hand-written guard primitives every registry is checked with (§14)
    inference/       adapters (draw-things, comfyui, openai-compatible) + the registry + caps
                   + the ONE supervisor implementing the four launch modes (§13)
    styles/        the two-layer style read
    provenance/    the XMP carrier — write the record in, read it back out (§4)
    builders/      one module per generation type: schema · prompt · gates · registry row
    server/        HTTP + jobs + the launch whitelist, one module per concern
    workers/       recycled child processes (tier-2 cutout, if ever built — §13)
    types/         the shapes shared with the browser (.d.ts)
  styles/          SHIPPED styles (thin), read as layer 1 of 2
  registries/      SHIPPED inference rows, same two-layer read — layer 2 is <app data>/registries/
  scripts/         check.ts — what `npm run check` runs (§14)
  web/             the lifted UI — vanilla JS, no build step, NOT TypeScript
  tests/           golden payloads + unit tests, run by node:test
  docs/            the bundle contracts, as they get written
```

**~~Two-layer style read from the first commit.~~** Wrong twice, and both corrections are in
DECISIONS.md. The `xk:`/`user:` namespace went on 2026-08-04 — it meant forking a style before you
could edit it, in a local app where everything is the one user's. The shipped `styles/` directory
went on 2026-08-16: **the app ships no styles at all**. There is ONE style list, in app data
(`~/Library/Application Support/xokolat` on macOS, XDG elsewhere), it starts empty, and it fills
from the library through ⤓ or from ✨ xoko.

**Never hardcode a repo path.** The factory's `~/content-factory` assumption is exactly what makes
it un-shippable; the app has an app-data dir and a content dir, both resolved once.

**Three roots, resolved in one module, and nothing else may compute a path:**

| root | default | holds | user-configurable |
|---|---|---|---|
| **app data** | `~/Library/Application Support/xokolat` (`%APPDATA%` on Windows, XDG on Linux) | your styles, the inference registry, stars, the index cache, provisioned models | **no** |
| **content** — *the library* | `~/Documents/xokolat` | generated bundles and media runs | **yes**, 📁 section |
| **install** | the repo (dev) or `<data>/versions/<v>/`, where `npx xokolat` copies itself (shipped) | `web/`, the service rows, the kinds registry, code — **treat as read-only**, and it holds nothing runnable (DECISIONS 2026-08-16) | no |

⚠️ **App data and the library are DIFFERENT KINDS OF THING and do not share a folder.** App data is
state the app manages and the user never opens. The library is *the user's work*. `~/Library` is
hidden in Finder, is not where anyone looks for their own files, and is not what people expect their
backups to cover. The library defaulted under app data once, and the symptom was a reveal button
opening a folder nobody could have found (DECISIONS.md). Draw Things has the same problem for the
same reason; it is not a model to copy.

Not `~/Pictures`, even though images come first: this app also makes songs, voice, 3D and PDFs, and
one bundle split across `~/Pictures`, `~/Music` and `~/Movies` stops being a bundle.

**The library is a SETTING, not an install-time question.** Ship a good default, show the path in
plain sight with a button that opens it, let it be changed in the 📁 section. A first-run "where
would you like your files?" modal is a tax collected in the first minute, before anyone knows what
the app makes or how big it gets — Photos, Music, VS Code, Ollama and LM Studio all default-and-let-
you-change, and the one app that asks up front is the one everybody remembers hating.

Three rules the setting carries, each of them load-bearing:

- **ONE library, never several.** Lightroom-style "which catalog?" is where a configurable path gets
  genuinely expensive: every feature after it grows a "which one?" question. Refuse *N* roots, not a
  configurable one.
- **Changing it NEVER moves files.** New work goes to the new place; the old library stays where it
  is and stays readable by pointing the setting back at it. An app that moves gigabytes because
  someone clicked a folder is an app nobody trusts twice.
- **`~` and `/` are refused.** Everything under the library is served over `/content/…` and this app
  is reachable over a tailnet, so pointing it at the home directory would publish the whole home
  directory. So is anything inside the install root — an update replaces that folder and a packaged
  app cannot write to it.

**The library is created eagerly at startup, and a failure there is not fatal.** A chosen path can
stop being valid — an unmounted drive, a renamed folder, an offline share — and an app that refuses
to start is an app whose settings the user cannot reach. It starts, says exactly what is wrong, and
the 📁 section is where they fix it.

An env override (`XOKOLAT_CONTENT`, `XOKOLAT_DATA`) makes a dev machine point them anywhere and
**wins over the setting** — with the UI saying it is locked rather than silently dropping what the
user picked.

**The app's own port is stable, not probed** — default `18080` (**not** 8787: content-factory's
studio already answers there and the two are meant to run side by side), `XOKOLAT_PORT` to override,
and if it
is taken **fail with a clear message rather than quietly moving.** This is the deliberate opposite of
§13.5's rule for service ports, and the reason is the difference between them: a service port is an
implementation detail nobody types, while the app's port is a **URL the user has bookmarked and
added to their phone's home screen**. Silently relocating that is worse than refusing to start.

---

## 10. Conventions

- **Direct to `main`, no branches.** Commit after each meaningful change; don't ask first.
- **The user does all browser testing.** Report what changed and what needs a refresh or a restart;
  don't drive a browser to verify.
- **Contracts in prose, validators in code.** A bundle format gets a written contract *and* a
  machine check; where they disagree, the code wins and the prose gets fixed.
- **Don't defer deduplication.** If two builders need the same logic, it moves to shared code in the
  same change that spots it.
- **Registry-as-data over code branches.** If a change requires an endpoint *and* front-end code
  *and* a server branch, it's probably a data row you haven't found yet.

---

## 11. Resolved, and still open

**Resolved 2026-08-02:**

- **First adapter: Draw Things gRPC.** ComfyUI immediately after, in Phase 1.
- **Seeded thin = a handful of generic entries** for the shipped artifact lexicon and style list.
  Start simpler; the editor is what matters.
- **Exports: LINE in Phase 2** (the sticker pack's own), **KDP in Phase 3** with the coloring book
  that feeds it — see §8.
- **One builder first** — the sticker pack, written as the template the rest copy.
- **TypeScript on Node**, front end lifted unchanged as vanilla JS (§3.13, §14).
- **No desktop wrapper** — the person's browser is the window, `npx xokolat` serves every OS,
  and Node 26 is the requirement (Phase 4, DECISIONS 2026-10-05).
- **The cutout is in-house and tiered** (§13), so `onnxruntime-node` may never ship.

**Resolved in the first cold review (same day) — the answers a builder needed:**

- **Provenance is embedded in the file, not a sidecar** (§4). Carrier is **XMP**, because `sharp`
  cannot write PNG text chunks and our masters are `.webp` anyway — so A1111 interop was never
  available and the goal is *self-describing to us, best-effort to others*. **Exports strip it.**
- **The index is a derived cache** (§9): persisted, incremental by mtime, full rebuild explicit —
  the cost of embedding.
- **Tags:** asset-level in the embedded record, bundle-level in the bundle manifest (§6).
- **`caps` has a shape** (§4), and a row without one is treated as **minimal, not permissive**.
- **The request is `{ medium, text, style, inference[], refs[], count, params }`** (§4) — `style`,
  matching layer 3 of the classification since 2026-08-04. It was `preset` while that layer was
  called `palette`, a word that had three referents.
- **Structured output is a declared cap, and the app validates anyway** — two retries with the error
  fed back, then honest failure (§4). This is what makes a small local model viable.
- **`params` violating `caps` is rejected, never silently clamped**; `count` > 1 against
  `batch: false` loops serially with N seeds (§4).
- **Registries validate with hand-written type guards** — no `ajv`, which would break the
  five-dependency rule on day one (§14).
- **Jobs can be cancelled** (kill the process group, not the parent) and **a restart never resumes**
  — in-flight work is marked `interrupted` (§4).
- **The app's own port is stable at 18080 and fails loudly if taken** (§9) — the deliberate opposite
  of §13.5, because a service port is an implementation detail and this one is a bookmarked URL.
- **One registry row schema**: `tiers` is an optional field, and `builtin` is a fourth launch mode
  (§13).

**Still open:**

- **Whether bundled inference ever happens, and via what** — see §12. Not a Phase 0–3 concern.
- **A licence for the repo.** Not blocking, but it is a product, so decide before anyone else sees
  the code.
- **Whether the Draw Things `gRPCServerCLI` binary may be redistributed** (§12) — unchecked, and the
  likely answer is to download it on first run rather than bundle it.

**Resolved in the third cold review:**

- **`src/types/` is the contract from commit 1**; this document is a rationale sidecar. See *How to
  read this* — the structural answer to why three review rounds kept finding stale prose.
- **`params` is per-service** (`inference: [{ id, params? }]`) with a top-level shared default (§4).
- **One press is one RUN, minted server-side**; N service jobs reference the run id (§4).
- **"Lift near-verbatim" is false for the launch path** — layout and gallery are lifted, payload
  builders are rewritten to §4's shape (§9).
- **Tags are produced by the same schema call as the subjects**, so provenance is written once —
  `sharp` cannot write metadata in place, and a second pass re-encodes the pixels (§6).
- **Bundle subjects do not project into `manifest.media`** — a candidate set belongs to a subject,
  not to a group (§4).
- **LINE ships in Phase 2, KDP in Phase 3** with the coloring book that feeds it (§8).
- Media-run files are `NN.webp`; the canary probe is temp-only and never indexed.

**PHASE 0 IS BUILT (2026-08-03).** Its gate — one prompt renders an image into a run folder, it
appears in the gallery with its provenance chip, and it can be rated — is met, against Draw
Things gRPC in `external` mode. Everything after it is addition, not rework.

**Verified in Phase 0 — facts, not plans, and each has a test:**

- **`sharp.withXmp()` round-trips byte-identically through `.webp` AND `.png`**, non-ASCII and XML
  metacharacters included, and re-encoding strips it — which is exactly the mechanism the export
  gate needs. The provenance design (§4) rests on this and it now has `tests/provenance-xmp.test.ts`
  under it. Carrier detail settled: ONE JSON payload in one property under
  `https://xoko.lat/ns/provenance/1.0/`, read back with a regex and `JSON.parse` — no parser, no
  sixth dependency.
- **Node runs the TypeScript** — `tsx` is not a dependency (§14).
- **The two-layer read is namespaced by LAYER**: a shipped preset is `xk:<slug>`, a user's is
  `user:<slug>`, so an imported slug cannot collide with a built-in. The inference registry uses the
  same two layers, but a user row REPLACES a shipped row of the same id whole — a half-overridden
  `caps` is a capability nobody declared.
- **The Draw Things `.proto` must carry NO `package` declaration.** The package name is part of
  the gRPC method path and the server serves `/ImageGenerationService/Echo`; a package there is a
  `12 UNIMPLEMENTED` against a server that is running perfectly. The file in `src/inference/
  draw-things/` is written, not copied — only the messages we speak, so no third-party file with
  its own licence lands in this repo.
- **The FlatBuffer `configuration` is hand-written** (`src/inference/draw-things/flatbuffer.ts`),
  so `flatbuffers` is not a sixth dependency, and the bytes were checked once against the
  reference reader. The trap it exists to survive: **a field equal to its schema default is not
  written at all**, so `resolution_dependent_shift` (default `true`) has to say `false` out loud
  for a non-flux model, and SDXL's micro-conditioning sizes default to 0 — which is what makes an
  SDXL render look washed out.
- **`InferenceRow` gained `defaults`** — the working default behind the 🔌 band, as data.
- **A media run's cell is ONE ASSET, not one service folder.** `count: 3` puts three masters in
  one service folder and they are three cells, so a cell's `path` is the master's own path. That
  is also the rating key: `<medium>:<content-relative master path>`.
- **The lifted `shell.js` is the layout, not the file.** The factory's is wired to a dozen
  endpoints that do not exist here (agents, options, runbooks, publish); its DOM ids, classes,
  band discipline and mobile panes are kept exactly, so the remaining sections lift onto it in
  Phase 3 without a layout rewrite. `app.css` and `gallery.js` ARE verbatim and must stay
  diffable against the factory's copies.

**Deliberately NOT decided here** — and this list is as load-bearing as the ones above, because a
document that answers everything invites a builder to stop thinking. **A builder chooses these, in
code, at the time:** the HTTP route layout, the job-record shape, how prompt templates are stored,
the exact XMP field names, log format, how the queue is persisted, error-message wording, the shape
of anything internal to one builder. **Silence here is delegation, not omission.** The plan
constrains *what must be true* — a shape crossing a boundary, a rule that stops a silent failure —
and nothing else.

---

## 12. "Can we bundle the service instead of making the user install it?"

Asked 2026-08-02 about both ComfyUI and Draw Things. The answer differs per service, and the reason
it differs is worth keeping.

**ComfyUI is not a wrapper around an inference library — it *is* the inference implementation.**
Underneath it is PyTorch plus ComfyUI's own model-loading, sampler, scheduler and memory-management
code (its `comfy/` package), which is why it competes with `diffusers` rather than sitting on it.
So "use ComfyUI's wrapper without installing ComfyUI" resolves to *"vendor torch + ComfyUI's core
into the app"* — several GB, per-platform GPU wheels, and someone else's fast-moving codebase inside
yours. That is exactly the bundled-inference cost §3.4 defers, arrived at by a different road.

If bundled inference is ever wanted, the honest candidates are **`diffusers`** (cross-platform,
torch, the standard) or **`mflux` / MLX** (macOS only, far smaller and faster on Apple silicon) —
not "ComfyUI's wrapper". Decide it then, on evidence.

**Draw Things is a different case, and the separation is already demonstrated.** It does not use
PyTorch at all — Swift + Metal on its own runtime — and the headless server is a **first-party
standalone binary, `gRPCServerCLI-macOS`**, downloaded independently of the GUI app. On the
operator's machine it already runs that way: the binary lives in the `draw-things-grpc` skill's
`bin/`, is pointed at the Draw Things app's `Models/` directory (so it sees every downloaded model
with no copying), and serves gRPC on `127.0.0.1:7859`. No Python runtime, no wheels, one native
binary. So "ship the server, skip the app" is not speculation — it is how this works today.

⚠️ **Still unverified: redistribution.** *Separately downloadable* is not the same as *legal to
bundle inside a third-party app*. Check the license before assuming it, and note it would be
macOS-only, which cuts against §3.5. The likely v1 answer is neither bundling nor requiring the GUI
app: **download the first-party binary on first run**, the way the factory's skill already does.
That keeps the install honest and sidesteps redistribution entirely.

**The strategic point, which is why none of this needs deciding now:** an adapter talks HTTP/gRPC to
an endpoint. Whether that endpoint was installed by the user, launched by the app, or bundled inside
it is a **packaging** decision that changes no application code. Keeping the adapter boundary clean
is what buys the right to answer this later, per service, with evidence instead of a guess.

*(Note on what an adapter actually does: ComfyUI's API takes a whole workflow **graph** as JSON, so
the adapter's real work is owning workflow templates and filling their slots — not talking to the
HTTP endpoint, which is trivial. Draw Things' gRPC takes flat parameters. Budget accordingly: the
ComfyUI adapter is the bigger of the two, and its cost is template curation.)*

---

## 13. Inference rows are SERVICES, not subprocesses

The factory does not "connect to Draw Things". Every inference service on the operator's machine is a
**custom Homebrew service** someone had to write and debug — `draw-things-grpc`, `rembg-daemon`,
`comfyui-dev` — each a formula plus a supervisor script, running as a **user** launch agent.

**This is product surface, not setup.** For a stranger, "is the service running, and how do I make it
run" *is* the first-run experience, and getting it wrong produces silent failures rather than
errors. Read these before writing the first adapter (the operator's own orchestration, at the
repo root and never shipped; formulas install from the `xokolat/local` tap):

- `private/_brew-service-drawthings-grpc/` — formula + `service-runner.sh`
- `private/_brew-service-rembg/` — formula + supervisor loop

### The five things they already learned

**1. On macOS the GPU service must live in the logged-in GUI session.** Draw Things' Metal path needs
a WindowServer context. Run it as a *user* `brew services` agent and it works; run it as a system
LaunchDaemon, under `sudo`, or **spawned from the app server's own process tree**, and it renders
**pure colorful static and exits 0**. A silent, successful-looking wrong answer — the worst failure
mode there is, and one no health check catches. Consequence for xokolat: **the app must not assume
it can just spawn its service.** On macOS it installs/uses a user launch agent and *talks* to it.

**2. Health is a plain TCP probe, and must not go through the service's own queue.** Draw Things'
`--echo-on-queue` deadlocks it (the queue blocks in the echo handler and no render ever runs). A
liveness check that shares a lane with the work is not a liveness check.

**3. Lifecycle requirements are per-service, so they belong in the registry.** A CPU service
(onnxruntime, no GPU context) needs no GUI session; Draw Things does. That difference has to be
*declared* alongside `caps`, exactly the way capabilities are — never inferred, never assumed
uniform.

**4. Some workloads leak and need recycling.** `rembg`'s onnxruntime CPU arena grows with every
cutout and never returns memory: left up for days it creeps from ~1.5 GB to many GB. The factory's
answer is a supervisor loop that recycles the process past an RSS cap (~3 GB), with clients falling
back to the one-shot CLI during the ~10 s window — so the daemon is an **accelerator, never a
dependency**.

⚠️ **This lesson survives the move to TypeScript — do not assume it dissolves.** The arena growth is
a property of **onnxruntime**, not of Python, so an in-process `onnxruntime-node` cutout would leak
inside the app's own server, where it cannot be recycled without restarting the app. **So whenever an
ONNX model runs, it runs in a recycled child worker** (`src/workers/`) with the same RSS cap. See
the tiering below — in v1 that path may not be built at all.

**5. Ports collide, so never hardcode them.** The factory's map is draw-things-grpc `7859` · ComfyUI
`8188` · rembg `7000` · draw-things flux daemon `8189` · Ollama `11434`. Note `7000` is **also
macOS AirPlay Receiver** (Control Center holds it on this very machine) — the kind of conflict a
stranger hits on day one and reads as "the app is broken". Ports are configurable, probed, and
reported.

### Take the knowledge, reject the mechanism

**The factory's five lessons are right. Its *mechanism* must not be copied.** Those `.rb` files
have `url "file:///dev/null"` and a no-op `install` block — that is not Homebrew packaging, it is
**Homebrew as a launchd wrapper**: a sharp move on one machine, unshippable on a stranger's (brew
implies Xcode CLT, and many users have neither). Every path in them is one person's home folder. And the
control plane lives *outside* the app — `brew services restart` in a terminal, SwiftBar in the menu
bar — so the app can only ever report a broken service, never fix one. *"Run this command in
Terminal"* is exactly where a non-technical user stops.

The deeper problem: **the hard-won knowledge is in bash comments.** Excellent documentation, but not
*executable* — nothing enforces it, no test covers it, and service number three gets a third bespoke
script that has to re-learn all of it.

*(None of this is a criticism of content-factory, and nothing here should be retrofitted to it:
one machine, brew already present, SwiftBar for menu-bar control — `brew services` is the right
answer there.)*

### The design: supervision policy is DATA, and the app owns ONE supervisor

The same move that worked everywhere else — families as data, caps declared not inferred. A service
row gains a **launch policy**, and each mode is implemented **once, correctly**:

| mode | means | used by |
|---|---|---|
| `external` | the app never manages it, it points at an endpoint | ComfyUI, Ollama, anything already running — **the default** |
| `child` | the app spawns and supervises it directly | in-house workers and most CPU helpers |
| `user-agent` | the app installs a launchd **user** agent; never a child of the app server | Draw Things on macOS — §13.1 as a *value*, not a comment |
| `builtin` | the app itself does it — nothing to install, nothing to start, never missing | the tier-1 cutout |

Sketch (the shape, not the final schema):

```jsonc
{
  "id": "draw-things-grpc", "medium": "image",
  "transport": { "kind": "grpc", "host": "127.0.0.1", "port": "auto" },
  "launch":  { "mode": "user-agent", "binary": "gRPCServerCLI-macOS",
               "args": ["{models_dir}", "--address", "127.0.0.1", "--port", "{port}",
                        "--no-tls", "--no-response-compression", "--model-browser"],
               "provision": { "kind": "download", "url": "…", "sha256": "…" } },
  "health":  { "kind": "tcp", "timeoutMs": 500 },     // never through the work queue (§13.2)
  "canary":  { "kind": "render-noise-check" },        // see below
  "caps":    { /* §4 — negatives · idiom · words · resolution · stepsLocked · refs · batch */ }
}
// the cutout, for contrast — an OPERATOR, in-house, never picked per run.
// SAME schema: `tiers` is an optional field, not a second row shape.
{ "id": "cutout", "role": "operator",
  "tiers": [
    { "id": "flood-fill", "launch": { "mode": "builtin" } },          // always there, no download
    { "id": "onnx", "launch": { "mode": "child", "entry": "src/workers/cutout.ts" },
      "supervise": { "maxRssMb": 3000, "onCap": "recycle" },          // the leak (§13.4)
      "provision": { "kind": "download", "what": "onnx model", "sha256": "…" } } ] }
```

**One row schema, not two.** `tiers` is an *optional field*: absent, the row's own
`launch`/`health`/`provision` apply; present, each tier carries its own and the row resolves to the
best available. The shelf renders one row either way and names the active tier — so "registry as
data" keeps paying, and nothing branches beyond *does this row have tiers*. `mode: "builtin"` is the
fourth launch mode — the app itself does the work, nothing to install, never missing — and it is
useful well beyond the cutout.

The platform-specific surface collapses to **one mode on one OS**: `user-agent` exists because of
macOS's WindowServer requirement; Linux and Windows use `child`. `builtin` is platform-free.

Four things this buys that the factory cannot:

- **`external` is the default, and that is strictly better.** The factory manages everything; the app
  should **connect first, manage optionally**. A user already running ComfyUI must never have the app
  fight their setup — and it is the same code path, not a fork.
- **Ports are probed, not declared.** For services the app starts, take a free port at launch. That
  kills the `:7000`/AirPlay class of bug outright — impossible in the factory, where the port is
  baked into two scripts.
- **"Not installed" gets a fix button.** `provision` is a declared step: download the first-party
  binary, verify the hash, mark it ready. Today a human did that by hand into a skill's `bin/`.
- **Service logs land in the ▶ queue band** beside the job logs. One status surface — already the rule
  for jobs, now true for services.

### Shelf vs picker: `role: generator | operator`

The 🔌 section answers two questions that look like one:

1. *What can I choose to generate with?* → the **picker** (the service band, per run)
2. *What does this app depend on, and is it actually there?* → the **shelf** (the registry view)

Most services answer both. Some answer only the second: you never *pick* a background remover at
launch — the builder invokes it — but you very much need to know whether its model downloaded,
whether it failed, and what happens when it does. So a service declares:

```
role: "generator" | "operator"
```

**Operators appear in the shelf and are filtered out of the picker.** That is the whole mechanism —
one field and one filter, no new layer. The factory already drew this line ("it is the SHELF, not
the picker"); `role` just makes it a value instead of a convention.

**Consequence: the section is called 🔌 inference, not "ai engines".** A flood-fill is not AI, and
neither is ffmpeg — but both answer the shelf's real question. The honest name for that question is
*what does this app need in order to work, and is it there?*

**And this is not a special case.** ffmpeg becomes the second operator the moment audio stitching or
video needs it: an installed binary, a genuine "is it there", no model, never a per-run choice —
same row shape, same three failure modes.

**The boundary, so `operator` doesn't become a dumping ground:** something earns a row only if it has
an **install or running state a user could be asked to fix**. Pure code never does — the LINE zip
writer, the KDP PDF composer, the resize step are Exports and stay invisible. The test is *"could
this be missing?"*, not *"is this a transform?"*. ARCHITECTURE.md's rule holds unchanged — a service
made it → Asset, code composed it → Export — and `role` only separates the services you *choose* from
the services you merely *depend on*.

### The cutout: two tiers, one row

**Rejected: routing the cutout through ComfyUI.** Background removal is **not a ComfyUI core node** —
it is a custom node pack (the operator's box has `ComfyUI_BiRefNet_ll`). Depending on it means
depending on a node pack the user installs by hand, which is the exact failure this app exists to
remove, and it would make ComfyUI a hard requirement for stickers when Draw Things is the Phase 0–1
service. The decisive evidence is the factory itself: it runs ComfyUI, *has* that node installed, and
still built a separate rembg service for the cutout.

**Tier 1 — algorithmic, and the default.** The sticker builder writes its own framing words, so it
controls the background: render on a flat, uniform one and the cutout becomes a **border flood-fill**
— take the connected near-background region starting from the image edges and make it transparent.

The critical detail is **connected**: fill from the border, never a global colour threshold. White
*inside* the subject (an eye, a highlight) survives because it isn't connected to the edge. That is
the objection this technique normally dies on, and it is answerable. Needs edge feathering rather
than a hard threshold, or anti-aliased pixels leave a halo.

For flat vector-style sticker art this is competitive with BiRefNet, and it costs **zero
dependencies** — `sharp` is already in the stack. Where it loses: soft or hair-like edges, painterly
styles, and a subject touching the frame.

**Tier 2 — an ONNX matting model, provisioned on demand**, in the recycled worker (§13.4).

**The gate decides which.** The sticker builder already has an acceptance gate (real transparent
pixels, subject not clipped). Tier 1 runs, the gate checks, and only a failure escalates — no new
machinery, just the gate the plan already requires doing one more job. The shelf row shows which tier
is live, so escalation is **visible and user-controllable** instead of a silent fallback:

> **cutout** · built-in (algorithmic) — always available
> *ML model not installed — download for cleaner edges on soft or painterly art*

**Net effect: `onnxruntime-node` probably does not ship in v1 at all**, which takes a native module
out of the Electron bundle and the dependency count from six to five (§14).

Two notes for whoever builds tier 2: **do not default to BiRefNet just because the factory did** — it
was optimising quality on a workstation with no packaging constraint, and for flat sticker art a much
smaller model (BRIA RMBG-1.4, isnet) is likely indistinguishable at a fraction of the download. And
`@imgly/background-removal-node` / transformers.js are convenience wrappers **over the same
onnxruntime**, so they do not reduce the real dependency — plus `@imgly`'s licence needs checking
before shipping.

**Watch, don't build: LayerDiffuse** generates genuine RGBA — transparency from the model, no cutout
at all. The theoretically correct answer, and unavailable to us: a ComfyUI custom node, not supported
by Draw Things. Revisit only if it lands in a service we already talk to.

### The canary — an answer to the silent failure

§13.1 is the scariest item here *because the health check passes*: TCP is up, the render returns,
exit 0, and the pixels are noise. So after starting an image service, render **a tiny fixed prompt at
minimum resolution** and check the result is not noise (a uniform-random image has a signature worth
a few lines of code). A few seconds once per service start, and it converts a silent wrong answer into
a named error with a fix — against the one failure mode that otherwise costs a whole night of
garbage.

**The probe is not an asset.** It goes to a temp path, is never written into the content root, never
indexed, never rated, and is deleted after the check. Only its outcome is kept, on the service's shelf
row.

### What NOT to build

No reimplementation of Homebrew. No general launchd/systemd/Windows-service abstraction. **Four
modes, one supervisor, declared per service** — and stop there.

### Three more consequences

- **Phase 1 owns service lifecycle**, not just service *config*: detect · provision · start/stop ·
  report honestly. The 🔌 shelf's three failure modes (server down · not installed · can't check)
  came from exactly this, and *can't check* must never be reported as *missing*.
- **A second service class the plan had not named: OPERATORS.** The die-cut cutout is a **gate
  dependency** of the sticker builder, so **Phase 2 needs it, not just Draw Things** — but it is
  in-house and tiered (above), never a tool the user installs. It keeps a shelf row anyway, because
  its state is something a user could be asked to fix.
- **Two Draw Things services are not interchangeable**, which is why `caps` exists: the flux daemon
  (`draw-things-cli`, HTTP `:8189`) has **no ControlNet/IP-Adapter**; the gRPC server (`:7859`) has
  the controls. Same vendor, different capabilities — declare them, never infer from the name.

---

## 14. Day one — the stack, and how to verify

### Stack decisions

**TypeScript on Node.** Not Bun, not Deno — native modules and Electron are Node-first, and this
project values boring over fast-moving.

**Pin the version, don't describe it.** `sharp` is a native module and Phase 4 is Electron, so the
Node version is a fact the repo states: a committed `.nvmrc` plus an `engines` field in
`package.json`. The dev box is on **v26.5.1 / npm 12.0.2** — pin to that major and move it
deliberately, never by whatever a machine happens to have.

| Need | Choice | Why |
|---|---|---|
| HTTP | `node:http` | Same stdlib-first discipline the factory proved. Add Hono only if routing genuinely earns it, and write down what forced it |
| Images | **`sharp`** (libvips) | Resize, WebP, alpha, compositing — faster and better than Pillow |
| Cutout | **`sharp` alone** — border flood-fill (§13) | Tier 1, the default. `onnxruntime-node` is tier 2, provisioned on demand, and may never ship |
| gRPC | `@grpc/grpc-js` + `@grpc/proto-loader` | **Pure JS, no native build** — easier to package than Python's `grpcio` |
| YAML | `yaml` | Bundle manifests, and the sidecar fallback for formats that cannot embed (Phase 3) |
| PDF | `pdf-lib` | KDP interiors |
| Tests | `node:test` (built in) | No jest, no vitest |
| Dev runner | **node itself** | Node 26 strips types natively (`node src/server/main.ts`) — **no build step in development, and no `tsx`.** Verified 2026-08-02; `tsconfig` sets `erasableSyntaxOnly` + `verbatimModuleSyntax`, which is what guarantees that if `npm run check` passes, node can run it. Relative imports carry the `.ts` extension because the stripper does not resolve |

**That is five RUNTIME dependencies** — `sharp`, `@grpc/grpc-js`, `@grpc/proto-loader`, `yaml`,
`pdf-lib`. The other rows are not dependencies: `node:http` and `node:test` are stdlib, node runs
the TypeScript itself, and `typescript` + `@types/node` are devDependencies, counted separately and
never shipped. **Five is the number to defend** (§15), and `onnxruntime-node` only joins it if a
real style fails the tier-1 gate. *(Only `sharp` is installed so far — the other four arrive with
the phase that needs them.)*

Everything else holds as before:

- **No build step, no framework, no bundler on the front end.** ES modules served as files, exactly
  as lifted (§9). The UI is **not** TypeScript.
- **No database.** The filesystem is the state, behind a resolved app-data path, never a hardcoded
  repo path.
- **`Cache-Control: no-cache` on everything the server serves.** A regenerated master keeps its path,
  and with only `Last-Modified` a browser will serve the stale image for hours. Learned the hard way;
  costs a bodyless 304.

### How to verify before committing

`npm run check` is the first script in the repo — it is what makes "commit after each change" safe
without a browser:

- `tsc --noEmit` — the type check *is* most of the old smoke test
- `node --check` every front-end module (syntax only — no runtime, no browser)
- JSON parse every style / registry file and validate each against its shape with
  **hand-written type guards — no validator package.** ~10 registry shapes do not justify `ajv`,
  and reaching for it would break the five-dependency rule (§15) on day one.
- `node --test` — golden payloads plus per-module tests

**The user does all browser testing** (§10). `npm run check` stands in for it on the server side, so
it must stay fast enough to run every time — which means **it never touches the network.**
`npm audit --omit=dev` is therefore a *separate* script (`npm run audit`), run when dependencies
change rather than on every commit.

### The first three commits, in order

1. **Skeleton + the TYPES** — npm project + `tsconfig`, `npm run check`, a `node:http` server serving
   a static page, the three path roots, and an empty inference registry. **`src/types/` lands here** —
   request, caps, inference row, provenance, manifest — because from this commit they are the contract
   and this document is the sidecar (see *How to read this*). Nothing generates anything yet.
   **Also verify `sharp.withXmp()` here**, in five minutes: the whole provenance design (§4) rests on
   it, and finding out in commit 3 would be finding out too late.
2. **One service, `external` mode** — the Draw Things gRPC adapter against the already-running server,
   a TCP health probe, and an `/api/inference` that honestly reports the three failure modes.
3. **One render, end to end** — the serial job lane, a request (§4), a run folder whose master
   carries its embedded provenance (§4), the lifted gallery showing it, and ★ on the cell.

That third commit is Phase 0's gate. Everything after it is addition, not rework.

---

## 15. Security, and what keeps packaging possible

The threat model is narrow — one user, their own machine, localhost or a tailnet, no auth by
decision (§3.15). It is not zero, and **three rules are the actual security architecture.** They are
language-independent; none of them is optional.

**1. The browser never sends a command line.** Every launch goes through a server-side whitelist of
preset values, which is then turned into an argv array. content-factory's `build_job` is the
reference implementation and this property must survive the rewrite intact.

**2. Every path is resolved against a root before it is written.** No bundle, asset, export or
provisioned-download path is ever trusted — *least of all one an LLM produced.* A model that names a
file is a model that can name `../../`. Resolve, verify the prefix, then write.

**3. The dependency tree stays small and locked.** This is the one place Node is genuinely weaker
than Python: npm's culture of tiny transitive packages and install scripts is a larger attack
surface, and a rich stdlib is not there to save you. So:

- **Five direct dependencies** (§14). Every addition is justified **in writing**, in the commit that
  adds it.
- `npm ci` against a committed lockfile — never `npm install` in an automated path.
- `--ignore-scripts` wherever a package doesn't genuinely need a postinstall.
- `npm run audit` (`npm audit --omit=dev`) when dependencies change — kept out of `npm run check`,
  which must never need the network (§14).
- Prefer a stdlib module over a package, every time.

Also: **never spawn through a shell.** Argv arrays only — service launches, exports, workers, all of
it. And when Electron arrives (Phase 4): `contextIsolation: true`, `nodeIntegration: false`, local
pages only. Misconfigured Electron is a real vulnerability class; configured correctly it is fine.

### The same rules keep packaging cheap

Rule 3 is not only a security rule — it is what makes Phase 4 tractable. Two more constraints belong
with it, both decided in code long before packaging exists:

- **All heavy work stays out-of-process.** Already true by design (§3.4): no inference in the app
  process, so the shipped bundle carries no model weights and no GPU runtime.
- **Anything optional and heavy is `provision`ed, never a dependency.** The cutout model is
  downloaded on demand and hash-verified. Bundling it would tax every user who never makes a sticker,
  and *requiring the user to install it* is precisely the failure this app exists to remove.
- **Never assume a writable install directory.** App-data only — which is also what lets a read-only
  signed `.app` work at all.
