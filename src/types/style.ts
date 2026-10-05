// STYLE — layer 3 of the classification: reusable settings that shape what a verb produces
// (PLAN §4a).
//
// ⚠️ ONE LIST, ALL OF IT THE USER'S (changed 2026-08-04). The shipped file is a SEED, copied into
// app data on first run and never consulted again. There was briefly a two-layer read with an
// `xk:` / `user:` namespace and a "copy to mine" button before you could edit a shipped entry —
// bureaucracy invented by the implementation. This is a local app with one user; everything in
// it is theirs, and the editor is the product while the seed is not.
//
// ⚠️ Was called PALETTE until 2026-08-04. The layer, the directory, the endpoint and the request
// field all say `style` now, because that is what the model calls it (PLAN §4c) and one name for
// one thing is the rule this project keeps re-learning.
//
// ⚠️ MEDIA STYLES ARE TECHNIQUE ONLY — flat vector, pencil sketch, ink linework. Not themes: a
// "catalan folk" entry is a *what*, and belongs in the user's sentence or in a referenced
// composition. Technique-only is what keeps the list short, browsable, and safe for xoko to
// author into.
//
// What ships is SEEDED THIN: a handful of generic entries. The operator's curated taste — the
// ★ rankings, tested drawPrompt strings, culture pools — stays in their factory, and a
// Japanese user needs a different lexicon than a Catalan one anyway. The editor is the
// product; the seed is not.

import type { Medium } from './medium.ts'
import type { Params } from './request.ts'

/** One entry in a section's style list — an image style, a music genre, a mascot's DNA.
 *  The control is labelled per medium; the shape is one. */
export interface Style {
  /** Unique within its layer and medium. Lowercase kebab.
   *
   *  ⚠️ IDENTITY: the ★ key and the swatch path are built from it, so renaming one loses both.
   *  Nothing about how a style is FILED may be encoded in it — see `collections` below, which is
   *  the one axis a style is browsed by and is a list of names rather than a prefix. */
  readonly slug: string
  readonly label?: string
  /** What this look IS, in a sentence a person reads before picking it — and what it is bad at.
   *
   *  ⚠️ IT TRAVELS. A style downloaded from the library arrives with the sentence its card carried;
   *  dropping it on import would mean the shelf in here reads worse than the shelf it came from. */
  readonly notes?: string
  /** WHICH COMPOSITIONS THIS STYLE HAS BEEN USED FOR — the library's own family names
   *  (`one-offs`, `mascots`, `sets`, and whatever lands next), because that is the word a person
   *  already has: they installed a composition, and they are looking for a style to run it in.
   *
   *  ⚠️ A CLAIM, NOT A SCOPE. It says somebody checked this style on that job. A style holds as many
   *  as are true, stays ONE entry, and is never forked: `ink-linework` copied into a mascots list and
   *  again into a stickers list is two copies that drift, and a fix to the negative list gets made
   *  once. Tagging is free; forking is not.
   *
   *  ⚠️ AND IT IS NOT WHERE THE FRAMING GOES. "isolated on white, full body, centered" is what a
   *  MASCOT is — a format requirement belonging to the step that renders it, not to the style. What
   *  may legitimately differ per composition is the TECHNIQUE (coloring line art needs closed
   *  contours and no shading), and when one does it belongs in a `regimes` override, never a copy.
   *
   *  Open, because the vocabulary lives in the library and grows with it. */
  readonly compositions?: readonly string[]
  /**
   * WHICH COLLECTIONS THIS STYLE CAME IN — written by the take, never published on the style.
   *
   * ⚠️ IT IS WHAT STOPS A COLLECTION FROM BEING A DOWNLOAD FILTER (2026-08-29). You press ⤓ on
   * "picture book" and four styles land; without this you would have four loose entries and would
   * have thrown away the one thing that made them a set. Your shelf groups by it, so the frame you
   * chose from is the frame you keep.
   *
   * ⚠️ A LIST, AND OVERLAPPING. `soft-watercolour` is a way of putting paint on a surface AND a
   * picture-book register; the take writes every collection the library had it in, not only the
   * header you happened to press, or your shelf would group it differently from where you found it.
   *
   * ⚠️ AND IT IS CUT LOOSE LIKE EVERYTHING ELSE. Re-editing "picture book" on xoko.lat does not
   * reach a style you already took. Open, because the vocabulary lives in the library.
   */
  readonly collections?: readonly string[]
  /** Style descriptors. How they reach the prompt is the engine's `idiom` cap's business —
   *  joined as tags for a tag model, woven into prose for a prose model. */
  readonly tags?: readonly string[]
  /** Words added to the composed prompt verbatim. */
  readonly positive?: string
  /** Only reaches an engine whose `caps.negatives` is true; ignored, not faked, elsewhere. */
  readonly negative?: string
  /**
   * THE NUMBER THAT MAKES THIS STYLE ITSELF, when the words are not enough on their own.
   *
   * ⚠️ IT EXISTS FOR VOICES AND IT IS NOT A KNOB (2026-08-22). A voice-design model is handed a
   * DESCRIPTION — "an old sailor, gravelly, unhurried" — and turns it into a timbre with the
   * seed; the same description on a fresh seed is a different person saying the same thing. So a
   * character voice is words AND a number, and pinning it is what makes "the sailor" mean one
   * sailor across every line he reads. An image style deliberately has none: varying the seed is
   * how you get another picture in a look you already like, and pinning it there would freeze the
   * composition too.
   *
   * When set, it is what the run uses — the style is the answer to "which one", and a fresh
   * number each press would be a different answer.
   */
  readonly seed?: number
  /**
   * SETTINGS THE STYLE BRINGS WITH IT, beyond the words.
   *
   * ⚠️ A MUSIC GENRE FORCED THIS (2026-08-23), and it is the clearest case there will ever be. Jazz
   * noir is not only a caption — it is that caption at 60–80 bpm in a minor key, and content-factory
   * has always carried the three together (`palettes/music-styles.json`: caption, instruments, a bpm
   * band, a key pool). Publish the words alone and every genre comes out at the graph's own 120 bpm
   * in C major, which is the one thing that makes them all sound the same.
   *
   * ⚠️ IT IS STILL OPTIONAL TEXT FIRST. A style that carries nothing but words is the normal case
   * and always will be; this is for the settings that are genuinely PART OF the look rather than
   * part of the press. The test is whether changing it would make the style a different style.
   *
   * ⚠️ AND ONLY WHAT THE MEDIUM CAN BE ASKED FOR. Every key is checked against
   * `knobsFor(medium)` when the file is read (src/styles/registry.ts) — a style cannot smuggle a
   * parameter the app has no way to send, which is what stops this becoming a second, unvalidated
   * request format.
   *
   * It sits above the engine's defaults and below the workflow and the request, so a number typed
   * for one press always beats the genre it was typed over (src/inference/params.ts).
   */
  readonly params?: Params
}

