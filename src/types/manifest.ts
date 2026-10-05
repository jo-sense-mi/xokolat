// THE MANIFEST — the contract between the lifted vanilla-JS front end and the new TS server,
// which is why it is the first thing `tsc` protects (PLAN §9).
//
// GROUPING IS THE GENERAL CASE. A group is one ASK (one press, one run folder); its cells are
// the services that answered it. A lone render is a group with one cell, an A/B is a group with
// several — so comparison needs no mode, no tabs and no run picker.
//
// ⚠️ Bundle subjects do NOT project into `media`. A media run puts the service in the PATH; a
// bundle subject puts it in the FILENAME beside a stable master (`main.webp`,
// `alt-<engine>.webp`), because a candidate set is a property of one subject rather than a
// group of its own. The shared gallery stays "one component over one index" precisely because
// that index is media runs; the sticker shelf is a different view of different data.

import type { Medium } from './medium.ts'
import type { ProvenanceIdentity } from './provenance.ts'

/**
 * How the browser plays a cell's preview.
 *
 * ⚠️ AND THE LAST ONE IS "IT CANNOT" (2026-08-17). `img` and `audio` are the two tags a browser
 * has for a master this app writes; a `.glb` has no third tag, and every viewer that would draw
 * one is a script from somewhere else. `file` is the honest answer — the card says what it is and
 * how big it is, and ⤢ hands it to whatever on this machine opens meshes. A medium claiming a
 * player it has not got would render an empty box in a grid whose whole job is showing you what
 * you made.
 */
// ⚠️ `mesh` JOINED THEM ON 2026-08-30. It is not a tag the browser has an element for: it means
// "read the triangles out of this and draw them with WebGL2" (web/lib/glb.js, mesh-view.js),
// and the still that comes out of the first draw is written beside the master so every later
// paint is an ordinary <img>. `file` stays for a master nothing can draw at all — a bound PDF.
export const PLAYERS = ['img', 'audio', 'video', 'file', 'mesh'] as const

export type Player = (typeof PLAYERS)[number]

/** A reference the ASK consumed. It belongs to the group, not to a cell: every cell got the
 *  same ones. */
export interface ManifestRef {
  readonly role: string
  readonly name: string
  readonly url: string | null
}

/** ONE ASSET — one produced file and its provenance. A group's cells are the services that
 *  answered the ask, times however many assets each was asked for. Indexed only when the master
 *  is on disk: a crashed job leaves a folder behind, and a card for a file that isn't there is
 *  worse than no card. */
export interface ManifestCell {
  /** The INFERENCE SERVICE id, which is also this asset's parent path segment. The engine
   *  (checkpoint) it used is in `gen.model` — two different questions, two different fields. */
  readonly inference: string
  /** The ASSET's identity: its content-root-relative path. Also the gallery's selection key,
   *  which is why it is the master's own path and not the folder — `count: 3` puts three
   *  assets from one engine in one folder, and they are three cells. */
  readonly path: string
  /** Content-root-relative master file. */
  readonly master: string
  /** What the browser renders. The master itself for image/audio; a poster for formats a
   *  browser cannot show (a `.glb`'s `preview.png`). */
  readonly preview: string | null
  /** ⚠️ STABLE and SERVER-SIDE, never invented client-side — a reshaped index must never
   *  orphan a rating somebody gave. */
  readonly ratingKey: string
  /** Read from the master's embedded record at index time; null when the file carries none
   *  (imported, or written before this app). */
  readonly gen: ProvenanceIdentity | null
  /** Projected from the embedded record so the gallery's facets can filter without opening
   *  files. Late user edits live here only, and never rewrite the master (PLAN §6). */
  readonly tags: readonly string[]
  readonly createdAt: string | null
  /**
   * HOW LONG IT PLAYS, in seconds — audio only, and null wherever the file would not say.
   *
   * ⚠️ NOT `gen.durationMs`, which is how long the RENDER took. A song is the one asset where the
   * two are both times, both about the same file, and wildly different: two minutes of music took
   * seven minutes forty to make. A list of songs scans on this one (src/content/audio.ts).
   */
  readonly seconds?: number | null
}

