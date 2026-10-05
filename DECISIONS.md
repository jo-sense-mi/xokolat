# Decisions

`PLAN.md` is what we intended before there was code. **This file is what we changed our minds about
after using it**, newest first, with the reason and what was rejected.

Read it after `PLAN.md`. If the two disagree the entry here is newer — and the fix is to correct
`PLAN.md` in the same change, not to leave two answers standing. (`src/types/` still wins over both:
the contract is code.)

An entry earns its place here only if **the code alone would not explain why**. A refactor does not
need one. "We built it, used it, and the shape was wrong" does.

---

## 2026-10-05 — One app on every OS: one zip, Node 26 required, the browser is the window

0.1.x shipped as a macOS `.dmg` holding a `.app` whose window was a Swift WKWebView. It worked, and
it could only ever exist for one OS: `swiftc`, `hdiutil`, Finder's AppleScript, `codesign`. The
operator wants xokolat reachable on any OS now, with native apps per OS only if there is traction.

The window was the only Mac-specific thing in it. Every pixel was already `web/` over 127.0.0.1,
and the server was already OS-neutral (reveal knew `explorer` and `xdg-open`, the data root knew
XDG). So `npm run package` (`scripts/package.ts`) writes **one** `out/xokolat-<v>.zip` — the app's
files, under a megabyte — and the person runs `npm start` or `npm run background`. Both go through
`scripts/launch.ts`, which runs `npm ci` first **once** — a marker in `node_modules` holds the
lockfile's hash, so a newer download over the same folder installs again and nothing else does.
That install fetches sharp's prebuilt for their own platform, the only per-OS thing the app has.
The default browser opens, and when the port is already held **by a xokolat** (`/api/status`
answers with an install id and its pid) it opens that instead of refusing. `background` detaches
the server with a log in app data; `npm run stop` finds it by `lsof`, or on Windows by asking
`/api/status` for its pid. Windows gained `%APPDATA%\xokolat` as its data root.

**Node 26 is a requirement for every user**, and that is the operator's call: the zip carries an
`.npmrc` with `engine-strict` (and `omit=dev`), so an older Node is refused by name at install.

**Rejected, the same day: six archives that carry their own Node.** Built and working — per target
nodejs.org's Node, `npm ci --os --cpu` for sharp, a double-click launcher per OS, a quarantine
workaround on macOS — at ~55 MB each, and six artifacts to publish for one app. With Node as a
requirement all of it is the user's `npm ci`. **Rejected: Electron** — a window again, ~100 MB of
Chromium per target, a signing story per OS. **Not yet: `npx xokolat`** — the nicest one-liner,
but Node will not strip types under `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`),
so it needs a small JS shim that runs the app from outside it. NEXT §17.

What was given up, knowingly: the app's own window, its Dock icon, ⌘Q, and double-clicking. Ctrl-C
in the terminal, or `npm run stop`, is how it is stopped.

## 2026-10-05 — The word is `workflow`. `recipe` is retired.

The 2026-08-14 entry below chose `recipe` for two reasons. Both stopped holding:

1. **The collision with ComfyUI's word turned out to be the point.** We since settled that a row
   *is* a graph — every widget settable, a checkpoint and a step count are parameters, never
   separate rows — and a downloaded ComfyUI workflow becomes one of these directly. So the two words
   named one object, and the word only this app used was ours. Nobody reading xoko.lat had met
   "recipe" anywhere else; everyone had met "workflow".
2. **The process-word is not left unnamed.** A chain is a `composition`, and that name stuck.
   "Workflow" for one press does not take anything the chain needs.

The rename is mechanical in both repos: the type (`src/types/workflow.ts`), the registry field
`recipes` → `workflows`, the provenance field `recipe` → `workflow`, the published format's
`"type":"recipe"` → `"type":"workflow"`, the site's `src/recipes/` → `src/workflows/`, the ask bar's
stored keys, CSS classes and UI strings. No migration (no backward compatibility): a user registry
still saying `recipes` is refused by name, which is how the validator says what to fix. Entries
below this one keep the old word — they are history.

**Rejected: keep `recipe` and explain it.** A word that needs a footnote on first contact costs
every new reader the same confusion, and the operator — who chose it — kept reaching for `workflow`.

## 2026-09-06 — ＋ connect asked three questions nobody installing a box could answer

Adding a service wanted an **id**, a **makes** and a **role** before it would take anything else.
All three are gone. Connecting Draw Things is now a name and an address.

**The id.** "lowercase words joined by dashes, e.g. `comfyui-local`" — a slug, invented by hand, for
a folder the person will never open. It is real: the id is the `<engine>` segment of every run
folder and the `provider` in a provenance record, so it must be stable and unique. Neither of those
requires a human to type it. `idFromName` (`src/inference/services.ts`) slugs the name, folds
accents, and uniquifies against shipped ids and yours, so a second *Draw Things* is `draw-things-2`
rather than a silent write into the first one's history.

It also plain failed. The preset picker pre-selects the first row and only its `change` handler
filled the id, so picking the option **already showing** left it empty — and Draw Things is the
first row. The bug and the field went together.

Derived in ONE place, server-side. A form computing its own id would be a second rule for the same
string, and the two would part company the first time either moved. A page sends a name and reads
back the id it got (`SaveResult.id`). An explicit id still wins: `▶ take:` and a hand-edited file
both name rows directly, and neither is typing into a form.

**`makes`.** One word for a whole service. A ComfyUI serves five media, so it had to leave the field
blank — and blank was then read as *answers for anything*: `!r.medium || r.medium === medium` picked
a ComfyUI holding nothing but image recipes to shoot a music swatch on, which then failed there. The
field is deleted from the row, not merely from the form. What a service makes is what its RECIPES
make — every recipe declares a `kind` and every kind names a medium — so `mediaOf(row, kinds)`
answers it, as a LIST, and follows what you take: one music recipe onto a ComfyUI and its card says
`image · music` with nothing edited.

The one place the old field did real work is the checkpoint ⚙ editor, which draws from
`knobsFor(medium)`. That takes `soleMedium` — the single medium if there is one, `null` otherwise —
because the union would put a tempo and a key on an SDXL checkpoint. `null` is what a ComfyUI has
always had there.

**`role`, and the retirement of `operator`.** The field survives; the word does not. `role` is
load-bearing for exactly one thing: `rows.find((r) => r.role === 'brain')` is the only way xoko's
connection is told apart from a renderer. That split is already on the screen — ✨ xoko thinks, 🔌
inference makes — and it is decided by which page you connected from, never typed.

`operator` meant *on the shelf, never in the picker; a builder calls this, you do not*. Nothing ever
declared it. rembg, the textbook case, ships as a generator, because taking a background out is a
thing people sit down to do. What it left behind was a dropdown whose second option could only hide
your new service from your own menu.

Its job was already done better one level down: a recipe declares `inputs`, so `klein-i2i` needs a
`ref` and is a generator. *"Would a person ask for this?"* was a taste call worn as a field; *"does
this need a file first?"* is a fact, and the fact is the one the app reads.

**The one thing that was hiding behind the word.** `checkRow` exempted operators from needing a
transport. The exemption is real — a builtin flood-fill is reached by calling it — but the role was
never what made it true. It is now stated as what it is: a row the app RUNS ITSELF needs no endpoint
(`builtin`, or `child` naming an in-repo `entry`). A `child` naming a binary still needs one, because
a program has to answer somewhere.

**Rejected:** keeping `makes` as a library-declarable field like `role`. `role` is not derivable —
it is a judgement — and `makes` is, exactly, from data the row already carries. A field that can be
computed and is instead declared is a field that will disagree with the computation.

## 2026-09-05 — what a `.dmg` actually contains, and the two things that are not obvious

`npm run package` (`scripts/package.sh`) makes `out/Xokolat.app` and `out/xokolat-<version>.dmg`.
67 MB, about half a minute, unsigned. It earns an entry here because two of its choices look like
gratuitous work until the day they are not, and both would be "simplified" away by anybody reading
only the script.

**It compiles nothing, and that is the point.** PLAN §Phase 4 named Electron + electron-builder,
which is the right answer for a normal Node app and the wrong one for this one: Electron pins its
own Node (behind ours), and this app has no build step because Node runs its TypeScript directly.
Packaging into Electron would mean adding `tsc` to satisfy the packager — a compile step introduced
by the *shipping* mechanism, so what ships is no longer what was tested. So the bundle is the same
files `npm start` reads, copied, with a runtime beside them. Electron stays available for the day
there is a reason to want a native window; there is not one yet.

**The Node binary is DOWNLOADED from nodejs.org, never copied from the build machine.** This is the
one that looks silly — there is a working `node` on the machine doing the packaging. It is a
Homebrew build, dynamically linked against Homebrew's own `icu4c`, `openssl`, `brotli` and `libuv`.
Copy that binary into a bundle and the app runs perfectly on the machine that built it and launches
on no other Mac in the world, with an error naming a dylib rather than anything to do with xokolat.
nodejs.org's `darwin-arm64` build carries its own copies. The version is read from `process.version`
so it tracks `engines` in package.json rather than being typed in a second place, and the tarball is
cached in `out/.cache` so only the first run pays for it.

**`npm ci --omit=dev` runs in the STAGING folder, not in the repo**, and the working tree's
`node_modules` is never copied. Two reasons, and the second is the one that bites. `--omit=dev`
keeps the type packages out of a bundle that has no compiler. And `sharp` resolves a *per-platform*
prebuilt binary at install time: the copy in your working tree is only guaranteed correct for the
machine and architecture that installed it, so inheriting it would ship whatever your last
`npm install` happened to fetch. Resolved fresh from the lockfile, on the packaging machine, for
darwin-arm64. (Verified on the first real bundle: sharp 0.35.3 with libvips 8.18.3 loading under the
downloaded runtime.)

**The launcher is a real binary, and the app has its own window** (`scripts/mac/main.swift`, ~200
lines, built by `swiftc` from the Command Line Tools — no Xcode project, no Apple account, nothing
added to package.json). It was a shell script that started the server and ran `open` on the URL,
which was wrong twice over: the app arrived as one more tab among forty, and a bundle whose
executable is a script has no Mach-O binary, therefore no menu bar, no ⌘Q, and no way to stop the
server short of Activity Monitor. A shortcut wearing an app's clothes.

It is still a WRAPPER and not a rewrite: it launches the same Node as a child process and points a
`WKWebView` at `127.0.0.1`, so every pixel is `web/` served by the same server the CLI runs, and
nothing in the app knows it is inside a window. WebKit is already on every Mac, so the window costs
about 100 KB rather than Electron's browser engine.

Four things in it are not decoration:

- **An Edit menu, or ⌘C and ⌘V do not work.** Those keystrokes are the responder chain finding
  standard selectors on a menu; with no Edit menu they silently fail in every text field in the app,
  and it reads as the app being broken rather than as a menu being missing.
- **`runOpenPanelWith`, or `<input type="file">` does nothing at all.** `WKWebView` has no file
  picker; the host app is expected to supply one. This app asks for a reference picture in half a
  dozen places.
- **Off-machine links open in the real browser.** A window with no back button is a poor place to
  end up on Hugging Face.
- **`reloadFromOrigin` for ⌘R**, not `reload` — the front end is versioned by a cache tag, and a
  plain reload can answer from the view's own cache, which is the state somebody presses ⌘R to
  escape.

**And the server dies with the window — including on a signal.** `applicationWillTerminate` covers
⌘Q, and that was all there was until a `pkill` during testing killed the window and left node
running, still holding the port. Since a launch ATTACHES to whatever already answers, the next launch
would have quietly connected to a server from a version no longer installed — an hour of chasing a
bug that is not there. `SIGTERM`, `SIGINT` and `SIGHUP` now go through a `DispatchSourceSignal` that
stops the child first (`SIGTERM`, a second and a half, then `SIGKILL`). Force Quit is the one case
nothing can cover, because SIGKILL runs no code; fixing that needs the server to watch for its parent
going away, which is a change to the app rather than to its wrapper.

**The disk image is laid out, and that is not decoration — it is the install.** `hdiutil create
-srcfolder Xokolat.app` makes an image holding one icon and nothing to drag it TO. The operator
mounted it, launched the app off the volume, and reasonably concluded it had not installed: it had
not. `/Applications/Xokolat.app` never existed, and the app would have vanished on eject. A `.dmg`
with no `Applications` alias is an install that fails silently.

So the image is built read-write, mounted, arranged by telling Finder where to put things, and only
then converted to the compressed file people download — the window layout lives in the volume's own
`.DS_Store`, and Finder is the only thing that can write one. Contents: the app, a symlink to
`/Applications`, and a background drawn at build time from `web/icon.svg` by sharp (no second asset
to keep in step with the mark).

⚠️ **`.VolumeIcon.icns` must be written AFTER Finder, and this cost an hour.** Staged into the source
folder it was demonstrably on the read-write mount and demonstrably gone from the converted image.
`hdiutil convert` is not the culprit — an image Finder never touched keeps it. Finder deletes it
while arranging the window. It goes on last, after the arrange and before the sync, where nothing
else gets to see it; `SetFile -a C` then sets the custom-icon bit, and `GetFileInfo` confirms the
capital `C`.

