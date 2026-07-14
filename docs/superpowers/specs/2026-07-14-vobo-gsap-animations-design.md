# Vobo GSAP "Juicy" Animations — Design

**Date:** 2026-07-14
**Scope:** `apps/web` only. No server or game-engine changes. Purely presentational.

## Goal

Add "juicy game feel" animations to the Bingo web client using GSAP (timelines)
plus `canvas-confetti` (particle burst). Four moments get animated: the dice
reveal, the BINGO win celebration, number-called/cell-marked pops, and
line-complete cascades.

## Non-Goals

- No new gameplay, rules, or server round-trips.
- No engine or server changes.
- No animation on the lobby/room list, turn timer, or carousel this round
  (those already animate via CSS; out of scope).

## Library Strategy

- **`gsap`** — timeline engine for sequenced/decelerating animations.
- **`@gsap/react`** — provides the `useGSAP()` hook: scopes GSAP animations to a
  ref container and auto-reverts/cleans up on unmount and on dependency change.
- **`canvas-confetti`** — purpose-built particle burst for the BINGO celebration
  (hand-rolling particles in GSAP is more code for a worse result).
- **`@types/canvas-confetti`** — dev dependency for types.

## Core Principles

1. **DOM state is the source of truth.** Animations are layered on top of the
   existing `data-marked` / `data-line` / status attributes and text nodes.
   Animations never gate or replace state. All existing RTL assertions
   (attributes + text) remain valid → the 33 web tests stay green.
2. **Respect `prefers-reduced-motion`.** Every animation routes through a single
   guard. When reduced motion is requested, animations become instant (no
   tween, no confetti). jsdom reports reduced-motion, so tests never wait on an
   animation.
3. **Decorative only.** If GSAP or confetti fails to load/run, the game remains
   fully playable — the final visual state is already applied by React/CSS.

## Infrastructure

### `apps/web/lib/motion.ts`

A single small module all animation code imports from.

```ts
'use client';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

let registered = false;
/** Register the useGSAP React plugin once (idempotent). */
export function registerGsap(): void {
  if (registered) return;
  gsap.registerPlugin(useGSAP);
  registered = true;
}

/** True when the user (or the test env / jsdom) prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

Rationale for `prefersReducedMotion` defaulting to `true` when `matchMedia` is
absent: SSR and test environments should not attempt animation.

### Diff helper — `apps/web/lib/usePrevious.ts`

Generic "previous value" ref hook so a component can tell what just changed
(newly-marked cells, newly-completed lines).

```ts
import { useEffect, useRef } from 'react';

/** Returns the value from the previous render (undefined on first render). */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}
```

## The Four Moments

### 1. Dice reveal — `TurnReveal.tsx`

**Current:** a `setInterval(120ms)` cycles a `highlight` index; the first player
is announced statically.

**New:** a GSAP timeline drives the highlight. It spins fast, then decelerates
(ease-out), and lands **exactly** on the index of `firstPlayerId` (already known
from the snapshot — the landing is deterministic, not faked). On landing, the
winning chip does a scale-pop. Total duration ~1.2s, comfortably inside the
server's 1.5s `rolling` window.

- Implementation: instead of `setInterval`, animate a GSAP object
  `{ i: 0 }` from `0` to `spins * n + landingIndex` with `ease: 'power3.out'`,
  and in `onUpdate` set `highlight = Math.floor(obj.i) % n`. On complete, pop the
  landed chip (`gsap.fromTo(scale 1 → 1.25 → 1)`).
- Reduced motion: skip the spin; set `highlight` directly to `landingIndex` and
  show the announcement immediately.
- The component keeps rendering the same chip list with the same
  `bg-emerald-500` highlight class on the highlighted index, so the existing
  structure/tests are unaffected. The "Đi đầu: {name}" text still renders.

### 2. BINGO win — `FinishedPanel.tsx`

On entering the finished state:

- Winner banner springs in (`gsap.from` y+scale, `ease: 'back.out'`).
- The **B-I-N-G-O letters stagger in** (`gsap.from` with `stagger: 0.08`).
- `canvas-confetti` fires a short double-burst (two calls ~250ms apart) from the
  banner area.
- Reduced motion: banner and letters appear instantly; **no confetti**.

Confetti is invoked imperatively inside `useGSAP` (or a guarded `useEffect`), not
rendered as DOM, so it does not affect the test DOM.

### 3. Number called + cell marked — `GameBoard.tsx`

There is no separate "current call" UI element in the board — a called number
becomes a **marked cell** on your card (`view.you.marked` is derived from
`calledNumbers` ∩ your card). So "number called" and "cell marked" are the same
visual event on the board, and we animate it once:

- **Cell marked:** diff `view.you.marked` against its previous value via
  `usePrevious`. For each index that flipped `false → true`, scale-bounce that
  cell button (`gsap.fromTo` scale `0.7 → 1` with `ease: 'back.out(2)'`). This
  fires both for the caller (their tapped cell) and for other players when the
  called number lands on their card.
- Reduced motion: no tween; cells simply appear marked (current behavior).
- `data-marked` continues to be set by React exactly as today.

### 4. Line complete — `GameBoard.tsx`

- Diff `completedLineCells(view.you.marked)` against its previous value via
  `usePrevious`. When the set gains cells, a line just completed.
- Animate the newly-added cells with a **staggered scale+glow flash** along the
  line (`stagger: 0.06`), landing on the green completed state.
- Reduced motion: cells turn green instantly (current behavior).
- `data-line` continues to be set by React exactly as today.

## Testing & Non-Regression

- **Vitest setup mocks `canvas-confetti`** (it needs a real `<canvas>`):
  in the test setup file, `vi.mock('canvas-confetti', () => ({ default: vi.fn() }))`.
- GSAP runs in jsdom but reduced-motion is reported there, so animation code
  takes the instant path; timelines never block. Where a component still calls
  GSAP, the calls operate on real refs and complete synchronously enough for
  tests; assertions target final DOM state (attributes/text), not intermediate
  frames.
- No existing assertion changes. New behavior is covered by:
  - `TurnReveal`: still announces the first player and highlights its chip
    (assert the reduced-motion instant path lands on `firstPlayerId`).
  - `FinishedPanel`: still renders winner + B-I-N-G-O letters; confetti mock is
    called (or not called under reduced motion).
  - `GameBoard`: `data-marked` / `data-line` transitions unchanged.
- **Gates:** `pnpm --filter @vobo/web test` (all green) and
  `pnpm --filter @vobo/web build` (`next build`).

## File Structure

- Create: `apps/web/lib/motion.ts` — GSAP registration + reduced-motion guard.
- Create: `apps/web/lib/usePrevious.ts` — previous-value ref hook.
- Modify: `apps/web/components/TurnReveal.tsx` — GSAP dice timeline.
- Modify: `apps/web/components/FinishedPanel.tsx` — banner/letters + confetti.
- Modify: `apps/web/components/GameBoard.tsx` — cell-mark pop + line-complete cascade.
- Modify: `apps/web/package.json` — add deps.
- Modify: Vitest setup file — mock `canvas-confetti`.

## Rollout / Risk

- Additive dependencies (~30KB gz total). No behavior change if animations are
  skipped. Low risk: the game is fully functional with animations disabled.
- Single implementation plan (one subsystem: the web client).
