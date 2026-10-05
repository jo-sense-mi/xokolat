# xokolat

**Read `PLAN.md` first, in full, before writing any code.** It is the entire context for this
project — the product definition, the decisions already made (with their reasons), the architecture,
the phases, and what to port from where. Nothing else in this repo assumes you have read anything
else.

⚠️ **From commit 1, `src/types/` is the contract and `PLAN.md` is a rationale sidecar.** Where a type
and the prose disagree, **the type wins and the prose gets fixed** — then say so in the commit. Every
shape (request, caps, inference row, provenance, manifest) lives in `src/types/`, never in prose.

⚠️ **Two words, and they are not interchangeable.** **Inference** is a SERVICE that runs — Draw
Things, ComfyUI, Ollama, a cutout daemon; it has an install/running state. An **engine** is what a
service can be ASKED FOR — a checkpoint, or a capability that is not one (a background remover); it
has facts and knobs, never a running state. Two registry levels, two sections (🔌 and 🧩), both
under settings. The provenance record and the `params.model` knob keep the word `model` on purpose:
they speak to readers outside this app.

⚠️ **Three nouns and five verbs, and the count of each is fixed (PLAN §4a).** `asset` = one produced
file. `composition` = a named thing with member assets and typed references — a mascot, a pack, a
deck, all the same shape. `style` = reusable settings, living with the section that uses them, never
in a central registry. The verbs are **generate · transform · compose · assemble · export**; growth
happens in a verb's vocabulary, never in the list. `asset` never means "a reusable named thing" —
that is a composition, and two meanings for one word is the `engines`/`inference` mistake again.

**Then read `DECISIONS.md`** — what we changed our minds about *after* building, newest first. It is
short. Where it and `PLAN.md` disagree it is newer, and the fix is to correct `PLAN.md` in the same
change rather than leave two answers standing. Add an entry only when the code alone would not
explain why; a refactor does not need one.

`NEXT.md` is **the only file that says what is not built yet** — the ordered list, the map of every
intent a person brings to a medium and what each is blocked on, and a short tail of what landed and
why it matters to what is left. It replaced `NEXTSTEPS.md`, `PLAN_Aug12.md` and `CAPABILITIES.md` on
2026-08-12, which had become three answers to one question. It is not a gate, and it is deleted from
as things land rather than annotated.

## How the app is shaped — LEGO, and PROTEINS

Two nouns, and everything else follows from the difference between them.

**A MEDIUM is a piece.** A lego brick. An amino acid. One master on disk, one cell in a feed, one
thing you can attach to something else. There are seven: `image` `music` `sound` `voice` `video`
`vector` `model3d`.

**A COMPOSITION is a build.** The thing made out of pieces: a protein, not an amino acid. It is a
PROCESS — several presses in an order, with the output of one feeding the next, a place where it
stops and asks you something, and a last step that writes what the whole chain was for.

⚠️ **THE TEST FOR A MEDIUM IS THE SENTENCE SOMEBODY SAYS.** "Make me an image." "Make me a song."
"Make me a voice." A medium is a UNIT OF CREATION — a thing a person asks for by name, on its own,
as the thing they wanted. That is the whole test, and it is a test about the person, not about the
code.

⚠️ **AND IT WAS GOT WRONG ONCE, WHICH IS WHY IT IS WRITTEN DOWN (2026-08-24).** For one day `book`
was a medium. The reasoning looked sound — a chain bound a PDF, the PDF had nowhere to land, so it
got a shelf — and it produced a castle filed in a box of bricks. Nobody asks for "a document". They
ask for a book, a comic, a zine, a portfolio, a photo book — every one of which is an ASSEMBLY of
images and words, which is to say a composition. One medium per assembly, forever, is exactly the
explosion a closed vocabulary exists to prevent. Renaming it `document` was the same mistake wearing
a more general word.

The real gap was never a missing medium. It was that **a composition had no run of its own**: a
chain was a browser-side macro that fired media presses and left no trace of itself, which is why
its result had nowhere to go. So:

- **What a chain produces belongs to the chain.** `builds/<composition>/<run>/`, browsed in that
  composition's own section — the object that made it and already has a name.
- **The pages stay media.** The pictures its steps drew are ordinary image runs on the image shelf,
  because those really are units of creation.
- **A comic, a zine, an album, a storyboard: all new compositions, zero new media, forever.**

Three more rules fall out of this and are worth stating on their own:

- **A workflow is ONE press.** One engine, one ask, one piece out. A different *graph* is a different
  workflow; a different *number* — steps, CFG, checkpoint — is a parameter, and every widget a workflow
  exposes must be settable. "These twelve, in this order, into one file" is not an ask anybody
  types, so binding is not a workflow: it is a `BindStep`, and it reaches no engine at all.
- **A build must be able to become a piece.** A protein is a subunit of something larger; a lego
  house can be a wing of a castle. This is about NESTING — a composition usable inside another
  composition — and it is not a licence to invent a medium for a chain's output. Reading it that
  way is what produced `book`.
