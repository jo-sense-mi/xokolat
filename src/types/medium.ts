// The MEDIUM vocabulary — layer 2 of the classification (PLAN §4): what kind of output.
//
// One closed set for the whole app. The request's `medium`, an engine row's `medium` and a
// provenance record's `modality` are the SAME vocabulary under two of the plan's words; giving
// them one type is what stops a third spelling appearing the day music lands.
//
// The list is the type — a `as const` tuple so the runtime guard and the compile-time union
// cannot drift apart. Same pattern everywhere a vocabulary is closed.
//
// ⚠️ AND THERE WAS A SECOND LIST UNTIL 2026-08-30, WHICH IS THE THING TO NOT DO AGAIN. `MEDIA` held
// seven and `MEDIA` held the same six plus none — they differed by `text` alone, and
// every reader in the app had to know which of the two it wanted. That one-entry gap is what let a
// writing model look like a seventh kind of output: it had a medium, so it got a band in the engine
// menu, a workflow kind, and a place on the shelf beside the checkpoints. Words are not something
// this app makes and keeps; they are how you ASK for the things it does.
//
// So there is ONE list now, and `medium` means one thing everywhere it appears.

/**
 * WHAT THIS APP MAKES. Six, and each one is a UNIT OF CREATION — a thing a person asks for by
 * name, on its own, as the thing they wanted. "Make me an image." "Make me a song." "Make me a
 * voice." That sentence is the whole test.
 *
 * ⚠️ A BOOK IS NOT ONE, AND IT WAS ONE FOR A DAY (2026-08-24). A book uses images and words; so
 * does a comic, a zine, a portfolio, a photo book. They are ASSEMBLIES — 🧩 compositions — and each
 * would have demanded its own medium here, which is exactly the explosion a closed vocabulary
 * exists to prevent. Naming the medium after the build instead of after the material is the one
 * mistake this list can make, and it made it: `book` was a castle filed in a box of bricks. What a
 * composition produces now belongs to the COMPOSITION (src/compositions/chain.ts), which is the
 * object that actually made it and already has its name — and so does everything its steps make on
 * the way, because a section keeps what it makes.
 *
 * ⚠️ `text` IS NOT HERE AND NEVER WILL BE. The writing model is xoko, and it is a CONNECTION rather
 * than an engine — `role: 'brain'` on its row, no medium at all (src/types/inference.ts). Written
 * things are fields on the asset they belong to (lyrics on the song, the script on the voice run),
 * never assets of their own. There is no 📝 shelf (DECISIONS.md, 2026-08-23).
 *
 * The one place `text` is still a word this app understands is a COMPOSITION STEP: `makes: 'text'`
 * says a step writes the brief the next step renders from, which is true and is typed where it is
 * true (`Step.makes`, src/types/composition.ts) rather than in this list.
 *
 * ⚠️ AND `sound` IS NOT `music`, WHICH IS THE ONE THAT LOOKS LIKE A DUPLICATE. They share a
 * container, a player and a section shape and agree about nothing else: a song is judged as a
 * composition over a couple of minutes, a door slam is judged in three seconds and browsed in
 * hundreds. One shelf for both would sort a rain bed against a ballad.
 */
export const MEDIA = [
  'image', 'music', 'sound', 'voice', 'model3d', 'video',
] as const

export type Medium = (typeof MEDIA)[number]

/** Is this string one of the six? Here, beside the list, because a guard written anywhere else is
 *  a second copy of the vocabulary that can fall behind it. */
export const isMedium = (m: string): m is Medium => (MEDIA as readonly string[]).includes(m)
