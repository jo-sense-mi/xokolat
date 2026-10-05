// WHERE A STYLE'S WORDS GO — into the prompt, or into a param of their own.
//
// ⚠️ THE PROMPT IS NOT ALWAYS A DESCRIPTION, AND THAT IS THE WHOLE POINT (2026-08-22). For a
// picture, the sentence you type describes what you want and a style is more words about the same
// thing, so composing them is right: "a fox" + "flat vector illustration" is one prompt. For a
// VOICE, the sentence you type is the SCRIPT — the words to be said out loud — and appending "an
// old sailor, gravelly" to it produces a narrator who reads the stage direction. The voice belongs
// in a channel of its own, which is exactly what a voice-design workflow declares: a `voice` hole
// beside its `prompt` hole.
//
// So a medium whose knob table marks one `shaping` sends its style's words as a PARAM and leaves
// the prompt alone. A medium that marks none composes, which is what every medium did before and
// what images still do.
//
// ⚠️ THE ANSWER IS READ OFF THE KNOB TABLE NOW, NOT KEPT HERE (2026-08-23). This file held a second
// map keyed by medium — the same fact the knob already states, written twice — and the copy would
// have gone stale the first time a medium grew a description channel: one of the two files gets
// updated, the other keeps answering `null`, and the style silently stops arriving.
//
// ⚠️ AND THE WORKFLOW IS FREE TO IGNORE IT. `fill()` puts a param in the hole of the same name and
// silently skips one the graph does not declare (src/inference/comfy/adapter.ts), so sending
// `voice` to a workflow that has no voice hole costs nothing and changes nothing.

import { knobsFor } from '../inference/knobs.ts'
import type { Medium } from '../types/medium.ts'

export const styleParamFor = (medium: Medium): string | null =>
  knobsFor(medium).find((k) => k.shaping)?.key ?? null
