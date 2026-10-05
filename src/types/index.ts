// src/types/ is THE CONTRACT (PLAN, "How to read this"). Where a type and the plan's prose
// disagree, the type wins and the prose gets fixed.
//
// Every shape that crosses a boundary — browser ↔ server, server ↔ disk, one phase ↔ the next
// — lives here and nowhere else. Behaviour (defaults, guards, merging) lives with the code
// that performs it, not here.

export * from './medium.ts'
export * from './caps.ts'
export * from './inference.ts'
export * from './request.ts'
export * from './provenance.ts'
export * from './manifest.ts'
export * from './style.ts'
