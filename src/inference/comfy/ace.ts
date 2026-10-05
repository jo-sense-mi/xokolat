// ACE-STEP'S OWN VOCABULARY — the two enums `TextEncodeAceStepAudio1.5` compares EXACTLY.
//
// ⚠️ THE MODEL'S CONTRACT, NOT A CURATED LIST. The node does a string equality check against these
// options (`comfy_extras/nodes_ace.py`), so `"D Major"` with a capital M is refused at
// prompt-validation time with `value_not_in_list` — before a single step is sampled. Declaring them
// here is what lets the app say so first, in a sentence, instead of relaying ComfyUI's.
//
// ⚠️ AND THEY SIT BESIDE THE TRANSPORT THAT SPEAKS THEM, the same as `SAMPLERS` and `SEED_MODES` do
// for Draw Things (`../draw-things/config.ts`). A knob table is where a vocabulary is OFFERED; this
// is where one is DECLARED, and the two are not the same file for the same reason a checkpoint's
// facts are not the workflow's.
//
// ⚠️ AND THEY ARE READ OFF A RUNNING ComfyUI, not remembered — `GET /object_info/<node>` returns
// every enum and every range the node really has. `timesignature` was left out of this file for a
// day because its options had not been verified and a wrong list refuses values the node accepts;
// asking took one request. Ask, do not guess, and do not leave a knob out either when the answer
// is one call away.

/**
 * The 34 keyscales, in the node's own order: majors then minors, chromatic from C. Both spellings
 * of every accidental are separate options because the node lists them separately (`C#` and `Db`).
 */
export const ACE_KEYSCALES = [
  'C major', 'C# major', 'Db major', 'D major', 'D# major', 'Eb major', 'E major', 'F major',
  'F# major', 'Gb major', 'G major', 'G# major', 'Ab major', 'A major', 'A# major', 'Bb major',
  'B major', 'C minor', 'C# minor', 'Db minor', 'D minor', 'D# minor', 'Eb minor', 'E minor',
  'F minor', 'F# minor', 'Gb minor', 'G minor', 'G# minor', 'Ab minor', 'A minor', 'A# minor',
  'Bb minor', 'B minor',
] as const

/** The default the node itself carries. */
export const ACE_KEYSCALE_DEFAULT = 'C major'

/**
 * The 51 lyric languages — ISO 639-1, plus `yue` (Cantonese) and `unknown` (unspecified).
 *
 * Codes only, and no display names: a name is a thing to render, and nothing here renders one —
 * the picker shows the code and the schema handed to xoko is a list of exactly what the wire takes.
 */
export const ACE_LANGUAGES = [
  'en', 'ar', 'az', 'bn', 'bg', 'yue', 'ca', 'zh', 'hr', 'cs', 'da', 'nl', 'fi', 'fr', 'de',
  'el', 'ht', 'he', 'hi', 'hu', 'is', 'id', 'it', 'ja', 'ko', 'la', 'lt', 'ms', 'ne', 'no', 'fa',
  'pl', 'pt', 'pa', 'ro', 'ru', 'sa', 'sr', 'sk', 'es', 'sw', 'sv', 'tl', 'ta', 'te', 'th', 'tr',
  'uk', 'ur', 'vi', 'unknown',
] as const

export const ACE_LANGUAGE_DEFAULT = 'en'

/**
 * The four time signatures, as the node lists them — strings, not numbers.
 *
 * There is no 5 and no 7: the model was trained on these four, and a `COMBO` refuses anything else
 * before a step is sampled.
 */
export const ACE_TIMESIGNATURES = ['2', '3', '4', '6'] as const

export const ACE_TIMESIGNATURE_DEFAULT = '4'