export interface ManifestGroup {
  readonly medium: Medium
  /** The run folder name — server-minted `<slug>-<ts>`. */
  readonly run: string
  /** Content-root-relative run folder. */
  readonly path: string
  /** The slug the server derived from the request text — the run FOLDER, minus its timestamp. A
   *  path, and the last resort for a name. */
  readonly slug: string
  /**
   * WHAT TO CALL IT — the name a person gave this run, or the one the server read off the ask
   * (`titleFrom`, src/content/run.ts). Null only for a run recorded before names existed.
   *
   * ⚠️ THIS IS WHAT A LIST SHOWS, and `ask` is not. A media list that scans — 🎼 and 🗣 open as
   * one — put the whole generation prompt in its first column, which for a song is the tag soup
   * you tell the model rather than anything you would call the track.
   */
  readonly title: string | null
  readonly player: Player
  /** What was asked for, in the user's words. */
  readonly ask: string | null
  readonly refs: readonly ManifestRef[]
  readonly createdAt: string | null
  readonly cells: readonly ManifestCell[]
}

/**
 * 🧩 ONE ASSET A CHAIN MADE — a cell, plus which step of which run made it.
 *
 * ⚠️ THE MEDIUM AND THE PLAYER RIDE ON THE CELL HERE, and on the GROUP in `media`. That is not an
 * inconsistency: a media run is one ask answered by N engines, so every cell in it is the same
 * medium by construction. A chain run is a SEQUENCE — a brief, a picture, a cut-out, a song under
 * it — and asking a group of those what medium it is has no answer.
 */
export interface ChainCell extends ManifestCell {
  /** Which step made it. */
  readonly step: string
  /** The press's own run folder inside the chain run — how a running chain finds what it just made. */
  readonly run: string
  readonly medium: Medium
  readonly player: Player
}

/**
 * 🧩 ONE RUN OF ONE CHAIN — everything one press of ▶ made, and the one card it is in its
 * composition's feed.
 *
 * ⚠️ A SECTION KEEPS WHAT IT MAKES (2026-08-24). These are not in `media` and never appear on a
 * medium's shelf: you go to 🧸 to look at your mascots. It is also why a chain run is ONE group
 * rather than one per press — the twelve candidates, the one you chose and the cut-out of it are a
 * single act, and splitting them across a feed is the same mistake as splitting them across
 * folders.
 */
export interface ChainGroup {
  /** The composition's slug — which chain made this. */
  readonly composition: string
  /** The chain run folder name — server-minted `<slug>-<ts>`. */
  readonly run: string
  /** Content-root-relative run folder. */
  readonly path: string
  /** What to call it: the name somebody gave the run, or the one read off the sentence. */
  readonly title: string
  /** The sentence the chain was run on. */
  readonly ask: string | null
  readonly createdAt: string | null
  /** Everything its steps made, in the order they were made. */
  readonly cells: readonly ChainCell[]
  /** What its `text` steps wrote. A field on the run, never an asset — there is no 📝 shelf.
   *  `items` is the answers as the step produced them, when there was more than one — what a
   *  resumed run reads, because splitting `text` on newlines is not the same list. */
  readonly wrote: readonly {
    readonly step: string
    readonly text: string
    readonly items?: readonly string[]
  }[]
  /** What each `pick` step chose, so resuming does not stop and ask again. */
  readonly picked: readonly { readonly step: string; readonly master: string }[]
  /** Why the run stopped, on the step it stopped at. Null for a run that finished, and for one
   *  still going. */
  readonly failed: { readonly step: string; readonly why: string } | null
  /** The file the chain was FOR, when it ends in a bind. Not a medium, and on no shelf. */
  readonly bound: {
    readonly master: string
    readonly step: string
    readonly parts: number
    readonly bytes: number
    readonly ratingKey: string
  } | null
  /** What this run installed into the app — `composition trading-card-maker`. Null until ＋ install
   *  is pressed on what one of its steps wrote. See ChainRecord.installed. */
  readonly installed: string | null
  /** ⚠️ STABLE and SERVER-SIDE, exactly as a cell's is — a run can be starred and deleted whole. */
  readonly ratingKey: string
}

/** What `/api/manifest` serves. A DERIVED CACHE (PLAN §9): persisted in app data, updated
 *  incrementally by mtime, full rebuild explicit — embedding provenance means a full rebuild
 *  opens every file, so it is not a page-load hot path. */
export interface Manifest {
  readonly generatedAt: string
  /** Newest first — the one order a library of one-off assets can be browsed in. */
  readonly media: readonly ManifestGroup[]
  /** Newest first. One entry per press of a 🧩 chain's ▶ — everything that press made. */
  readonly chains: readonly ChainGroup[]
}