Two smaller things that look optional and are not: the read-write image is sized 30% over its
contents, because one sized exactly to fit has nowhere to put the `.DS_Store` Finder is about to
write and the arrange fails in a way that reads as Finder ignoring the script; and `sync` before
detach, because Finder writes that file lazily and unmounting a moment early ships an image whose
window is arranged on the build machine and nowhere else.

**First build on a machine asks "Terminal wants to control Finder".** Allow once. Unavoidable —
`create-dmg` runs the same AppleScript and triggers the same prompt, which is why this is thirty
lines here rather than a tool to install on every machine that builds.

**AD-HOC SEALED, AND THE PARAGRAPH THAT USED TO BE HERE WAS WRONG.** It said "unsigned,
deliberately" and told people to use System Settings → Privacy & Security → Open Anyway. Both halves
were false, and 0.1.0 shipped that way. On a second Mac it came off xoko.lat and macOS said:

> "xokolat" is damaged and can't be opened. You should move it to the Trash.

The `.dmg` was perfect — full SHA-256 of the served file matched the local build byte for byte. The
signature was not:

```
spctl: code has no resources but signature indicates they must be present
Signature=adhoc,linker-signed
Info.plist=not bound
```

⚠️ **`swiftc` AD-HOC SIGNS THE EXECUTABLE, AND macOS READS THAT AS THE BUNDLE'S SIGNATURE.** A
bundle's signature has to seal `Contents/Resources` and bind the `Info.plist` — it needs a
`_CodeSignature/CodeResources` — and there was none. So the app carried a signature promising sealed
resources that did not exist, which is not "unsigned", it is BROKEN.

⚠️ **AND THOSE TWO STATES GET DIFFERENT DIALOGS.** An unsigned app is refused politely and Open
Anyway lets it through. A broken seal is refused as corrupt and offers only the Trash. We were
shipping the second while every instruction we had written assumed the first — the site told people
to click a button that was not on their screen.

`codesign --force --deep --sign -` after assembly, then `codesign --verify --deep --strict`, which
fails the build rather than shipping. On Apple Silicon this is not optional anyway: arm64 binaries
must carry a signature, ad-hoc at minimum, or the kernel will not run them. It costs nothing and
needs no Apple account. `--deep` is deprecated for DISTRIBUTION signing, where each nested piece
wants its own identity and entitlements; for an ad-hoc seal it is exactly right, and it replaces
Node's own signature, which was doing nothing for a bundle nobody notarizes.

0.1.1 reports `Sealed Resources version=2 rules=13 files=1427`, `Info.plist entries=11`, *valid on
disk*, *satisfies its Designated Requirement*.

**Still not notarized, deliberately.** The dialog people now meet is the ordinary *"Apple could not
verify…"*, and the five clicks that resolve it are on the site under the download button. That is
acceptable for an audience who already installed ComfyUI and pulled checkpoints from Hugging Face,
and unacceptable for anyone else. Notarizing needs an Apple Developer account (~$99/yr) and changes
nothing in `package.sh` — `notarytool submit` runs at the end over the same bundle. It also fixes a
smaller thing: an ad-hoc identity is weak, so macOS may re-ask for the `~/Documents` permission after
a new build.

⚠️ **AND ONE MORE LESSON, THE SAME SHAPE.** A test —
`❖ says a library it could not reach did not answer` — closed its stage server and let
`XOKOLAT_LIBRARY` fall back to `DEFAULT_LIBRARY`, so it was asserting a library is unreachable by
relying on `https://xoko.lat` not existing. The day the site went live it answered 200 with
fifty-five real styles and the test failed on a machine that was working perfectly. A test about a
server being down must name a server that is down. Both bugs are the same mistake: **something was
verified by its absence rather than by asking it.**

**What made this shippable at all** was the line above it in the same change: `server.listen` had no
host, so Node bound every interface while the banner printed `127.0.0.1`. Invisible on the machine it
was written on; on a café's wifi it is a stranger's whole app, since every API here trusts its caller
completely because a local app has no second person to authenticate. The absence of auth is correct
AND the reason the address is what has to be closed.

## 2026-08-24 (later) — a section keeps what it makes

Yesterday's answer to "where does a mascot go" was: on the image shelf, with a 🧩 chip saying which
chain drew it. It is wrong, and the operator said so in one line — *anything generated in a section
stays in that section*. A mascot is a mascot. You go to 🧸 to look at your mascots; 🖼 is where you
look at what you drew by typing a sentence. The chip was the tell: a byline is what you add when a
thing is in the wrong place and you have decided to live with it.

It was wrong in the Finder too, which is the half that cannot be argued with — 📁 reveal on a
cut-out landed in `media/image/`, and the pictures a chain drew, the words it wrote and the PDF it
bound were in three places with nothing joining them.

**One run of a chain is one folder and one card.** `compositions/<slug>/<run>/`, minted by the
server when ▶ is pressed and quoted back by every press of that chain (§15 rule 2 holds: the browser
never names it). Inside, a folder per step holding the same `run.json` and the same masters a media
run holds — so the index walk is the media walk one level deeper, through the same mtime cache.
`builds/` is gone as a tree of its own: it existed only because the chain's pictures lived elsewhere.

Three things follow, and each was its own mistake:

**The middle is what you made.** The section painted its step list down the centre — a live progress
readout in the one column reserved for content. Where a run has got to is a queue question and there
is already a queue, so the chain shows there with its steps under it; ⚙ holds what it will run at;
the middle holds the runs. The one live thing left in the feed is a `pick`, because that IS what the
chain just made and it is asking you about it.

**The defaults come with the chain.** A step carries `params` — a mascot square, a page 4:5 — so
taking a composition and pressing ▶ makes the thing, with no form to fill in first. The ⚙ band shows
them beside the engine plug, editable per machine, remembered in the browser and never written back
to the file.

**Nothing about the library is compiled into the app.** The family → glyph table (mascots 🧸,
coloring 🖍, books 📖) went with it: a composition brings its own `icon`, and 🧩 is the only glyph
this app has an opinion about. That table was the last place the library's vocabulary was hard-coded
here.

Nothing was migrated. Two images from yesterday's chain stay in 🖼 as ordinary pictures, because
that is what they are now — there are no legacy readers here (DECISIONS, 2026-08-03).

---

## 2026-08-24 — a composition can produce something, and that is what makes it a composition

**Lego and proteins.** A medium is a piece and a composition is a build — settled in conversation,
and then measured against the code, where it did not hold. `Composition` had no output field at all.
Every chain in the library ended in a *pile*: twelve candidates, four cast members, a text sheet
nothing read. Asked for a book, the app could draw twelve pages and could not produce a book, and no
amount of prompt work was going to change that, because there was nothing in the format for a book
to BE.

The metaphor's real claim is the half that was missing: **a protein is a subunit of something
larger, and a build must be able to become a piece.** Three things were needed for that, and the
book is the case that forces all three at once — which is why it was built first rather than
something smaller.

**1 · A terminal step that writes the result.** Every asset an earlier step made, in order, into one
file. It was built as `parts` — a sixth recipe INPUT, and the only one that was a collection — and
that was wrong for the same reason the `book` medium was: a recipe is one ask answered by one
service, and "these twelve, in this order, into one file" is not an ask anybody types. It is a
`BindStep`, the last step of the chain. Rejected then and still: a slot per page (a slot is one
picture; twelve pages is not a bigger version of that).

**2 · `each`, which is NOT `repeat`.** They read alike in a file and mean opposite things.
`repeat: 12` is twelve presses of ONE thing — twelve auditions, and you keep one. `each: "<step>"`
is one press per item of what that step produced — twelve pages, and you keep all of them. An input
naming the same step gets the ITEM; every other input gets the whole thing. One primitive, and it
turned out to answer two questions that looked unrelated: *one page per concept*, and *cut out each
member of the cast* — which is what a mascot family always wanted and could never say.

**3 · `list`, on a text step.** One answer, many items, one per line. It is the only way a single
sentence becomes twelve of anything, and without it a chain could make exactly one of whatever it
was pointed at however many presses it spent doing it.

**`book` WAS a medium for one day, and that was the mistake — reverted the same day.** See *A book
is not a medium* below. The test written here at the time — "is something producing this and having
nowhere to put it?" — is a true test of when a shelf is needed and the wrong test for what a MEDIUM
is, and following it put a product name in a list of materials.

**The binder renders nothing, and is therefore not a service.** Turning twelve pictures and twelve
captions into a PDF is deterministic code with no model in it. It went through the ordinary press
for one day — a `builtin` service, a `bind` recipe, a `parts` input — and every one of those was
scaffolding for a medium that should not have existed. It is a `BindStep`: the last step of a
composition, `src/builds/`.

**Rejected: `pdf-lib`.** It was on the stack line in `CLAUDE.md` as a plan and had never been
installed. A picture book is one image and one caption per page, no flowing text, no tables, one
base-14 font — about 120 lines of stdlib against a package that can lay out anything. Security rule
3 says prefer stdlib and justify every addition; three direct dependencies is still the number.

**The act a map names has to CHANGE the answer.** (2026-08-24.) `stillToTake` picked the first
publisher per medium — "newest wins" — and for ✒ vector that was `recraft-vectorize`, a tracer whose
only input is a picture. So the map told xoko that taking it was "the one thing that would" make
vector possible; xoko took it, reported success, and the next sentence came back *attach a picture
first*, because none of its four verbs can put a file on the tray. An act that leaves the answer
where it was is worse than no suggestion: it is spent. The pick now prefers a recipe a sentence
alone can press, and READY is qualified — a medium whose every installed recipe wants a picture
reads `NOT FROM WORDS` and names the take that fixes it. Two recipes can make one medium and be
opposite kinds of act, and the catalog now publishes `inputs` so the app can tell.

**A capability is not a fact the catalog gets a second opinion about.** `src/library/catalog.ts`
carried the string *"a composition — this app cannot take one yet"* for two days after
`takeComposition` landed. `look: library` prints that sentence, so xoko read it, believed it, and
told somebody the app could not install the two chains it was looking straight at — while the ⤓
button beside them worked. What refuses a take is the take. The map also gained a 🧩 line: it had
seven media and nothing about the other noun, so a brain reading it every turn was never told chains
existed, let alone that they are taken exactly like a recipe.

**A book is not a medium.** (2026-08-24, the same day, correcting the four entries above.) A medium
is a UNIT OF CREATION — a thing a person asks for by name, on its own, as the thing they wanted.
"Make me an image." "Make me a song." "Make me a voice." Nobody asks for a document. They ask for a
book, a comic, a zine, a portfolio — every one of which is an ASSEMBLY of images and words, which is
to say a 🧩 composition. `book` as a medium would have meant one new medium per assembly, forever,
which is precisely the explosion a closed vocabulary exists to prevent; `document` was the same
mistake wearing a more general word, and there is no sentence in which somebody asks this app for
one.

The real gap was never a missing medium — it was that **a composition had no run of its own**. A
chain was a browser-side macro: it fired ordinary media presses, each asset landed on its own shelf,
and the chain left no trace of itself, so the thing it was FOR had nowhere to go. What a chain
produces now belongs to the chain (`builds/<composition>/<run>/`, browsed in that composition's
section); the pictures its steps drew stay on the image shelf, because those really are units of
creation. A comic, a zine, an album and a storyboard are each another composition and none of them
needs a medium.

Gone with it: the `book` medium and its 📖 shelf, the `bind` kind, the `builtin` service preset and
its adapter, and the `parts` recipe input — which existed only so that a chain could press a recipe
that bound things. What is left is `BindStep` (`binds` · `parts` · `captions` · `page`), one route
(`POST /api/build`) and `src/builds/`.

**Rejected: a title page, a cover, and a `title` knob.** All three are real and none is needed to
find out whether the shape is right. The one setting a bound book genuinely has is the paper —
`letter` · `a4` · `square` — because it cannot be changed after the fact and it is the first thing a
print shop asks. Everything else about the page is layout this build has one opinion about, and a
knob for each is a page-layout engine growing one field at a time.

---

## 2026-08-23 — Six media, and three things that sound like a seventh

Asked what was missing, the honest list came back longer than the app: video, sound, vector,
singing, texture, text. Three of them turned out not to be media at all, and working out *which*
three is what this entry is for — because each one was rejected for a different reason, and the
reasons are the rule for whatever gets proposed next.

**The test.** A medium is a kind of output you would **browse and judge on its own**, held in **one
master file per cell**. Everything else is a recipe kind on an existing medium, a composition over
two of them, or a field on something else's record.

**TEXT IS xoko, PERMANENTLY.** There will be no 📝 shelf. The app has three chat engines already and
they exist to run xoko, not to fill a gallery. The corollary is the useful half: **written things are
never assets, they are fields on the asset they belong to** — lyrics belong to the song, the script
belongs to the voice run, a caption belongs to the shot. They already are: they ride in each master's
provenance and read back in ⓘ. A text shelf would have been a second home for something that has one,
and the two would have drifted the first time somebody edited the wrong copy.

**SINGING IS A COMPOSITION, AND ITS OUTPUT IS MUSIC.** It was on the list as a medium and that was
wrong twice over. A designed voice cannot be handed to a singing engine — the Qwen3-TTS identity is a
seed and a description *inside that node*, not a portable model — but a **recording** of it can be,
because every singing engine worth using takes a reference clip. So the chain runs through the audio:
press ▶ in 🗣, get an mp3 of that person, attach it to a music recipe. Two presses, one sentence,
which is exactly what `▶ make <composition>:` already is. And what comes out is a song — you would
browse it beside the songs and judge it as a take. What makes it *singing* is not the output, it is
that the recipe declares an audio slot, the same way an i2i recipe declares a picture slot.

