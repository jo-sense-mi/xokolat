// QWEN3-TTS'S OWN VOCABULARY — read off a running ComfyUI, not remembered.
//
// ⚠️ SAME RULE AS ../comfy/ace.ts AND A SEPARATE FILE FOR THE SAME REASON: one file per node
// family, because these are two vendors' contracts and nothing joins them. ACE-Step takes ISO
// codes; this node takes English NAMES of languages and offers eleven. Folding them into one list
// keyed by medium would produce a `language` knob that sends `ca` to a node expecting `Catalan`.
//
// ⚠️ AND `Auto` IS AN OPTION RATHER THAN AN ABSENCE. It is the node's own default and it reads the
// language off the script — which is the right default for an app where the sentence IS the words
// to be spoken, in whatever language they were typed.

/** The eleven, in the node's own order. `Auto` first, as it lists it. */
export const QWEN_TTS_LANGUAGES = [
  'Auto', 'Chinese', 'English', 'Japanese', 'Korean', 'French', 'German', 'Spanish', 'Portuguese',
  'Russian', 'Italian',
] as const

export const QWEN_TTS_LANGUAGE_DEFAULT = 'Auto'