- **Text is not a piece and never will be.** It is xoko. Written things are FIELDS on the asset they
  belong to — lyrics on the song, the script on the voice run, a caption on a bound page — never
  assets of their own. There is no 📝 shelf.

**The app owns the format; the library owns the content.** The app ships zero media, zero workflows,
zero compositions and zero styles: what a piece may BE and what a build may SAY are code here, and
every actual piece, workflow and chain arrives from 📚. That is the same split one level up — this
file describes the grammar, `xoko.lat` publishes the sentences.

## The one-line version

A local content-generation app (ComfyUI-shaped: a local server + browser UI) that hands the user a
**finished artifact** — a sticker pack, a coloring book, a mascot, a song — instead of a model or a
canvas. Domain: `xoko.lat`.

## Stack

**TypeScript on Node 26** for the server; `node:http` (no web framework until something concretely
requires one); `sharp`, `@grpc/grpc-js`, `@grpc/proto-loader`; `node:test`.
**Three direct dependencies is the number to defend.** (`yaml` and `pdf-lib` were on this line as a
plan and never landed; the PDF a book is bound into is ~120 lines of stdlib in
`src/builds/pdf.ts`, which is what rule 3 below asks for.) **No build step and no `tsx`** — node strips
types itself, so run `node src/server/main.ts` and write relative imports with a `.ts` extension.

**The front end is vanilla JavaScript, NOT TypeScript, with no build step and no framework** — it is
lifted from content-factory's studio and must stay that way. **No database**: the filesystem is the
state, behind resolved roots.

⚠️ **`tsc` does not see `web/`.** A rename that touches a request or response shape must be applied
to the payload builders in `web/lib/pipelines/` **by hand** — every check can pass while the app is
broken, and once did (DECISIONS.md, 2026-08-03). `tests/request-shape.test.ts` holds the request
side of that seam; anything new crossing it needs its own guard.

⚠️ **App data and the library are different kinds of thing.** App data
(`~/Library/Application Support/xokolat`) is state the app manages and the user never opens, and it
is **not** configurable. The **library** (`~/Documents/xokolat` by default) is the user's work —
visible, conventional, changeable in the 📁 section. One library never several; changing it never
moves files; `~` and `/` are refused because everything under it is served over `/content/…`. See
`PLAN.md` §9.

⚠️ **Masters are `.webp`, always** — lossy q92 by default, lossless when the library is set to it
(📁). One extension either way, so nothing downstream branches on the encoding. The encoder is read
from `provenance.quality` (a level NAME, not a boolean) so the record cannot disagree with the file. **PNG is a boundary format**
(clipboard, LINE, KDP), never a stored one. See `PLAN.md` §4.

Run `npm run check` before every commit. See `PLAN.md` §14.

⚠️ **After any server-side change, `npm run restart`** — not `npm start`. The app refuses to move
off its port (deliberately: it is a bookmark), so a running instance means the next `npm start`
fails, and the failure everyone actually hits is worse — a hard-refreshed browser talking to a
server still running the OLD code, which reads as a bug in the new one. `restart` stops the process
holding the port **only if it is ours** and names anything else rather than killing it;
`npm run stop` is the same check without the start.

**Dev is `http://127.0.0.1:18081`, never 18080.** `dev`, `restart` and `stop` read `.env.dev`:
port 18081, the local library on :8080, and their own folders
(`~/Library/Application Support/xokolat-dev`, `~/Documents/xokolat-dev`). 18080 and the real
folders belong to the delivered app — the zip, or `npm start`, which reads none of `.env.dev` — so
the two run side by side and share nothing.

## Security — the three rules (PLAN.md §15)

1. **The browser never sends a command line.** Server-side whitelist → argv array. Never a shell.
2. **Every path is resolved against a root before it is written** — least of all one an LLM produced.
3. **The dependency tree stays small and locked.** `npm ci`, justify every addition in the commit
   that adds it, prefer stdlib over a package.

## Standing rules

- **`~/content-factory` is a SEPARATE project — read it, borrow from it, never edit it and never
  depend on it.** It is the operator's private factory and the proving ground for this app. Same for
  `~/src/agent-skills` and `~/src/miraverse`.
- **The operator's content and curated taste stay in the factory.** Never copy `content/`,
  `ratings.json`, `published.json`, or their curated `palettes/styles.json` ★ / artifact-lexicon
  entries into this repo. See `PLAN.md` §2 and §5.
- **Direct to `main`, no branches.** Commit after each meaningful change without asking.
- **The user does all browser testing.** Report what changed and what needs a refresh; don't drive a
  browser to verify.
- **The browser never sends a command line.** Every launch goes through a server-side whitelist.
- **Registry-as-data over code branches.** If a change needs an endpoint *and* front-end code *and* a
  server branch, look for the data row you haven't found yet.