**TEXTURE IS TWO WORDS.** *Texturing a mesh* (Hunyuan3D-Paint, TRELLIS) takes geometry plus a
reference and returns a `.glb` with its materials baked in, because glTF carries its own textures —
so the output is still a model3d and this is a **recipe kind inside 🧊**, needing no new vocabulary,
no shelf and no new master convention. A **tileable material** — albedo, normal, roughness, height,
seamless, attached to no mesh — is a different animal, and it is **the only thing on the whole list
that breaks the app's shape**: every medium here is one master file per cell, and a material is four
files that are meaningless apart. Adding it means inventing a folder-as-master or a pack format.
Rejected for now on that ground alone, and the ground is worth remembering: it is the first proposal
that would cost a change to the storage model rather than a section.

**THE THREE THAT ARE REAL** — video, sound, vector — pass the test cleanly. See `NEXT.md` for what
each costs and what it is blocked on.

**⚠️ AND THE ORDER IS NOT COST ORDER.** 🧊 texture goes first because it is not a scheduling item at
all: a paint workflow either includes it or it does not, so the day one is published, meshes arrive
textured. Then **video** (the capability gap, and the thing that makes the other three worth more),
then **sound** (structurally identical to music — nearly free), then **vector** (new master, and
nothing generates SVG directly: it is raster → vectorize, so it needs the take-an-existing-image
path).

**Audio attachment is unscheduled and buys three things at once.** `RECIPE_INPUTS` is five slots and
every one is a picture; the ComfyUI adapter uploads PNG. Widen it and voice-clone, sing-in-that-voice
and video-to-audio all become publishable with no new medium between them. Left unscheduled rather
than promised, because it is the only item here that widens a closed vocabulary.

---

## 2026-08-22 (later still) — ▶ runs a chain, and `make` names a composition

Holding a composition is not the point of having one. The runner shipped the same day.

**It runs in the browser, like every other press.** A chain is a SEQUENCE of presses this app
already makes: `ctx.generate` for a picture, `/api/text` for words, and — the step that makes it a
composition rather than a macro — a stop where *you* choose. Moving the loop server-side would mean
a second place that decides what a press is, and the one thing it buys (surviving a reload) is not
worth a chain you cannot watch or interrupt.

**`repeat: 12` is twelve presses.** A request has no `count` (2026-08-07: one press is one asset), so
twelve candidates are twelve runs, fired together and waited for together. The queue decides what
runs at once; that is its job.

**A step leaves behind either words or paths, and mixing them is caught by name.** A `text` step
produces a string, which is what a later `prompt` reads; everything else produces asset paths, which
is what `ref`/`look`/`control`/`mask` read. `prompt: <an image step>` would otherwise send a file
path to a checkpoint — which renders *something*, and is therefore worse than failing.

**`/api/text` is not xoko and not a run.** xoko has a persona, a transcript, a fold, a map and four
verbs; a chain's text step has a job and one sentence. Routing a step through `/api/xoko` would give
it xoko's system prompt — so a step asked to *write* a prompt could answer with `▶ make image:` and
start a render nobody asked for. And nothing is written, indexed or given provenance: words that
exist to become the next step's input are not an artifact you keep.

**The instruction had nowhere to live, so it got one.** A `chat` recipe is "this model, over this
transport" — it carries no system prompt, because what to ask a model is not a fact about the
service. So a step may carry `says`, and when it does not, `src/compositions/says.ts` borrows the
recipe's own label and notes and always adds a two-sentence frame: *answer with the result, no
preamble, a program reads this*. Verified against a real brain — the framed ask comes back as the
prompt alone.

**And `make` now names a medium OR a composition.** The verb table still does not grow: `make` was
always "name the thing, not the model", and a chain is a thing you can name. `▶ make
mascot: a badger who runs a bakery` is one line, and it is twelve renders, a question
back, and four more. This side cannot tell a composition slug from a typo — the folder is the
browser's — so an unplaceable target comes back as *"there is no X here"* in the transcript, next to
the line that asked for it.

**Choosing happens in the feed, never in a modal.** A dialog would cover the twelve pictures it is
asking about, and a browser modal blocks every event this app needs to keep running.

---

## 2026-08-22 (later) — a composition is an object, and taking one arms the machine

The library published four compositions and the app refused all four with a 501. The operator, for
the third time: *"Xoko should be able to add any recipe or whatever is in library. That means it can
build anything for xoko app, including compositions."*

