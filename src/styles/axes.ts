// STYLE AXES — the dimensions a style has to answer, and a few real words for each.
//
// ⚠️ REFERENCE, NOT A REGISTRY. No CRUD, no ★, no per-build randomizer, no roll bench. This is
// the deliberate small half of what content-factory's `style-axes.json` was.
//
// That registry did TWO jobs. The first — randomize a look PER BUILD over a curated pool — is
// what all its machinery (per-option ★, family scoping, base words, a resolver mirrored in both
// the runner and the browser) actually paid for, and it existed because the factory ran
// unattended batches with nobody there to choose. This app has no unattended runner: you press
// ▶, and "vary it for me" is already one word in the picker (`random`, over the ★ pool). Ported
// whole, the registry would have had a dice button for its only consumer.
//
// The second job is the one worth keeping: staring at an empty `words` box is a bad prompt, and
// it fails in a specific way — you write three words about line and say nothing about palette,
// then every render surprises you in the same place. So the axes survive as a CHECKLIST in the
// editor: what has this style not said anything about yet.
//
// ⚠️ INGREDIENTS, NOT STYLES. Each example is a phrase you can append to another one and still
// have it read. content-factory's options were whole style sentences because a roll used exactly
// one per axis; here you are writing, and a 12-word option would be the entire style.
//
// Shipped and read-only ON PURPOSE. It is a fixed part of the app the way the four bands are —
// nothing here is per-user taste, and the moment it were editable it would want ★, families and
// a resolver, which is the registry we just declined to build.

import type { Medium } from '../types/medium.ts'
import type { StyleAxis } from '../types/style.ts'

/**
 * Per medium, because the dimensions are not shared: an image has line weight and a song has
 * tempo. A medium that is absent simply shows no checklist — the editor works without one.
 */
export const STYLE_AXES: Readonly<Partial<Record<Medium, readonly StyleAxis[]>>> = {
  image: [
    {
      name: 'medium',
      examples: ['watercolour washes', 'gouache', 'colored pencil', 'ink wash', 'flat vector',
        'cel shading', 'risograph print', 'oil impasto', 'pixel art', 'papercut collage'],
    },
    {
      name: 'line',
      examples: ['bold outlines', 'thin even linework', 'no outline', 'sketchy construction lines',
        'tapered brush lines', 'hatched shading'],
    },
    {
      name: 'palette',
      examples: ['pastel', 'saturated and bold', 'earthy muted', 'two-tone',
        'near-monochrome with one accent', 'jewel tones', 'sun-faded'],
    },
    {
      name: 'light',
      examples: ['flat even light', 'soft golden light', 'hazy glow', 'deep twilight shadows',
        'hard rim light'],
    },
    {
      name: 'finish',
      examples: ['clean negative space', 'grainy paper texture', 'halftone dots', 'matte',
        'glossy', 'misregistered layers'],
    },
  ],
  // ⚠️ A SOUND STYLE IS THE RECORDING, NOT THE SOURCE (2026-08-29). A door slam is a door slam; what
  // a style layers over it is how it was captured or made — close and dry, distant in stone,
  // through a wall, on 1970s tape, as cartoon foley. That is the exact parallel of 🖼's
  // technique-only rule, and these axes are how the editor says it without a paragraph.
  sound: [
    {
      name: 'space',
      examples: ['close-mic\'d and dry', 'a small room', 'a big stone hall', 'outdoors with no tail',
        'through a wall', 'down a corridor'],
    },
    {
      name: 'capture',
      examples: ['clean 48k field recording', 'handheld recorder', 'hissy 1970s tape',
        'contact mic', 'telephone band', 'vinyl-thin'],
    },
    {
      name: 'treatment',
      examples: ['untouched', 'exaggerated cartoon foley', 'hyperreal with heavy low end',
        'compressed and forward', 'slowed and stretched'],
    },
    {
      name: 'weight',
      examples: ['light and papery', 'woody', 'metallic', 'thick and low', 'brittle'],
    },
  ],
  // ⚠️ AND A VOICE STYLE IS A PERSON. Not a technique — a cast member, which is why a voice carries
  // a pinned seed (src/types/style.ts) and why its words go to a channel of their own rather than
  // into the script (src/styles/param.ts). These are the dimensions of a human being, in the order
  // you would describe one.
  voice: [
    { name: 'age', examples: ['a child', 'young', 'middle-aged', 'elderly', 'ageless'] },
    {
      name: 'timbre',
      examples: ['bright and clear', 'warm', 'deep and resonant', 'gravelly', 'breathy', 'nasal',
        'smoky'],
    },
    {
      name: 'accent',
      examples: ['neutral English', 'Received Pronunciation', 'American Midwest', 'Irish', 'Scottish',
        'Southern US', 'lightly Mediterranean'],
    },
    {
      name: 'pace',
      examples: ['unhurried', 'brisk', 'measured with pauses', 'clipped', 'rambling'],
    },
    {
      name: 'mood',
      examples: ['warm and reassuring', 'wry', 'weary', 'conspiratorial', 'stern', 'delighted'],
    },
  ],
  // ⚠️ NO CATEGORIES FOR 🎼, AND THESE ARE NOT A BACK DOOR TO ONE. A music style IS the genre, so a
  // taxonomy over genres would be a shelf of one; what a genre still needs is a checklist, because
  // writing three words about instruments and nothing about tempo is how every take surprises you
  // in the same place. Tempo and key are `params`, not words — these are the WORDS.
  music: [
    {
      name: 'instruments',
      examples: ['solo piano', 'nylon guitar', 'string quartet', 'brushed kit', 'upright bass',
        'analog synth pads', 'accordion', 'muted trumpet', 'hand percussion'],
    },
    {
      name: 'texture',
      examples: ['sparse', 'one melody over a bed', 'dense and layered', 'call and response',
        'drone underneath'],
    },
    {
      name: 'era',
      examples: ['1950s', 'late 60s', '1980s', 'contemporary', 'timeless / no period'],
    },
    {
      name: 'production',
      examples: ['dry and close', 'roomy live take', 'tape saturation', 'lo-fi and filtered',
        'wide modern mix'],
    },
    {
      name: 'mood',
      examples: ['wistful', 'urgent', 'hushed', 'triumphant', 'menacing', 'playful'],
    },
  ],
}

export const axesFor = (medium: Medium): readonly StyleAxis[] => STYLE_AXES[medium] ?? []