/**
 * 🧩 A COMPOSITION'S OWN STYLE — the second SCOPE a style can have, and the first one that is not
 * a medium.
 *
 * ⚠️ WHY A CHAIN NEEDS ONE AT ALL (2026-08-29). A style is keyed by WHAT PRESSES ▶, and a
 * composition presses ▶ — so it has styles for the same reason a medium does. What it can say that
 * no media style can is the whole argument:
 *
 *   `says`  — words that shape the chain's TEXT steps. "Wry second person, captions under eight
 *             words." That never reaches an engine; it reaches xoko, which is exactly right,
 *             because a text step names no engine and never will. THIS IS THE PART A MEDIA STYLE
 *             STRUCTURALLY CANNOT EXPRESS, and it is most of what "a book style" means.
 *   `uses`  — one media style per medium the chain makes. One pick that sets the picture style AND
 *             the music style AND leaves both overridable, instead of two independent controls the
 *             person has to keep in agreement.
 *
 * ⚠️ IT NAMES MEDIA STYLES, IT NEVER HOLDS THEM. `uses` is slugs, into the one list per medium
 * every section already reads. A chain that carried its own copy of `ink-linework` would be a copy
 * that drifts from the one 🖼 uses, and a fix to the negative list would have to be made twice.
 * There are no cross-medium styles and there never will be: the words are in different idioms
 * (a tag list for one engine, prose for another) and do not transfer.
 *
 * ⚠️ IT SHAPES, IT DOES NOT RESTRUCTURE. No steps are added, removed or re-bound by a style — that
 * is the chain and the plug. A style that switched the graph on you is the parameter-pretending-
 * to-be-a-workflow mistake with the pieces swapped, and it would make "which steps will run"
 * unanswerable from the step list.
 *
 * ⚠️ AND NO `params`. A composition has no knob table to check them against, and a bag of values
 * nothing validates is exactly the second unvalidated request format `Style.params` was careful
 * not to become. What a step is run at is the step's own `params`, editable in ⚙.
 */
export interface CompositionStyle {
  readonly slug: string
  readonly label?: string
  /** What this look IS, in a sentence a person reads before picking it. It travels, like a media
   *  style's — a style downloaded from the library must not read worse here than on its card. */
  readonly notes?: string
  /** Words handed to every `text` step of the chain, under what the step already says. */
  readonly says?: string
  /** medium → the slug of a style in that medium's own list. */
  readonly uses?: Readonly<Record<string, string>>
}

/** Every field a composition style may carry — the same role `STYLE_KEYS` plays for a media one. */
export interface CompositionStyleFile {
  readonly composition: string
  readonly styles: readonly CompositionStyle[]
}

/** One style file. `<install>/styles/<medium>.json` is the seed; `<data>/styles/<medium>.json`
 *  is the live one. */
export interface StyleFile {
  readonly medium: Medium
  readonly styles: readonly Style[]
}

/** A style as loaded: itself, plus which list it came from. The `slug` IS the id — there is one
 *  list, so there is nothing to disambiguate against. */
export interface ResolvedStyle extends Style {
  readonly medium: Medium
}

/**
 * One dimension a style has to answer, with a few real words for it.
 *
 * ⚠️ REFERENCE, NOT A REGISTRY — see `src/styles/axes.ts` for why this is shipped data and not
 * an editable list.
 */
export interface StyleAxis {
  /** What the dimension is called: line, palette, finish. */
  readonly name: string
  /** Ingredients, not styles. Short enough that appending two of them still reads. */
  readonly examples: readonly string[]
}