**A composition is a chain that outlives one press** — several asks in an order, earlier outputs
feeding later ones, and a step where it stops and asks *you* something ("twelve faces, pick the one
that is the character, the rest are drawn from that face"). It is not a recipe with more steps; it
is a shape a person is inside.

**It references recipes, it never defines them** (PLAN, NEXT.md §3). What is composition-local is
the binding, and `recommends` is a *recommendation* rather than a pin — so `src/compositions/
resolve.ts` works out what would actually run, every time, and never stores it. The substitution
rule is derived rather than configured: a step declares what it makes and which inputs it fills, a
recipe declares the same two things, and anything that covers both can answer. That is what lets a
chain downloaded onto a machine with different checkpoints run at all.

**⤓ takes the whole thing.** The chain, the recipes bundled with it (each through the *ordinary*
`takeRecipe`, so a composition is never a second door for an engine), and the services those recipes
sit on — from the shipped preset list, reported in `added`, because a take that quietly changed what
this app connects to would be a take you cannot audit. All four published chains land on a
completely empty install and resolve `exact`.

**The parser is hostile about the graph, and not for security.** A composition is a graph; a bad one
does not fail as a refusal, it fails as a chain that runs two presses, writes twelve pictures and
then stops on a name nothing produced. Every input must be `ask` or an *earlier* step; a `pick` must
choose from an earlier step that makes something. A composition that loads is one that can run.

**One file per composition, one layer, no shipped half.** Every other registry here is shipped ←
yours because the app has an opinion. It has none about compositions: it ships zero and always will.
A list would mean taking one rewrites the file all of them live in.

**And the nav grew a second half.** `SECTIONS` is no longer the menu — `sections()` is, and it is the
built-in array plus one row per chain you own, built by `compositionSection`. Take a mascot chain and
a 🧸 row appears; 🗑 it and the row goes. Nobody edits a menu. Rows are prefixed `comp-` so a chain
called `library` cannot shadow 📚.

**Not shipped: ▶ for a chain.** Running one needs a text press that keeps nothing, a stop in the
middle for the `pick`, and one step's output landing in the next one's slot. The section says so
rather than pretending — it shows the chain, what would answer each step, and a ⤓ button for
anything still missing.

---

## 2026-08-22 — xoko gets four verbs and a map, and stops being one-shot

xoko shipped able to say things and to do exactly one: `▶ image: <prompt>`. It knew where you were
standing — a 120-character breadcrumb — and nothing else. The operator's verdict: *"we need xoko to
be able to 'own' the app. That it is able to interact with user at any section. From adding anything
available from library, to help user to create any media or composition."*

**What was rejected: a verb per feature.** "Operate the app" could have meant `arm`, `star`, `open
the styles grid`, `rename a run`, `delete`, one more for every section anybody writes next. That
table has to be extended by every feature and the prompt becomes a manual — and it is wrong the day
after it is written, because this app's whole shape is that content arrives from 📚 rather than
being compiled in.

**What shipped instead: four verbs, and a generated map.**

    look   read something back    answered server-side, mid-answer
    go     move the person        the browser
    take   install from 📚        the browser
    make   render something       the browser

The verbs are the kinds of thing an *app* can do; they do not change. What changes is the **map** —
the menu, what each section is for, and which recipe is armed per medium — and that is *generated*
(`web/lib/xoko-map.js`) from the same two lists the nav is drawn from. Install a composition and it
is in the map the same second it is in the menu, with no prompt to edit and no verb to add. The
one authoring cost is a `what:` line on each section, which lives beside the section so it cannot
drift from it.

**The map is small and always sent; everything unbounded is asked for.** Your library, your styles,
your recipes, four thousand assets — none of that can ride on every turn, so `look` fetches a
*digest* of one shelf at a time, with a filter (`src/xoko/look.ts`). A library of thirty and a
library of three thousand produce the same shaped paragraph.

**That made the ask a loop.** A reply ending in `▶ look:` lines is answered from disk and the brain
is asked again — up to three hops, then it answers with what it has. Still no tool calls: `claude
-p` is already an agent with a shell, which is exactly why the brain row runs it with its tools
disallowed. And still no vendor session — the hops are ours, the transcript is ours, and only the
final prose is kept.

**Reading is the only new power this process took.** `go`, `take` and `make` go back to the browser
and run the code a click runs — the section's own ▶, the same ⤓ the 📚 page calls, the hash. So
everything xoko causes is a press you can watch, in the section where that kind of work appears.

Also fixed here: the 409 that said *"…has no model to answer with"* when a brain had three models
and no **recipe**. Nothing is ever synthesised from a checkpoint, so that state is reachable and the
sentence sent people to the one list that was not the problem.

---

## 2026-08-16 (later) — 📚 library is a place you browse. The old one is 📁 files.

⤓ shipped as a **paste box**: type a catalog id or a link, press take. The operator's verdict was
immediate and right — *"the take with the URL to be pasted in the app is really bad… we should be
able to search in the app and directly pull."*

The box was not a small version of the right thing; it was the wrong thing. Pasting an id works
for whoever wrote the id and for nobody else, because **there is no way to find out what exists**.
On an app that now ships nothing runnable, that makes the first five minutes a treasure hunt
through a website in another window. So: a section, `/api/library`, the site's two catalogs read
and merged, and browse.js doing the searching and filtering it already does for every other shelf.

**The column that justifies the section is `needs`.** A catalog can say what a thing is; only the
app can say whether it will run *here*. `sdxl-ref needs ip_adapter_plus_xl_base_open_clip_h14_f16
.ckpt` is a download you can go and do; "sdxl-ref" is a name. It reads the **cached** engine
catalog — opening a list must not ask three engines what they have — so a service nobody has
talked to says *not checked*, never *ready*.

**The word had to move, and this is the second time vocabulary has forced a rename** (see `recipe`
vs `workflow`, above). `library` already meant *the folder your finished work lands in*. Two nav
rows called library, one meaning "my output" and one meaning "the shelf I install from", is
exactly the collision this project keeps refusing to ship. The folder is **📁 files** now, and the
API key moved with it: `/api/settings` answers `files`, and `/api/reveal` takes `root: "files"`.
The operator's own sentence decided which of the two keeps the word: *"anything exists first in
library, then can be downloaded to the app."*

**Rejected: keeping the paste box as well.** A second door into one room, and the one nobody would
use once the first exists. A link from somebody else still resolves — `/api/take` takes a URL —
it just is not a thing the UI asks for.

---

## 2026-08-16 — The app comes EMPTY. Nothing runnable ships with it any more.

`registries/inference.json` shipped 9 checkpoints and 19 recipes; `styles/image.json` shipped 9
styles and was copied into app data on first read. Both are gone. What ships is the ability to
**reach** things — four service rows naming transports this build has code for, the health probes,
the platforms, and the caps an undescribed checkpoint inherits — plus the vocabulary a parser holds
a download to. Everything runnable is published at xoko.lat and arrives through ⤓ (`/api/take`).

**Why, in the operator's words: *"anything exists first in library, then can be downloaded to the
app. THE APP COMES EMPTY, AND THE USER CAN ADD THINGS."*** The technical half of the same argument:
content inside the app cannot be corrected, added to or removed without shipping a release, and a
list that arrives with the app is **our** taste installed on somebody else's machine. A library
fixes a wrong `stepsLocked` the day it is noticed; a shipped registry fixes it next version.

**What this is NOT.** It is not "the app knows less". A fresh app on a machine running Draw Things
still shows every checkpoint the engine reports and a plain `t2i` for each — that synthesis is the
one assumption safe to make from nothing, and it is untouched. What it cannot do until you take
something is `edit`, `i2i`, style-ref, face-ref, canny, depth: everything that is a checkpoint
**plus** something, which is the whole reason the recipe layer exists.

**The seeding machinery went with the seed** (`seedIfAbsent`, the install-root style read, the
check-script loop over shipped style files). A reader for a file that will never exist again is a
legacy reader, and this repo does not keep those.

**Rejected: keeping a small "starter" seed so a first run is not blank.** It is the same decision
wearing a smaller hat — a curated list, shipped, uncorrectable — and it would leave the empty state
untested on the one path everybody walks.

---

## 2026-08-14 — One word: `recipe`. `workflow` is retired.

`Workflow` was the identifier — the TS type, the registry field, the request key, ~300 sites — and
"recipe" was the word every sentence in the UI, the registries' own `$comment`s and these docs
actually used. `src/types/workflow.ts` opened with *"a named recipe you can ask a service for"*: the
file defining the thing said the two words were the same word. That is one concept under two names,
which costs nothing while both are legible.

**What made it stop being free: xoko.lat.** The library publishes a recipe as a downloadable row
(NEXT §1), and the file was going to be shaped `{"type":"recipe","workflow":{…}}` — a public format
naming one object twice. A format can be changed before it is published and not comfortably after,
so this had to be settled first.

**Why `recipe` won, and not `workflow`:**

1. **ComfyUI's own word for its node graph is *workflow*.** NEXT §2 already had to write "turn a
   downloaded **graph** into a **recipe**" — two words for two genuinely different objects in one
   sentence. Once that transport lands a user holds both, and keeping our row called a workflow puts
   a permanent qualifier on every library page.
2. **"Workflow" implies a process with steps, and a recipe is one call** — flat, single-shot. Chains
   are coming (`pre:` steps, then compositions — NEXT §3), and spending the process-word on the
   non-process object would leave the real chain unnamed.

The settled vocabulary: **recipe** = one askable row (checkpoint + controls + LoRAs + knobs).
**composition** = a chain of steps that outlives one press. **ComfyUI workflow** = their graph file,
always qualified, never bare. The surviving uses in the codebase are exactly that: `Provenance.recipe`'s
doc comment, and PLAN's note on what a ComfyUI adapter's real work is.

**Rejected: rename the prose to "workflow" instead.** Cheaper by an hour of mechanical edits, and it
buys the qualifier problem forever.

**What it cost, and what broke.** ~300 sites, three files renamed (`types/recipe.ts`,
`inference/recipes.ts`, `tests/recipes.test.ts`), the registry field `workflows` → `recipes`, the
provenance field `workflow` → `recipe`, and the ask bar's stored key `xokolat:workflow:<kind>` →
`xokolat:recipe:<kind>` (so every ★ resets once — it is a preference, not work). No compatibility
shim and no reader for the old names: nothing is published yet, the shipped registry is a file we
own, and the provenance sidecars on this machine carried no `workflow` field to lose. The **user
registry layer** did carry one (`<data>/registries/inference.json`, rembg's `cutout`), and the
validator caught it by name — *`services[0].workflows: unknown field — nothing reads it`* — which is
that check earning its keep. Renamed in place.

Entries below this line keep the word they were written with. They are a record of what was true at
the time, and rewriting history to match today's vocabulary would make them lies.

While in there: `picked.slice(5)` became `picked.slice('recipe:'.length)`. A hardcoded prefix length
is a rename waiting to fail silently, and this rename is what proved it.

---

## 2026-08-13 — The ★ is per capability, and it is a control

### The favourite was a badge describing the wrong grain

`★ default` on a recipe row was `pickDefault` (`src/inference/workflows.ts`): **one recipe per
service** — the `t2i` one on whichever checkpoint the registry prefers. Per service is the wrong
question. It cannot answer *what should `edit` use*, it is not a thing anybody chose, and the label
was read-only anyway, so the one page where every candidate is on screen together was the one place
you could not pick between them.

The ★ now means **what ▶ presses for this ask**, one lit per capability, and it writes the same
preference the ask bar has always read. `pickDefault` stays as the fallback and loses its star (the
checkpoint-level one reads `preferred`) — two stars meaning two things on one page is worse than a
word.

Radio, not toggle: starring another moves it, starring the lit one clears back to the fallback.
There is never more than one and never none. **What cannot run cannot be starred** — the shell
resolves a stored key against what is actually there, so a star on a recipe missing its IP-Adapter
would silently not take.

### The medium came out of the key

The stored key was `xokolat:workflow:<medium>:<kind>`. A kind **declares** its medium
(`registries/kinds.json`, and a verb spanning two media is two kinds), so the medium was a fact the
key could always recover from the other half. Not merely redundant: `image:chat` was a reachable key
for an unreachable state, and 🔌 has no "current medium" to write under — it has a kind and nothing
else, so it could have written into a bucket nothing reads.

Rejected: keying on `(medium, kind)` and looking the medium up before each write. That is the same
lookup with a wrong answer still expressible. Old two-part keys stop resolving; each capability
falls back to the registry's pick until it is starred again, which is what an unstarred capability
does anyway. Nothing to migrate.

The two stored preferences in the ask bar are now different shapes, and that is correct: **which
capability a medium is set to** needs the medium (it runs medium → one of its kinds); **which recipe
answers a capability** does not (the kind carries its own medium).

### The service is a level inside a capability — only when there is more than one

`medium > capability > service > recipe`, with the service subhead drawn **only where it
disambiguates**. On this machine every image kind is Draw Things alone, so a heading over each would
be a line per kind repeating the row's own subtitle. `chat` is the opposite: 3 recipes on
claude-code and 409 on openrouter, sharing **one** cap of 8 — which buried claude-code's three
behind a catalog you only browse. Split, each service gets its own cap and its own count.

Rejected: `service > medium > capability`. Inside one service the medium never varies — draw-things
is all image, the cloud rows are all text — so it is a band with exactly one child on every card,
forever. And `capability > medium` cannot be built at all: a capability belongs to one medium by
construction.

---

## 2026-08-13 — The page is grouped two ways, and getting an engine running is a page we write

### 1. A capability view, alongside the service view — not instead of it

🔌 inference has always been a two-level tree: a service, its checkpoints, its recipes. That answers
*where does this run and how do I fix it*, and it cannot answer the other question anyone actually
has — **"does this machine have anything at all that can inpaint?"** Grouped by service, finding out
means opening every card and reading, and an *absence* is the one thing a list of what you have can
never show.

So the feed groups either way, and the toggle is remembered. Same rows, same selection keys, same
editor — the capability view is a regroup, not a second page.

**A kind with no recipe is still a card.** The empty ones are half the point: they are the only
place the app can say "nothing here does this" rather than leaving you to infer it from a list that
does not mention it.

**Rejected: replacing the service view.** Everything irreducibly about a service — its endpoint,
whether it answers, its checkpoints, ↻, ＋, its key — would be homeless. This page is where you
*install and fix* as much as where you look up what you can do.

**Rejected: doing it later, with compositions.** It was argued for that way (a composition's step
picker wants exactly "show me things that can do X") and the user overruled it, correctly: the audit
question exists today, on a machine with 23 recipes, and the step picker can reuse whatever shape
this settles into.

### 2. Two routes to a running engine, and the app ships the manual for both

The shelf's whole job is to say *not running*, and until now that is where it stopped. The next
thing anyone wants is the sentence after it — and that sentence is a page, because the honest answer
is two routes:

- **Open the app and switch its server on.** Draw Things and ComfyUI both have one. Nothing to
  install; the app has to stay open.
- **Run it headless at login** — a per-user launch agent (macOS) or a systemd user unit (Linux).

Neither is more correct. What made this worth writing down is that the second route has traps that
produce **silent** wrong results: a Draw Things gRPC server started as root or from a LaunchDaemon
has no WindowServer context, renders pure colourful static, and exits 0. Nothing tells you. Nor does
anything tell you that `--echo-on-queue` deadlocks discovery against generation, or that without
`--no-response-compression` xokolat cannot decode the pixels it gets back.

So: `help` on a service row — `/guides/…` or `https://…`, **and no other scheme**, because the user
layer is a file on disk and this string reaches an `href`. The card shows it quietly when the
service is up, and loudly, in the state's own colour, when it is not.

**The guides ship in `web/guides/` as plain self-contained pages**, and those same files are what
xoko.lat publishes. Two audiences, one text: someone staring at a red card already has the app;
someone deciding whether to install anything does not.

**Rejected: the app installing the service itself.** A "run this headless" button writes a plist,
which is an argv template with declared holes — the `exec` transport, and §15 rule 1. It stays
parked until something else needs that machinery.

**Rejected: pointing `help` at vendor documentation.** It exists today and ours does not, but none
of it contains the four facts above, which are the entire reason someone is reading.

### 3. A kind declares its medium, and a capability is a heading rather than a card

Three corrections to the view above, the same afternoon, after looking at it.

**Capabilities band by medium, and the medium is on the KIND.** The flat list was already wrong on
the day it shipped: `kinds.json` holds eight image verbs and `chat`, drawn as peers. Music, voice,
3D and video each bring five or six more, and thirty rows in one column with no organising
principle is the wall the 🧩 merge existed to end. Medium is already a first-class axis here — a
type, a field on every service row, the thing the nav splits on — so this is applying an axis, not
inventing one.

⚠️ **Declared on the kind's row, never derived from the service running it.** Deriving works today
and is wrong the day a service serves two media, silently — the same reason a checkpoint's caps are
never guessed from its filename. And a verb that spans two media is **two kinds**: `t2i` is
words→picture, words→song gets its own row with its own name. That is what keeps the registry a
flat list of nine rather than a matrix.

A kind with no medium is still legal and lands in a last band, because refusing it would make
someone learn the medium vocabulary before they are allowed to name a verb — the exact bargain the
kind registry already makes about slugs.

**A capability is a heading, not a card.** It was drawn with `.svc`: panel, border, status dot,
fold. So a kind rendered as though it were a service, and the page had two identical-looking
objects that are not the same sort of thing — one is something you configure, the other is a label
over the recipes that answer for it. The weight belongs on the recipe rows, which are what can be
clicked and edited.

**And the view switch is not a button.** Two `.btn.mini` in a segmented pill, beside `＋ add a
service` — a way of *reading* the page given the same chrome and weight as the only control on it
that *acts*. It is now a quiet text switch beside the count it describes, and ＋ has the right of
the bar to itself.

**Also folded in:** `MEDIUM_FACE` had two copies (the shell's nav, xoko's `▶ <medium>:` lines) and
this would have been the third. It moved to `web/lib/shared.js`. A third copy is where a table
starts disagreeing with itself about what 3D is called.

### 4. A cap, a filter, and a control that looks like one

Then someone counted the rows, which nobody had done:

```
total recipes: 433
  chat        412   ← claude-code (3) + openrouter (409)
  t2i           9
  everything else   1–3 each
```

**412 of 433 recipes are `chat`**, because one cloud row reports 409 models and each becomes a
checkpoint and a synthesised recipe. The capability view drew all of them in one band, and the
same change that made capabilities headings had removed the folds. This was not a taste problem;
the page was broken, and the count is the reason it was invisible in review — nine local
checkpoints and a cloud's whole menu arrive through the same door.

**A cap of 8 with `show N more`, in place.** Not a page, not a modal — same reason this section has
no drill-down: opening the tail must not cost you your place in the head of it. It applies to
recipes *and* to the checkpoint list, because 409 engines is the same wall in the other view.

⚠️ **A cap is only safe if the order is.** Rows sort default → runnable → the rest before they are
cut. Showing eight recipes you cannot press while hiding the three you can would be worse than the
wall it replaced, and registry order is meaningless once only the first eight are drawn.

⚠️ **The heading always shows the true total**, never the number on screen. Knowing what is there
is the entire value of the capability view, and a heading that said 8 because 8 are drawn would
throw it away at exactly the scale that forced the cap.

**A filter box, both views.** Structure makes 433 recipes readable; it does nothing to make one of
them findable. It matches a recipe's slug, label, kind, checkpoint and service — not `notes`, since
a paragraph makes every query match. It is one node for the life of the section, re-parented rather
than rebuilt, or typing would take the caret with it.

**No "filtering lifts the cap" rule**, though it was argued for. Narrowing 409 rows to 6 already
shows all six, because six is fewer than eight — the arithmetic does what the rule would have, and
one fewer rule is one fewer thing to hold in your head.

**And the switch is a segmented control again** — third version, and the first two were wrong in
the same way. `.btn.mini` next to ＋ gave a view mode the chrome of an action; the plain text switch
that replaced it could not be found. Weight was never the knob. It is now unmistakably a control,
and it *leads* the bar while ＋ ends it: separation, not quietness.

**Raised, not decided:** should a cloud's whole model menu be 409 recipes at all? Draw Things' nine
are checkpoints you installed; OpenRouter's 409 are a catalog you browse, and they arrive through
the same synthesis. The cap makes that comfortable, which also makes it easy never to fix.

---

## 2026-08-12 — A control is a fact about a recipe, and a key is not a fact about a service

Two boundaries, drawn on the same day, and they are the same shape twice.

**A control belongs to the recipe.** `sdxl-ref`, `sdxl-face` and `sdxl-style-ref` are one checkpoint
three times; what tells them apart is which IP-Adapter is stacked on it, at what weight, pointed at
which attention blocks. So `controls` sits on the workflow, next to `loras`, and the checkpoint keeps
only what is really its own. This is the last piece of the argument the workflow layer was created
for in the first place — until now the layer was right and empty.

**Rejected: a `controls` field on the checkpoint.** It would have been a claim about every recipe
that checkpoint appears in, and false for most of them.

**A key does not belong to the registry.** The registry is a file meant to be read, copied and
shared — it is how a service is described and how a description travels. A credential is none of
those things. So `transport.auth` names a key and `<data>/secrets.json` holds it at 0600: moving a
service to another machine carries what it IS and leaves the credential behind, which is the correct
outcome rather than a limitation. The parser refuses a key written into the registry BY NAME,
because the shape that invites it ("why not just put it here") is the one the split exists to
prevent.

**And the browser is told a boolean.** No route returns a stored key and there will not be one: a
credential you can read back out of a web page is one screenshot from being someone else's. The box
on the ⚙ pane can write and cannot read, which is what makes it safe to leave on screen.

**Rejected: encrypting the store.** A passphrase this app would have to keep somewhere in order to
decrypt on its own is theatre. On a single-user machine the honest protection is file permissions;
the keychain would be better and needs a signed app. 0600, and say so.

**What the parity test was for.** The control work could not be finished by argument — a control that
is subtly wrong renders, and the picture is merely not the one you asked for. Eleven configurations
were compared field by field against the buffers the reference implementation builds for the same
recipes, and it found two divergences on the first run. One was a fixture artefact; the other was
real and is now recorded rather than smoothed over: the bridge turns FLUX's own guidance speed-up
off for every flux model even when it has nothing to put in its place, and this app only turns it
off when it does.

**Rejected: comparing bytes.** Two correct FlatBuffers of one table differ in layout — the writer may
lay fields out in any order. A byte comparison would have failed on nothing, and could have been
made to pass by copying the reference's write order, which proves nothing about what the server
reads.

---

## 2026-08-12 — A subscription is not a key. The brain is a command you already logged into.

The settings plan of that morning (since folded into `NEXT.md`) drew the brain as
`key ●●●●●●●● connected` and said, correctly, that a Pro plan does
not pay for third-party apps. What it did not say is what to do instead — and "instead" turns out to
be the whole feature, because the person asking has a Claude subscription and no interest in a
second, metered bill for the same model.

**There is no login button, and there cannot be one.** Pro, Max, Advanced and Premium are
subscriptions to a vendor's *own client*. They carry no API credential and expose no OAuth flow a
third party can spend one through. A "sign in with Claude" button in this app would be a lie about
what happens when you press it.

**But the client on your machine is already signed in.** So a brain is a `cli` transport: the app
runs `claude`, hands it the question on stdin, and reads the answer off stdout. The credential never
comes near this process — better than any key box we could have drawn — and the same shape reaches
Gemini's CLI, Codex, and whatever ships next. content-factory has been doing exactly this since
July (`runners/agent_runner.py` shells `claude -p`); what is new here is that it is a registry row
rather than a hardcoded command.

**How that survives §15 rule 1** — *the browser never sends a command line.* A `cli` row carries
**no argv, no binary and no path**: it names a brain from a list compiled into the build
(`src/inference/cli/brains.ts`), and the parser refuses any other name. The most a page, a
hand-edited registry, or a model writing its own service row can say is *which of the things this
app already knows how to run*. That is what the rule asks for, not an exception to it.

**Rejected: a `command` field with an argv template in the registry.** It is one line of code and a
remote shell. The whitelist costs a file and buys the property outright.

**Rejected: a key box, for now.** Ollama needs none and a subscription cannot use one, so the two
brains that work today both work without credentials. Keys are still item 7, and the credential slot
is still shaped so `{ kind: "oauth" }` drops in per provider — this just is not the thing that was
blocking anybody.

**Rejected: shipping the brain's model list in the registry.** `claude --model` takes what the
vendor publishes, not what is on this disk, so a list in a JSON file would be a stale copy of the
one that sits next to the argv. `declaredEngines()` reads it from the same file, and a row that
names its own still wins.

### Later the same day — it can act, and the action is a LINE

Using it found the obvious gap: asked to make a picture, it wrote about one. It had no verbs.

**xoko writes the sentence; the recipe you armed answers it.** What comes back is prose plus, when
you asked for something, a line — `▶ image: <prompt>` — which the browser presses through the
**section's own ▶**. Not a copy of it: the actual `make` the button calls, so the style select, the
knobs, the reference tray and the armed recipe are what they would have been if you had typed it.
A brain cannot see your checkpoints and cannot pick one, and "any section" comes free because the
armed recipe per medium is one function the bar already calls.

**Rejected: tool calls.** `claude -p` is already an agent with a shell — which is why the brain row
runs it with its tools disallowed — so this means handing back the surface we had just closed, and
it needs function-calling that small local models do not reliably have.

**Rejected: strict JSON.** Claude does it well and a 3B model on Ollama does not, and a malformed
answer would then lose the *prose* as well as the action. A line parses with a regex and degrades
to visible text.

**The conversation lives in the browser.** Neither side keeps a session: the transcript on screen
is sent with each question, so what the brain knows is exactly what you can see. `claude --resume`
would put conversation state somewhere this app does not own, and Ollama has no equivalent — this
way both brains behave identically and there is no hidden state to get out of step.

**⏹ is the socket closing.** The browser aborts its fetch, node reports the disconnect, the child
is killed. No cancel endpoint, no job id, and nothing left running when a tab is closed. Note it
means *abandon*, not "keep what arrived" — there is no streaming yet, so there is nothing partial to
keep.

**Rejected: a ComfyUI preset, again.** Asked for directly this time, and the answer is unchanged
until the transport exists: the preset list is the adapter list, and a row that looks configured and
renders nothing is the exact failure the shelf's three states exist to prevent. It is worth
building — it is also the thing that makes install-from-link real — but a dropdown entry is not it.

## 2026-08-09 — The engine stack is GLOBAL and lives on the bar. The pane holds one question.

The run panel moved three times in two days. Where it landed:

```
✍ bar    the multiselector — a tab per medium, then a TABLE OF ASSIGNMENTS
           🖼 🎼 🗣 🧊 ✨
           on     <service>
           t2i    <recipe>
           i2i    <recipe>     ← one row per kind, each with its own memory
           edit   <recipe>
⚙ pane   do <kind>            and nothing else — no row at all when there is one kind
```

It began as exactly that popover with one extra row (`what to do`). Asked to let the user "choose
what to make on the right pane", I moved **all three rows** into the pane and reduced the bar chip to
a readout. Told that was wrong, I moved back only `with` — and left `on` behind, and added a "with …"
readout to the pane. Wrong twice, in the same way both times.

**What I kept getting wrong is that the engine stack is one setting, and it is not about the section
you are standing in.** Which service runs and which recipe answers is chosen once, for every medium,
from one surface — that is what the tabs are for. Choosing what renders pictures and what writes
songs is the same question asked four times, and asking it in four places is how the four answers
drift. Twice I deleted those tabs reasoning that "the section already says which medium you are in".
It does not: the section says which medium you are **looking at**, never which engine each medium
will **use**, and only the second of those is a setting. Two different facts that read as one.

The kind is the opposite kind of thing, and that is why it is the only thing in the pane:

- it is **section-local** — you are in 🖼 images and you decide whether this is `t2i` or `edit`;
- it **reorganises the pane it sits in** — `i2i` grows a strength slider, `edit` drops the style row;
- and it is **temporary**. Xoko will know the capabilities and the armed engines and pick the kind
  itself. It is a single row that can one day be no rows, which is exactly what a durable setting is
  not.

So the pane also does not repeat what is armed. Where the engine is chosen is learned once; printing
the answer again in ⚙ is a second place for it to look wrong, and I had just put one there.

Rejected: **restoring the old popover verbatim from git.** It carried the invented task vocabulary
(`make · vary · restyle`) and picked a *checkpoint* rather than a recipe. What came back is its
shape — tabs, then rows that print their answer shut and open into the choices, the menu every video
player uses for exactly this problem — with the task row deleted, because that row is the one thing
that genuinely belonged in the pane.

**A row per kind, not one row filtered by the armed one** (same day, one round later). The filtered
version had a defect that only shows when you look away: it read "Kontext edit" while `edit` was
armed and meant something else the moment ⚙ said `t2i` — one row, two meanings, governed from
another pane. A table of assignments is true at all times.

It also **restored something the workflow refactor had quietly broken.** Storage held one slug per
medium, so choosing a kind had to arm "the first recipe of it" — pick SDXL for `t2i`, visit `edit`,
come back, and you had klein again. The key is `workflow:<medium>:<kind>` now, and the armed kind is
its own stored value rather than being read back off the single remembered recipe. That derivation
*was* the bug: with one slot, changing the kind could not help but overwrite a choice.

The old code had this right and said why — its key was `${favKey}:${task}`, commented *"the
checkpoint you edit with is not the one you make with."* Worth naming the failure mode: a refactor
that changes what is *stored* can delete a behaviour without touching the code that implements it,
and nothing fails — you simply find your choice replaced later.

## 2026-08-05 (later) — A shelf declares data. Never a card, never a stylesheet.

Asked why the ▦ grid looked different on 🖼 images and 🎨 styles. It did, and the reason was a bad
seam I cut the day before.

When `browse.js` was extracted it took the *chrome* — the bar, the ▦/☰ switch, the sorting, the
window, the empty line — and left **the card with each caller**, on the theory that "the tile is the
medium's own." That reads as flexibility. It was two copies of one component: `.media-cell` in the
feed and `.swatch-card` on the styles page, differing in exactly **three** things — the aspect, one
hover button, and the order of the footer — and duplicating everything else, including two CSS blocks
both saying *bordered box, hover accent, selected accent, picture, footer*.

Every one of those three is a **parameter**, not a component. `tile()` now lives in `browse.js` with
slots: `art` · `aspect` · `badge` · `action` · `label` · `took` · `star`.

**The duplication had already cost real behaviour**, which is the part worth recording:

- `.swatch-card.sel` existed; `.media-cell.sel` never did. Selecting an image set the same class
  `browse.js` sets on everything and *looked like nothing happened* — the ⓘ band opened with no
  feedback on the feed.
- `.media-cell` never got `width: 100%` either, so a landscape render, capped only by `max-height`,
  overflowed its grid column.
- The app-wide ★ filter was a **hand-kept list of card class names** that each new shelf had to
  remember to join — and half of it named cards that no longer exist. It is now two selectors, one
  per *layout* (`.browse-card`, `.browse-tr`), and a shelf is filtered by construction.

Also deleted: `.sw-*`, a **third** card family carried over from content-factory's styles workbench
and never drawn by a line of this app's JS. An unused card family is the one the next section copies.

**Rejected: keeping the tile per-section "because a medium knows its own look".** A medium knows its
own *aspect* — that is one field. Everything else it "knew" was a copy.

**The rule, and it generalises past cards:** a shelf declares its **items, facets, columns and the
slots of a tile**. If it is reaching for a class name or a layout, the thing it wants belongs in
`browse.js`. `gallery.js` is now only the run-shaped→flat mapping, which is the one thing genuinely
the media feed's — the giveaway that the tile was in the wrong house was that the *styles* page, which
has nothing to do with a media feed, was importing it from there.

---

## 2026-08-05 — One shelf, two views, and a window

Two corrections, and the second one is a rule rather than a fix.

### The S/M/L size control was a wrong idea

*"brings no value allowing user change that size… they would be able to see full size by clicking
right pane option."* A control that only trades pixels for pixels is a preference nobody has, and
every control is a thing to maintain and a thing to be wrong about. **One fixed tile size, one
fixed thumbnail**, and the swatch at a size you can judge lives in ⓘ — which is also the rule the
media feed's ⓘ already followed.

### Design for the product, not for the data on disk

*"stop thinking on what we have now '9 styles' to make decisions… think how this will be for end
user when in production."* I had justified skipping work with "there are only nine styles". What
is on disk is an accident of how far the build has got.

Re-answered at real volume, the table-library question changes its own answer. At thousands of
assets the walls, in the order they arrive, are:

1. **DOM node count.** Five thousand tiles is five thousand images on a phone. Nothing about
   markup or columns helps. → the shelf now holds a **window**, extended by an IntersectionObserver
   sentinel; `extend()` appends and never rebuilds, so scrolling does not get slower as you go.
2. **The wire.** `/api/manifest` ships the entire index to the browser. That is the real ceiling
   and it is a **server** change — still outstanding, named here so it is not forgotten.
3. **Columns**, a distant third: sorting ten thousand objects is about a millisecond.

**So still no TanStack Table, but for a better reason than I first gave.** It is headless — it
manages sorting/filtering state and renders nothing — and it does **not** virtualize. It addresses
neither (1) nor (2), and once (2) is done properly most of what it manages moves server-side.
Vendoring a client dependency (no build step ⇒ vendoring, without `npm ci` discipline) to solve the
cheap problem while the expensive two remain is the wrong trade. **If a library earns itself here
it is a virtualizer, not a table** — `@tanstack/virtual`, and the trigger is non-uniform row
heights. Ours are uniform, which is the easy case.

### `sheet` and `runs` are gone

The media feed had two "views" that were really one axis about GROUPING. The app now has exactly
one choice — **▦ grid or ☰ table** — shared by every shelf. A run is a FACT about an asset, so it
rides on the asset: the ask is its search text and a sortable column, and "one ask, N engines" is a
`⧉N` badge on the tile instead of a framed block around a group.

Flat is also what made the window possible: a grouped feed cannot be windowed without deciding what
half a group means.

### What is now shared

`web/lib/browse.js` owns the bar, the ▦/☰ switch, sorting, the window and the empty state;
`gallery.js` is reduced to the one thing that is genuinely the media feed's — flattening the
index's run-shaped data. A section declares `card` and `columns` and nothing else. A column carries
its own `width`, and the shelf composes the grid template, so the header and every row line up by
construction.

⚠️ The table header is deliberately **not** sticky: the filter bar above it already is, and
stacking a second one means hardcoding the first's height — a number that is wrong the moment the
bar wraps.

---

## 2026-08-04 (night) — One way to look at a list

*"I do not like how you have designed the styles central page… just put them one after the other,
and the top filter can filter by category."* Right on both counts, and the second one names the
general fix.

### The category headings were the third version of one mistake

Shelves-with-headings broke nine swatches into three short rows with rules between them — more
chrome than content — and a heading between `cel-shaded` and `soft-watercolour` puts a wall
between two things you are choosing between. **A grid exists to be scanned.** content-factory's
grid is flat with filter chips for exactly this reason; I had it open and grouped anyway.

It is the same error as the paragraph in the ⚙ band and the second filter bar: **structure that
explains the page instead of letting the page be the things.**

**Categories stay — as a FILTER.** The value of a category is narrowing, not grouping. It is a
facet in the bar now. The ⚙ picker keeps its optgroups, and that is not a fudge: a dropdown is
already a one-dimensional list, so grouping costs no space; a grid is two-dimensional and grouping
costs a row break.

### web/lib/browse.js — the shared answer

Twice now the styles page has grown its own version of something the media feed already had. So
how a LIST OF THINGS IS LOOKED AT is one module: the filter bar (search · facets · clear · tally),
the ▦/☰ switch, the S/M/L size, the `--tile` variable, the empty line. A section supplies how ONE
item draws — `card` and `row` — and nothing else about the layout.

- **Facet options are derived from the items in hand**, never declared, so a facet cannot offer a
  value nothing has.
- **Filters reset, preferences do not.** `clear` empties the search and the facets and never
  touches layout or size — those are how you like to look, not what you are looking for. Both
  remembered per browser `id`.
- **No `row` means no ▦/☰ toggle.** A section with nothing to say in a list does not get a control
  that does nothing.

### The list view earns itself

A row shows the WORDS, which is the one thing a swatch cannot. Nine looks are a grid question
("which of these?"); nine prompts are a list question ("which one says hatching?"). The filter
searches those words in either view.

### Not done, and deliberately

`gallery.js` still has its own copy of the filter bar and the size control — about 25 lines. It
should move onto `browse.js`, but its first control is (sheet | runs), which is about GROUPING,
not layout, and forcing that into the same axis as (grid | list) would be a bad abstraction rather
than a shared one. `tsc` does not see `web/`, and the media feed is the app's main surface: it
gets refitted deliberately, not as a side effect of a styles-page fix.

---

## 2026-08-04 (late) — The styles page is a workbench, and xoko is a popup

The swatch grid shipped and was still wrong. The operator's words: *"the edit right pane I think
can be simple, and there's no option to shoot anywhere… can you look at how it was done in
content-factory?"* Reading `content-factory/studio/lib/pipelines/styles.js` next to ours, the gap
was **not layout** — it was that theirs is a workbench and ours was a catalogue.

### What was missing, in order of how much it hurt

**Nowhere to shoot from.** One button per card, and no way to fill a grid. Now: a **▶ sweep** that
shoots every missing cell in one press (one request, N jobs — a sweep is a list, not a mode), and
a **▶ re-shoot** in ⓘ.

**A stale swatch after an edit.** Saving changed words only re-shot when there was *no* picture, so
editing a style that had one left a picture of words it no longer says. Now `💾 save & re-shoot` is
**one button**: re-shooting is the save completing, which removed a button and the bug together.

**The editor was a form.** Five labelled fields each with a hint line — fifteen lines of prose in a
narrow dock to edit what is really three strings. Now a head row and bare rows. (Kept: *every*
field a style has. Saving replaces the entry, so a field the form hides is a field the save
deletes — my two-box mock was wrong about that.)

**No model column, and the swatch would not admit it.** Swatches were keyed `(medium, style)` and
shot with the engine's *default* model, not the one selected — so a cell could be a picture from an
engine you were not using, silently. Now `(medium, service, model, style)`, the 🔌 band is the
column, and the tally names it. This is the foundation for per-model wording, not decoration.

**A failure vanished.** It flashed and the button reset. Now the reason is written beside where the
picture would be and the cell is a **✗ carrying the engine's own words** — content-factory calls
this the most useful cell in the grid, and it is right: it is the answer you would otherwise pay
for twice.

### Axes: the vocabulary, not the registry

Asked whether to port the axes too. They did **two** jobs, and only one has a consumer here.

The machinery — per-option ★, family scoping, base words, a resolver mirrored in runner and
browser — all paid for **randomising a look per build for unattended batches**. This app has no
unattended runner; "vary it for me" is already one word in the picker. Ported whole, the registry
would have had a dice button for its only consumer.

The second job is real: an empty `words` box is a bad prompt, and it fails specifically — you say
three things about line and nothing about palette. So the axes survive as a **checklist in the
editor** (`▸ style axes — examples`, click-to-append, closed by default), shipped and read-only in
`src/styles/axes.ts`. **Ingredients, not styles**: content-factory's options were whole sentences
because a roll used exactly one per axis; here you are writing, and a 12-word option would BE the
style. Rejected: the registry, and the dice — an LLM does not produce the incoherent combinations
that independent per-axis picks constantly do, which is what content-factory's ★ pools were
curating away.

### ＋ new style is gone; ✨ xoko is the door

A blank form you hand-type comma-tags into is the one authoring shape that does not survive a model
change — content-factory deleted its ＋ for exactly this reason. Creating and importing are the same
sentence from the user's side, so they are the same door: xoko **creates or pulls**, and the
proposal card differs only by a badge.

**xoko is a popup, not a nav section**, with **two doors**: the header `✨` (cold) and a view's `✨`
(pre-framed). Its brain is an **inference row like any other** (`medium: 'text'`), which makes
local-vs-cloud two rows on one shelf rather than a feature. Built now: the door, both entrances,
and the honest empty state — *"xoko needs a model to think with"* with a link to 🔌. A ✨ that does
nothing, or is absent until the LLM lands, is worse than one that says what it needs.

### Corrections the same evening

- **"shoot", never "re-shoot".** One verb for one act. Whether a cell already has a picture is
  visible in the cell; it does not need a second word.
- **The filter bar is `.feed-filters`** — the media feed's own bar, not a second one with its own
  look. A page that filters should filter the way this app filters.
- **No ★-only button on the page.** The header's ★ already means "show only what I starred",
  app-wide and in CSS; the swatch card just joins the selector list. Two controls for one
  question is how they drift apart.

**Found while wiring it:** the 🔌 picker filtered on `role === 'generator'` only. A text row would
have appeared in the images section's engine dropdown. Sections now declare their `medium` and the
picker filters on it — music would have found this next.

---

## 2026-08-04 (evening) — One list, one star, and bands that can be absent

Four corrections, all from the operator using the styles page.

### "Copy to mine" was ceremony the implementation invented

Styles were read in two layers — shipped in the install root, the user's in app data, namespaced
`xk:` / `user:` — and the UI turned that into a rule: you had to *fork* a shipped style before you
could edit it. That is bureaucracy about an implementation detail, in a local app where the one
user owns everything in it.

**The shipped file is now a SEED.** Copied into app data the first time a medium's list is read,
never consulted again. One list, every entry editable and deletable, no namespace in ids, in the
request field, or in the UI.

What it costs: a future update shipping new styles will not reach an existing install. Acceptable
for a single-user local app with an import path coming — and "reset to defaults" is still just
deleting the file.

**An emptied list stays empty.** A user who deleted every style meant it; re-seeding would be the
app arguing. And seeding is best-effort — an unwritable data directory reports and carries on
rather than taking the whole read down with it, which a test caught.

### ★ replaces "yours vs shipped"

You do not need a provenance badge to organise a list; you need to know which ones you like. So a
style takes the **same ★ as an image**, keyed `style:<medium>:<slug>` in the same store, and
**starred styles sort first in the ⚙ picker** — which is where it actually pays, because that
dropdown is where you choose in a hurry. Deleting a style forgets its star, or the key becomes one
nobody can ever clear.

That also makes the page consistent with every other surface in the app: grid of things → ★ or 🗑,
one thing selected → ⓘ. No third vocabulary.

### The probe is a chick and a chocolate egg

The *mona de Pasqua* — the app's own name in a picture, instead of stock-prompt filler. It is also
a better probe than the cat it replaces: down for texture, a clear silhouette, and a **smooth
specular surface**, which is where styles differ most sharply (flat vector kills the highlight on
the chocolate, watercolour blooms it, cel-shading bands it). No scenery, because background clutter
is noise in a comparison.

> **Superseded 2026-08-05** — the same subject, one sentence better: the egg now sits *on a cake*
> (a third surface: matte crumb, where a grain or halftone finish shows first) and `simple
> background` is stated rather than hoped for. The reasoning above is unchanged; only the wording
> is. `src/styles/probe.ts` is the sentence. All 57 swatches on disk were cleared with it — they
> were pictures of the old one.

### A band with nothing to say is not drawn

The four bands are a fixed ORDER, not a fixed presence. I had filled ⚙ on the styles page with a
paragraph explaining the page — the same "prose in the UI" mistake already corrected once on the
library section, made again. The band is now hidden when its owner declares no options.

---

## 2026-08-04 (later) — A style list is pictures, and a view is a nav row

Two corrections to the styles view, both from using it.

### It was words; it had to be swatches

I shipped the style list as text cards — slug, label, prompt words, tags. Wrong shape for the
thing: a style is a LOOK, and you cannot tell `ink-linework` from `cel-shaded` by reading their
prompts. Choosing between looks is the whole job of the page.

So every style now carries a **swatch**: one probe render, same subject, same seed, small. The
words move into the detail of the one you clicked, where they are read rarely and browsed never.

- **The subject and seed are fixed and shipped, not configurable.** Two styles rendered on two
  different subjects compare nothing. content-factory shipped a configurable probe subject and
  deleted it in its own simplification pass — starting where that ended.
- **Lazy, and cached.** A style you just saved renders immediately (that is when you want to see
  it); everything else shows a ↻ until asked.
- **Editing a style drops its swatch**, because the old picture is not true of the new words. A
  swatch that lies about its style is worse than none.
- **A swatch is not content**: app data, never indexed, never in the gallery, never exported. The
  rule PLAN §9 already gives the canary probe. Deleting one is free.
- **It shares the one serial lane.** A swatch must not race a real render, so it is queued like
  anything else and the view watches the job.

It resolves model → caps → prompt → params through the **same helpers `startRun` uses**. A probe
that resolved its own knobs would be a second answer to "what does this engine want", and the
first time they disagreed the swatch would be a picture of a lie.

This is also xoko's judging surface — propose → probe → ★ keep / 🗑 discard — so building it now
means xoko invents nothing.

### The dock follows where you are

The styles view drew a picked style's words as a block *inside the feed*, and the ⚙ band went on
showing the images section's steps/size/seed knobs — on a page where nothing is generated.

Both wrong, and against a rule this app already had: four bands, and **ⓘ is the selection**. So a
view now owns ⚙ and ⓘ while it shows, falling back to its section when it declares neither. The
feed is the things; ⓘ is the thing — including the style editor, which is a change to what you
picked and belongs where the thing you picked is described.

### A view is a nav row, not a tab strip

I built `feed · 🎨 styles` as a strip over the feed. Undone. The centre pane already carries the
gallery's search, facets, view toggle and tile sizing; a third row of controls makes a
place-you-go read as one more toolbar, which is exactly how it landed.

**A section's views are child rows in the nav, shown only while their parent is active.** The nav
is the map of the app, and a child row says *this section contains a place*. Only the active
section expands, so the menu grows by one row and not by nine.

What it buys beyond the reading: a URL (`#/images/styles`, so back and forward work), no redundant
"feed" tab to name, and a better mobile story — the nav is already a slide-in pane there, where a
strip would eat the scarcest vertical space.

The declaration grew two optional fields and is otherwise unchanged: sections return
`views: [{ id, label, node, refresh, options?, detail? }]`.

**And child rows are collapsed by default**, behind a twisty on the parent row. A place you visit
occasionally should not be permanently in the menu — but navigating into a view expands it, since
being somewhere invisible is worse than an extra row.

**One extra door, not a second implementation:** a 🎨 link beside the ⚙ band's style picker,
because that is where you notice the style is wrong.

---

## 2026-08-04 — Three nouns, five verbs, no levels

Yesterday's model was right about the verbs and wrong about almost everything above them. It grew
nouns across one session — bundles, subjects, products, shared-vs-deliverable, treatments, slots —
until the operator said, correctly, *"isn't there an easier way?"*. There was. Most of those nouns
were the same thing wearing a different hat.

PLAN §4a–4f is now the whole model and replaces everything below it here.

### The collapse

| Yesterday | Today |
|---|---|
| a sticker pack, a colouring book, a deck | a **composition** |
| a character / mascot | a **composition** — an identity and its looks |
| an artifact | a **composition** — a thing and its references |
| a "line" (shared DNA) | a **style** for characters |
| "shared subjects" vs "products" | not a type difference. Compositions reference compositions |
| a "slot" | an empty reference |
| Subject (layer, "the address of an asset in a bundle") | a **member** — a position, not a noun |

A mascot and a deck are the same shape: a name, member assets, its own assets, references, exports.
They differ in what they are FOR, never in what they ARE. Three nouns survive — `asset`,
`composition`, `style` — and `bundle` is gone as a word.

⚠️ `asset` keeps its single meaning: **one produced file**. Calling the reusable named things
"assets" was the `engines`/`inference` mistake starting over.

### There are no levels

Two wrong answers in two days: first `bundle > item > asset` containment, then "references may nest
but the UI shows one hop". The operator killed the second with one question — *would that allow
`work > universe > story`?* It would not.

**References are a graph, not a tree. The UI shows one composition at a time, with its references as
links** — the way the web works. No nesting, no depth, no breadcrumb trail. Hierarchy is *emergent*
when references line up, and three-deep chains cost the app nothing because nothing has to know.

miraverse needed structural hierarchy because its bundles were folders that had to be git-diffable.
That is not a reason here.

### Styles live with the section that uses them

I carried content-factory's central style registry across. It belonged there because the *factory*
was the product; here the sections are, and "where do I find image styles?" should have an obvious
answer. So: image styles under 🖼 images, pack styles under 🏷 packs, one uniform rule — **any section
may have a `🎨 styles` view** — and no `workbench` group.

**Media styles are TECHNIQUE ONLY**: flat vector, pencil sketch, watercolour. Not themes. My
"catalan-folk" example was a *what*, not a *how*, and the operator was right to reject it — themes
belong in the sentence or in a referenced composition. Technique-only keeps the list short, stable,
and safe for xoko to author into.

**Transformations belong to the composition**: colouring, die-cut, isolation, bleed. A sticker is
isolated with a margin whatever technique drew it. Filing those as style variants (the "treatment
axis") put a product requirement inside an unrelated object.

**Rejected: one style identity with per-medium realizations.** Elegant, and it solved a problem —
art and frame drifting apart on a card — that a *reference* solves without merging anything: a
composition style names the media style it defaults to.

### References are typed, and that IS a kind definition

`character required 1 · artifact optional any` — cardinality on a reference is simultaneously how
compositions interlink and the entire definition of a composition kind. `required` is what lets the
✍ dock ask the right question instead of showing a blank box.

This also collapsed two concepts into one: **a composition kind IS the section definition** xoko
authors. There was never a separate thing.

### xoko: a popup, not a section

Not 🌱 grow in the nav. A persistent **xoko** button, available anywhere, because the assistant should
be where the data is rather than somewhere you navigate to.

The design that makes it fit in a small popup: **the popup is the conversation, the feed is the
result.** Ask for a style while looking at 🖼 images, the probes render into the feed already in front
of you, and you keep or discard with the ★ and 🗑 that exist. xoko needs no gallery, no ledger and no
surface of its own.

It **creates or pulls** — an LLM-authored definition or one installed from a catalogue — and both
land in the same user layer through the same keep/discard. Pulling is creating with a head start, not
a second mechanism. And it only ever *proposes*; the day it presses buttons on the user's behalf,
"what did it just do to my library" becomes a question, against an undo we have deliberately not
built.

---

## 2026-08-03 (late) — The app grows by data: five verbs, selections, and one identity per style

A design session, no code beyond settings. Everything here reverses or sharpens something written
earlier the same day, which is why it is worth an entry.

### Settings are sections, and quality is a MEDIA fact

The `masterLossless` toggle went in the 📁 library section. Wrong shelf: the library section answers
*where your work lives*, and quality answers *how it is written*. Worse, quality is not a boolean —
image is compression, music is bitrate, video is CRF — so an image-shaped answer was being given to a
question the app will ask five times.

**⚙ settings is a GROUP of sections** (📁 library · 🖼 media · 🔌 inference · 🧩 engines), and 📁 keeps
doing exactly what it did. Quality is `quality: { image: 'balanced' | 'exact' }` — one named level per
medium, declared in one table, with the encoder mapping levels to options. The provenance field is
`quality: string` rather than `lossless: boolean` for the same reason: a boolean only means something
for images.

And the real complaint underneath it: **the rationale was in the UI.** A settings section gets a word
and a number; the paragraph explaining the trade belongs here.

### ★ and delete — not 👍/👎

👎 only ever meant "hide this everywhere": a delete that frees no disk and shortens no list. With a
real delete it is a second state for *not good*, and one of them is redundant. So: **starred /
unstarred, and delete.**

**Rejected: a trash, or keeping the recipe so a deleted asset could be re-rendered.** I proposed
appending per-asset seeds to the run record and was wrong on the app's own terms — provenance is
embedded *in the file*, which means the record has exactly one lifetime and can never be orphaned.
A log of things that no longer exist reintroduces the orphan problem that embedding solved, and then
needs its own rule for when *it* gets deleted. Generation is cheap and the user is an adult: delete
is a delete.

Rating is also **a filter, not a gate**. It is available everywhere, it is never a step anyone must
complete, and selection into a bundle stays explicit.

### Bundles are selections, not containers

The earlier `bundle > item > asset` tree assumed you create a container and fill it. Real work runs
the other way: you make card designs and a deck emerges; you make mascots and a family emerges. A
bundle is therefore **a list of references** — see PLAN §4b for what that buys, the short version
being that one asset can sit in several bundles, nothing is orphaned, and both directions of work
become the same data.

It also dissolves the depth question. Not three levels — **two kinds** (asset, bundle), references
between them, one hop shown in the UI. A source (a book, a brief) is a **citation the assets carry**,
not a container; `work > universe > story` in miraverse came from bundles needing to be git-diffable,
not from the domain.

### The verbs are the thing that ships

I said xokogrow "cannot invent a primitive" and then filed *composition* as a primitive — which made
cards look permanently blocked when they are blocked exactly once. The right unit is the **verb**:
five generic machines (generate · transform · compose · assemble · export) whose inputs are data.
Build the compositor once and every layout after it is a JSON document.

What is genuinely fixed: **the verb count and the media**. What grows freely: sections, layouts,
palettes, styles, bundle definitions, engine rows. A machine's *vocabulary* grows too, but slowly and
generically — adding a word to the compositor is routine, adding a sixth verb is an argument.

**Sections are capabilities; contexts are arguments.** No stickers section nested under mascots —
that is the stickers section with a mascot in its subject slot. Duplicating a capability to bake in an
argument is how a nav rots.

### A style is one identity, realized per medium — not a style per medium

Cards are the proof: art is generated in a style and then a frame is composed around it. Style cannot
belong to `generate` (the frame would not know its colours) or to `compose` (the art would not know
its look). It sits above the verbs. Per-medium styles would make one identity exist twice and drift
from the first edit. A style declares only the realizations it has; missing means default.

---

## 2026-08-03 (night) — One stored format, and the check that was watching nothing

Two things, and they are the same shape: **a fact filed one level up from where it is true**, and
**a check that could not see the layer that broke**.

### `npm run check` was green and the app could not render

The request key was renamed `engines` → `inference` across the types, the parser, the shelf, the
registry and the tests. Every check passed. The app returned
`request engines: unknown field — nothing reads it; request inference: expected an array, got
undefined` on every press, because the one file that *writes* the payload —
`web/lib/pipelines/images.js` — is plain JS that `tsc` never sees.

**The seam between the browser and the parser has no type, so it gets a test.**
`tests/request-shape.test.ts` reads every payload builder in `web/lib/pipelines/` and checks the
top-level keys it returns against `REQUEST_KEYS`. It is a brace walk over source text, which is not
elegant — and it fails on exactly the bug that shipped. A guard that would have caught the failure
we actually had beats a prettier one that would not.

**Rejected: a fixture that mirrors the builder.** A hand-copied payload drifts from the builder as
easily as the builder drifted from the parser, and then the test agrees with nothing.

**Rejected (for now): `checkJs` over `web/`.** A real type across the seam is the right answer, but
the front end imports with `?v=` cache-busting suffixes that `tsc` cannot resolve. Worth revisiting
when the versioning scheme changes; not worth reshaping the front end for today.

### Masters: WebP either way, lossy by default, exact by choice

The question was "PNG or WebP" and the premise was wrong — there was only ever **one stored format**
(`.webp`); PNG appears only where the clipboard demands it. The real question was whether a *master*
should be lossy at all.

Measured, on a real 1024² render: **112 kB lossy q92 · 623 kB lossless · 1133 kB PNG**. One extra
lossy pass moves **31.6% of channel values** (max delta 9); a lossless pass moves none.

So: **q92 default, `masterLossless` in the 📁 section.** The first proposal here was lossless as the
default — correct about exactness, wrong about the app. 5.5× the bytes on every render, to protect a
Phase 2 cutout gate that does not exist yet, is paying now for a maybe. What exactness is genuinely
worth it for — line art, cutout borders, print exports — the user knows in advance and can turn on.

**A LIBRARY setting, not a per-run one.** A folder where some masters are exact and some are not,
for reasons nobody remembers a month later, is worse than either choice made once.

**The encoder is read from `provenance.lossless`**, not passed beside it. A flag next to the record
is a flag that can disagree with it, and "is this file exact?" would then have two answers. One
field decides the encoding *and* describes it.

**PNG is a boundary format.** Clipboard now, LINE and KDP later. Exports converting to PNG is the
export layer doing its job — that is a layer distinction, not a duplicate.

### Legacy, deleted rather than migrated

`~/Library/Application Support/xokolat/content`, the stale index cache and the verdicts pointing into
it are gone. Every master in there was lossy and predates the record field, so converting would have
produced files that are neither exact nor honest about it. The rule allowing a library *under* app
data stays — the checks here are about what would break, not about taste — but the migration
rationale attached to it does not.

---

## 2026-08-03 (evening) — The library is the user's, and it lives where they can see it

Reveal worked. It opened `~/Library/Application Support/xokolat/content`, which is where I had been
putting the operator's work — and that was the useful part of the experiment.

**App data and the library are different kinds of thing.** App data is state the app manages and the
user never opens: registries, verdicts, the index cache, provisioned models. `~/Library/Application
Support` is exactly right for it. The library is *the user's work*, and Application Support is
exactly wrong for that: hidden in Finder, not where anyone looks, not what people expect their
backups to cover. Draw Things has the same problem for the same reason (`~/Library/Containers/…`) and
people complain about it constantly.

**New default: `~/Documents/xokolat`.** Not `~/Pictures`, even though images come first — this app
also makes songs, voice, 3D and PDFs, and one bundle split across `~/Pictures`, `~/Music` and
`~/Movies` stops being a bundle.

### Configurable, but not asked at install

The maintenance worry — "a chosen path means paths everywhere become configurable" — was already
answered by a decision made in commit 1: `src/paths.ts` is the only place allowed to compute a root
and `resolveIn(root, …)` the only way to build a path under one. Making the root user-chosen changed
one function.

The real cost is elsewhere, and it is small: **a chosen path can stop being valid** (unmounted drive,
renamed folder, offline share, TCC permissions once packaged). So it is checked at every startup and
the failure is **not fatal** — an app that refuses to start is an app whose settings the user cannot
reach. It starts, says what is wrong, and 📁 is where they fix it.

**Rejected: asking at first run.** A "where would you like your files?" modal is a tax collected in
the first minute, before anyone knows what the app makes or how big it gets. Photos, Music, VS Code,
Ollama and LM Studio all default-and-let-you-change; Photoshop asks about scratch disks and everyone
remembers hating it.

**Rejected: several libraries.** Lightroom-style "which catalog?" is where this gets genuinely
expensive — every feature after it grows a "which one?" question. The thing to refuse is *N* roots,
not a configurable one.

**Rejected: moving files on change.** New work goes to the new place; the old library stays where it
is and stays readable by pointing the setting back at it. Verified both directions.

**Rejected: content inside the install folder** — the one variant that cannot work. A signed `.app`
is not writable and an update replaces the bundle.

Two are security decisions rather than taste: **`~` and `/` are refused**, because everything under
the library is served over `/content/…` and this app is reachable over a tailnet — pointing it at the
home directory would publish the home directory. So is anything inside the install root.

### And two things reveal exposed

**Drag-out is back.** The same change that stopped the artwork being a link also set
`-webkit-user-drag: none`, to keep a drag from being misread as a click. That traded something
valuable — dragging an image into Finder, Slack or Figma — for a minor annoyance. Undone.

**Copy-image is new**, and is probably used more than reveal. The clipboard takes PNG rather than
WebP, so the master is re-encoded in the browser; the `ClipboardItem` is handed a *promise* because
Safari requires it to be constructed inside the gesture.

Reveal stays. It was partly compensating for a location nobody could find; with the location fixed it
is an ordinary Finder-integration affordance. Two known limits, both for Phase 4: under Mac App Store
sandboxing `open -R` from a Node subprocess will not work (it has to go through the native layer),
and if you reach the app from a phone over Tailscale, reveal opens a Finder window on the Mac.

## 2026-08-03 (later) — Inference and engines are two words, two sections

The morning's fix put the model list inside the engine card. Using it showed that was the **same
filing error one level up**: a settings card became a wall, and the thing you actually wanted to look
at (what can I ask this for?) was buried in the thing you rarely look at (is it running?).

### The vocabulary

| | is | has |
|---|---|---|
| **inference** | the SERVICE that runs — Draw Things, ComfyUI, Ollama, a cutout daemon | an install/running state you could be asked to fix |
| **engine** | what a service can be ASKED FOR — a checkpoint, or a capability that is not one | facts and knobs, never a running state |

**"Engine" and not "model"** because not every one is a model: a background remover belongs in the
same list as a checkpoint, and "models" would have excluded it. That was the operator's call and it
is the right one — it also resolves an old awkwardness where a cutout *operator* sat as a peer of
Draw Things in one flat registry. Now the rembg service is an inference row and birefnet is an engine
under it, exactly like Draw Things serving klein.

Renamed in **one pass**, all the way through — `registries/inference.json`, `InferenceRow`,
`src/inference/`, `request.inference[]`, `/api/inference`, and every reference in `PLAN.md`. Half-
renamed vocabulary is worse than either name, and this was the last cheap moment to do it.

**Two places keep the old common vocabulary on purpose**, and both are outward-facing: the provenance
record still calls the checkpoint `model`, and so does the `params.model` knob that goes on the wire
to Draw Things. Those speak to readers outside this app; the sections speak to the person using it.

**`role: generator | operator` stays.** I speculated it could retire and that was wrong: it separates
*pickable for a run* from *invoked by a builder*, which is a different question from inference vs
engine. A cutout daemon is an inference row that never appears in the per-run picker.

### The right panel got boring

Every paragraph added to a dock band the previous day is deleted. The 🔌 section's ⚙ band is empty;
its ⓘ shows the service you clicked, with its caps. The 🧩 section's ⚙ band is one ↻ button. The
three-sentence explanation of what earns a row lives in the source comment where it already was.

### Images

**`durationMs` joins the provenance record** — per asset, not per job, because a job with `count: 4`
is four renders and a 4-step engine against a 28-step one is the difference the number exists to
show. It is on the tile footer (the scanning surface) and in ⓘ. Absent on every master written
before today, and an absent value is never drawn as zero.

**The artwork stopped being a link.** It made clicking an image open a tab and *never select it* —
the ⓘ band was reachable only by hitting the 8px of padding around the picture. A click selects, a
double-click opens full size.

**Download is gone**, replaced by ⤢ full size · 📁 reveal · ⧉ path. The app already wrote the file to
the user's disk; offering to write it again is web thinking. What an app owes is a way to reach it.

⚠️ **`/api/reveal` is the first thing in this app that leaves the process.** §15 rule 1 is kept, not
bent: the browser sends a content-root-relative *path*, never a command; the command comes from a
three-row platform table; it is spawned as an argv array with no shell; and the path is resolved
against the content root first. The worst a hostile request achieves is opening the Finder on a file
inside the content folder.

### Two things that fell out

**The index cache is versioned.** Renaming `ManifestCell.engine` → `inference` left every cached cell
in the old shape with an unchanged mtime, so the front end read a field that was not there. A
`CACHE_VERSION` makes that impossible rather than merely unlikely — bump it whenever `ManifestCell`
changes.

**One catalog cache, shared.** The Draw Things adapter had its own, separate from the shelf's. A ~40s
cold scan should be paid once by whoever asks first.

## 2026-08-03 — Three corrections after Phase 0 was usable

> ⚠️ **This entry predates the rename above.** Read "engine" here as **inference service** and
> "model" as **engine**; `src/engines/` is now `src/inference/` and a row's `models` is its
> `engines`. Kept in the original words because it is a record of what was decided when.

Phase 0 met its gate and was then used, which is a different test. Three things were wrong. All
three had the same underlying shape: **a fact filed one level up from where it is true.**

### 1. Caps resolve engine ← model. The model level did not exist.

**Symptom, not an argument:** SDXL rendered at 4 steps. The registry declared `stepsLocked: null` on
Draw Things — true, the server locks nothing — and the ⚙ band defaulted steps to 4 — true of klein
and of nothing else. Both statements correct, about different things, with nowhere to put the second.

**Now:** an engine row carries `models`, each a `CapsPatch` (a partial `caps`, stating only what it
changes) plus that checkpoint's own knobs. Merge order is `engine.defaults → model.params →
request.params → engine's own params`. Picking a checkpoint brings its numbers with it.

**A partial `caps` is an error on an engine and the normal case on a model.** That asymmetry is
load-bearing, not an oversight: an engine that half-declares has left a capability undeclared; a
model that half-declares has said "this one differs here and nowhere else".

**⚠️ `models` is not an inventory** — three states (`known` · `discovered` · `declared`) come from
merging it with the engine's live catalog. Rejected: inferring facts from filenames (`flux` in the
name → 4 steps), which is the exact thing `caps` exists to stop, and which would guess wrong on
`flux_1_dev` immediately.

**Rejected: a `workflow` noun.** The factory has three orthogonal palettes here — workflows, per-model
defaults, styles. Models and defaults are the same row, so they were collapsed into one. A *workflow*
only earns a separate noun once it carries a control stack (refs, IP-Adapter, ControlNet, LoRAs);
until then it would be a model with ceremony. Revisit in Phase 2, when references exist.

**Rejected: a "known models" table separate from the engine's rows.** Two registries to keep in step,
to avoid showing a stranger four absent checkpoints — which the `declared` state already handles
quietly.

One consequence worth keeping: the catalog cache is now **shared** by the shelf and the render path
(`src/engines/catalog.ts`). The adapter had its own. A ~40s cold scan should be paid once, by
whoever asks first.

### 2. The feed is a sheet. A group is provenance, not a layout unit.

Twelve one-off renders drew as twelve stacked full-width bands, each with a header repeating what
the ⓘ band already says about anything picked. A log, not a gallery.

**Now:** consecutive single-cell groups flow into one dense grid; a multi-cell group keeps its framed
card, because *there* the header is the entire point. Adjacency is free — cells of one press share a
timestamp — so the collapse costs only the repeated header.

**Rejected: dropping grouping.** It is right, and it is the whole comparison feature. What was wrong
was drawing it as a *block* in the single-cell case.

**Rejected: keeping 👁 squint alongside the new S/M/L size control.** Two controls for one question is
how they drift apart. Squint's remaining CSS is dormant, kept for the Phase 2/3 shelves that had it.

⚠️ `web/lib/gallery.js` is therefore **no longer verbatim** from content-factory. Everything else in
it should stay diffable against the factory's copy.

### 3. 🔌 engines belongs to settings, not the workbench.

`PLAN.md` §8 listed it under workbench while Phase 1 was headed *"engines are a settings section"*.
The list was the stale line; the code had followed it.

The workbench is where you **make** things — styles, artifact wording, DNA — and everything in it
produces content. Engines are infrastructure: what is installed, what is reachable, where the models
live. Settings is also where Phase 1's other rows go (content location, appearance, defaults), so the
group earns itself immediately.

---

## What this episode says about the process

All three were invisible to review and obvious after ten minutes of use. Three rounds of cold reads
on the plan found none of them, because none is a *reasoning* error — they are facts that only
present themselves when something runs.

The standing recommendation from planning holds and is now evidenced: **build the thing, then judge
it.** Review the plan for contradictions (§8 vs Phase 1 was exactly that, and a reader did catch that
class); use the software for everything else.

## 2026-08-29 — the plug moved into ⚙, and stopped being app-wide furniture

**What changed.** The engine stack — one row per capability, saying which recipe answers it — was a
popover anchored to the ask bar, with a TAB PER MEDIUM. It is now the top of the section's own ⚙
band, showing that section's medium and nothing else. The chip under the sentence stays, as a
readout that opens ⚙ (or 🔌 for xoko's own brain, which has no section). The stored key is
`xokolat:plug:<kind>` — one word, matching a composition's `xokolat:plug:<comp>:<step>`, which has
existed since 2026-08-24.

**Why.** Two faults, one cause. It put a DEFAULT in the place you TYPE, and it made "which engine
answers this" a question asked once for the whole app. The second is what a chain cannot live with:
a composition's third step may want a different i2i from the shelf's, and may need one from the same
family as its first step. The tabs were the tell — they existed only because the key was app-wide,
so the setting had to be reachable from anywhere, so it could not live in a section. Twice I
collapsed them and twice put them back with "the section says which medium you are LOOKING AT, not
which engine it will USE"; that is true only while the key is global, and it dissolves the moment
the answer lives where the ▶ is.

**What I nearly got wrong.** I proposed `xokolat:plug:<section>:<kind>`. A KIND DECLARES ITS MEDIUM
and a medium has one section, so the section is derivable from the key it would be added to — the
same argument that removed the medium from this key on 2026-08-13. A composition is the one thing
that genuinely needs its own answer and already has one, at a finer grain: per STEP, because two
steps of one chain can want two different recipes. No second tier for media; one word at two levels.

**Cost.** Every remembered ★ resets once (the key prefix changed) and falls back to the library's
own default. It is a preference, not work.

## 2026-08-29 — xoko reads the plug where the press will happen

**What changed.** The map (`web/lib/xoko-map.js`) prints, on a composition's own row, what each of
its making steps would run on — `founder → draw-things-grpc/dev-fast · mascot → rembg/cutout` — and
the per-medium block below it now says out loud that it does not answer for a chain. Two prompt
rules that only made sense while arming was app-wide are gone: the comment claiming a brain "cannot
pick their checkpoint" (attached, wrongly, to the rule about not inventing subjects), and the make
rule ending "never name a model, a checkpoint or a setting: they have already chosen those, you
cannot see them". Everything still says `plugged` rather than `armed`.

**Why.** A chain's engines are per STEP and are not the shelf's, so the only recipe the map named
was the wrong one to name — asked "what would the mascot chain run on?", xoko either said nothing or
answered with the image section's plug. And the forbidding rule had been false since the bracket
grew `recipe`: a prompt that forbids what the line above it offers teaches a brain to distrust the
map, which is the one thing in this design that has to be believed. What survives of it is the part
that was always the point — the prompt is a description of a picture, and a checkpoint name is not a
description of anything.

**Still true, and now said in the right place:** a sentence may name another RECIPE for the medium
it asked for, and cannot reach past a recipe to the checkpoint, the sampler or the step count.
Those are the machine, edited once in 🔌.

## 2026-08-29 — a recipe declares its lineage, and a chain sorts on it

**What changed.** `Recipe.lineage` — an optional slug naming the base-model family (`flux-1`,
`flux-2`, `sdxl`, `ace-step`, …), published by the library and carried through `ResolvedRecipe` into
each `StepOption`. A composition's ⚙ band groups a step's engine list by whether the option is from
the same family as the picture that step is HANDED, and marks the step's readout when what is
plugged crosses families.

**Why this is a chain problem and not a shelf problem.** Inside one press the components already
have to match — checkpoint, CLIP, VAE, sampler, every adapter — and that is precisely what a recipe
IS, which is why the unit you plug is a recipe and never a component. Offering "default checkpoint"
and "default encoder" as separate settings is the only way to assemble an incoherent press, and it
is not offered. The constraint nothing modelled is the one ACROSS presses: an SDXL IP-Adapter handed
a FLUX founder renders something plausible and wrong.

**Three rules that make it usable rather than noisy.**
1. **It orders, it never forbids.** Every recipe that can answer a step is still in the list.
   Crossing families is sometimes the ask, and finding out costs one press.
2. **Absent means family-blind, not unknown-and-suspect.** `rembg/cutout` reads any picture there
   is. It declares nothing, sorts with the relatives, and is never marked. Only a DECLARED
   difference is a difference.
3. **Only a PICTURE slot carries the constraint.** `founder` takes its prompt from a text step;
   words cross every family there is. What propagates is pixels — `ref`, `look`, `control`, `mask`,
   and a `pick` passing on what it chose from.

**Declared, never sniffed off a filename.** A guess that is right nine times is worse than no guess:
the tenth is a mismatch the app marked as compatible.

**Where it is required:** the library's `check.mjs` demands it of any recipe stacking a control or a
LoRA — an adapter file is built against one base, so such a recipe has a family whether or not
anybody wrote it down.

## 2026-08-29 — the right pane is resizable

**What changed.** The shell's third column was a fixed `360px`; it is `var(--right-w, 360px)` now,
and a grip on the pane's left border drags it. Remembered per browser as `xokolat:right-w`.

**Why now.** The ⚙ band became the longest thing in the app when the engine stack moved into it —
a block per composition step, each with an engine menu and its knob rows — and 360px is exactly
where the family optgroup labels get cut. That is a limit found by use, not a preference.

**The decisions inside it.**
- **Width is not a fourth state.** `shut · tabs · queue` stays one value; `shut` is the grid's own
  `0` and the remembered width is what `tabs` and `queue` come back to. Nothing about the pane's
  state writes the width, which is why the width survives being shut.
- **Drag past the edge and it shuts** (under 200px), the behaviour every editor with a side panel
  has — it makes the floor mean something instead of being a wall you push against. The width is
  NOT written on that release, so reopening restores what you had. And the close is SHOWN COMING:
  the pane pins at its minimum and dims while the drag is still live, so moving back cancels it.
- **The floor is the form, not a round number** — 280px, because the ⚙ rows are a 96px label plus a
  value and an open recipe list indents 52px.
- **The ceiling is the feed's floor from the other end.** The centre is `minmax(0, 1fr)` and will
  shrink to nothing without complaining; 190px of nav plus 330px of feed is what the right column
  may never eat into.
- **Pixels, never a percentage.** A percentage of a window that has since changed is a different
  number from the one you set. Stored raw and re-clamped on every read and every window resize —
  and a resize does NOT overwrite the stored number, or undocking a laptop would cost you the
  width you chose on the monitor.
- **No auto-close when the window narrows.** Dragging it shut is you closing it; closing it because
  the window changed is the app deciding, and reopening it later would be a second surprise. The
  ceiling already prevents the unusable case. (Below 860px the pane is a slide-over sheet and the
  grid is one column — the grip does not exist there at all.)
- **Arrows and a double-click reset**, because a handle only a mouse can reach is a control some
  people cannot use.
- **Nothing repaints during the drag** — one CSS variable per animation frame, and every panel
  inside the column is already `flex: 1`.
