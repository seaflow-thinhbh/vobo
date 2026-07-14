# Vobo GSAP Juicy Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GSAP-driven "juicy" animations (dice reveal, BINGO win celebration, cell-mark pop, line-complete cascade) to the Vobo Bingo web client.

**Architecture:** Purely presentational, web-only. A small `lib/motion.ts` centralizes GSAP registration + a `prefersReducedMotion()` guard; a generic `lib/usePrevious.ts` diffs render-to-render state. Three components (`TurnReveal`, `FinishedPanel`, `GameBoard`) layer GSAP timelines on top of the existing DOM state (`data-marked` / `data-line` / text stay the source of truth), so all existing RTL tests keep passing. `canvas-confetti` powers the win burst. Every animation no-ops under reduced motion (which jsdom reports), so tests never wait on frames.

**Tech Stack:** Next.js 15, React 19, TypeScript (strict + `noUncheckedIndexedAccess`), Tailwind v3, Vitest + RTL, `gsap`, `@gsap/react`, `canvas-confetti`.

---

## File Structure

- **Create** `apps/web/lib/motion.ts` — GSAP registration + `prefersReducedMotion()`; re-exports `gsap`, `useGSAP`.
- **Create** `apps/web/lib/motion.test.ts` — tests for the reduced-motion guard.
- **Create** `apps/web/lib/usePrevious.ts` — previous-render value hook.
- **Create** `apps/web/lib/usePrevious.test.tsx` — tests for the hook.
- **Create** `apps/web/components/FinishedPanel.test.tsx` — new test file (none exists today).
- **Modify** `apps/web/vitest.setup.ts` — global `canvas-confetti` mock.
- **Modify** `apps/web/components/TurnReveal.tsx` — GSAP decelerating dice timeline.
- **Modify** `apps/web/components/FinishedPanel.tsx` — banner spring + B-I-N-G-O stagger + confetti.
- **Modify** `apps/web/components/GameBoard.tsx` — cell-mark pop + line-complete cascade (adds `data-idx`).
- **Modify** `apps/web/components/GameBoard.test.tsx` — add a rerender/mark-change assertion.
- **Modify** `apps/web/components/TurnReveal.test.tsx` — add reduced-motion highlight assertion.
- **Modify** `apps/web/package.json` — new deps (via `pnpm add`).

Note: all commands run from the repo root `D:/workspace/projects/vobo`. Single-file test runs use `pnpm --filter @vobo/web test <pattern>` (the `test` script is `vitest run`, which treats trailing args as a filename filter).

---

### Task 1: Install dependencies

**Files:**
- Modify: `apps/web/package.json` (written by pnpm)

- [ ] **Step 1: Add runtime deps**

Run:
```bash
pnpm --filter @vobo/web add gsap @gsap/react canvas-confetti
```
Expected: pnpm adds `gsap`, `@gsap/react`, `canvas-confetti` under `dependencies`. A React peer-dep warning from `@gsap/react` is acceptable.

- [ ] **Step 2: Add the confetti types (dev dep)**

Run:
```bash
pnpm --filter @vobo/web add -D @types/canvas-confetti
```
Expected: `@types/canvas-confetti` added under `devDependencies`.

- [ ] **Step 3: Verify the existing suite still passes**

Run:
```bash
pnpm --filter @vobo/web test
```
Expected: PASS — all 33 tests still green (no code changed yet).

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web): add gsap, @gsap/react, canvas-confetti"
```

---

### Task 2: `lib/motion.ts` — GSAP registration + reduced-motion guard

**Files:**
- Create: `apps/web/lib/motion.ts`
- Test: `apps/web/lib/motion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/motion.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { prefersReducedMotion } from './motion';

describe('prefersReducedMotion', () => {
  it('returns true when matchMedia is unavailable (jsdom default)', () => {
    expect(prefersReducedMotion()).toBe(true);
  });

  it('reflects the media query result when matchMedia exists', () => {
    const original = window.matchMedia;

    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(false);

    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    expect(prefersReducedMotion()).toBe(true);

    window.matchMedia = original;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web test lib/motion.test.ts`
Expected: FAIL — cannot resolve `./motion` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/motion.ts`:
```ts
'use client';

import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

let registered = false;

/** Register the @gsap/react integration once. Idempotent + SSR-safe. */
export function registerGsap(): void {
  if (registered) return;
  gsap.registerPlugin(useGSAP);
  registered = true;
}

/**
 * True when animations should be skipped: the user requested reduced motion,
 * or we are in a non-browser / test environment without `matchMedia`.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export { gsap, useGSAP };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/web test lib/motion.test.ts`
Expected: PASS — both assertions green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/motion.ts apps/web/lib/motion.test.ts
git commit -m "feat(web): motion.ts — gsap registration + reduced-motion guard"
```

---

### Task 3: `lib/usePrevious.ts` — previous-render value hook

**Files:**
- Create: `apps/web/lib/usePrevious.ts`
- Test: `apps/web/lib/usePrevious.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/usePrevious.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePrevious } from './usePrevious';

describe('usePrevious', () => {
  it('is undefined on first render, then returns the prior value', () => {
    const { result, rerender } = renderHook(({ v }) => usePrevious(v), {
      initialProps: { v: 1 },
    });
    expect(result.current).toBeUndefined();

    rerender({ v: 2 });
    expect(result.current).toBe(1);

    rerender({ v: 3 });
    expect(result.current).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web test lib/usePrevious.test.tsx`
Expected: FAIL — cannot resolve `./usePrevious`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/lib/usePrevious.ts`:
```ts
import { useEffect, useRef } from 'react';

/** Returns the value from the previous render (undefined on the first render). */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/web test lib/usePrevious.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/usePrevious.ts apps/web/lib/usePrevious.test.tsx
git commit -m "feat(web): usePrevious hook for render-to-render diffing"
```

---

### Task 4: Global `canvas-confetti` mock in the test setup

**Files:**
- Modify: `apps/web/vitest.setup.ts`

Rationale: `canvas-confetti` renders to a real `<canvas>` that jsdom does not fully implement. A global mock keeps any component that imports it safe in tests and lets the FinishedPanel test (Task 6) assert on the burst.

- [ ] **Step 1: Add the mock**

Replace the entire contents of `apps/web/vitest.setup.ts` with:
```ts
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// canvas-confetti draws to a real <canvas>; stub it for the whole suite.
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 2: Verify the suite still passes**

Run: `pnpm --filter @vobo/web test`
Expected: PASS — all tests still green (mock is inert until something imports confetti).

- [ ] **Step 3: Commit**

```bash
git add apps/web/vitest.setup.ts
git commit -m "test(web): mock canvas-confetti globally"
```

---

### Task 5: TurnReveal — decelerating dice timeline

**Files:**
- Modify: `apps/web/components/TurnReveal.tsx`
- Modify: `apps/web/components/TurnReveal.test.tsx`

Behavior: instead of the flat `setInterval(120ms)` flicker, a GSAP tween spins the highlight and decelerates (`power3.out`), landing deterministically on `firstPlayerId`, then pops the landed chip. Under reduced motion the highlight jumps straight to the first player. The chip list, names, and "Đi đầu:" line are unchanged, so the existing test stays valid.

- [ ] **Step 1: Write the failing test (append to the existing describe block)**

In `apps/web/components/TurnReveal.test.tsx`, add this test inside the `describe('TurnReveal', ...)` block, after the existing `it`:
```tsx
  it('under reduced motion, marks the first player as highlighted', () => {
    render(<TurnReveal players={players} firstPlayerId="b" />);
    expect(screen.getByText('Bình').getAttribute('data-highlight')).toBe('true');
    expect(screen.getByText('An').getAttribute('data-highlight')).toBe('false');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web test components/TurnReveal.test.tsx`
Expected: FAIL — `data-highlight` attribute does not exist yet (returns `null`, not `'true'`).

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `apps/web/components/TurnReveal.tsx` with:
```tsx
'use client';

import { useRef, useState } from 'react';
import type { RosterEntry } from '@/lib/types';
import { registerGsap, prefersReducedMotion, gsap, useGSAP } from '@/lib/motion';

registerGsap();

/** Dice-reveal shown during the server's "rolling" window: the highlight spins,
 *  decelerates, and lands on the (already-decided) first player. */
export function TurnReveal({
  players,
  firstPlayerId,
}: {
  players: RosterEntry[];
  firstPlayerId: string | null;
}) {
  const n = Math.max(1, players.length);
  const foundIndex = players.findIndex((p) => p.id === firstPlayerId);
  const landingIndex = foundIndex >= 0 ? foundIndex : 0;
  const [highlight, setHighlight] = useState(0);
  const container = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        setHighlight(landingIndex);
        return;
      }
      const spins = 3;
      const totalSteps = spins * n + landingIndex;
      const proxy = { t: 0 };
      gsap.to(proxy, {
        t: totalSteps,
        duration: 1.2,
        ease: 'power3.out',
        onUpdate: () => setHighlight(Math.floor(proxy.t) % n),
        onComplete: () => {
          setHighlight(landingIndex);
          const el = container.current?.querySelector(`[data-chip="${landingIndex}"]`);
          if (el) {
            gsap.fromTo(
              el,
              { scale: 1 },
              { scale: 1.25, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' },
            );
          }
        },
      });
    },
    { dependencies: [firstPlayerId, n], scope: container },
  );

  const first = players.find((p) => p.id === firstPlayerId);

  return (
    <div ref={container} className="mx-auto flex max-w-md flex-col items-center gap-3 py-8">
      <p className="text-lg font-semibold">🎲 Chọn lượt đi đầu…</p>
      <div className="flex flex-wrap justify-center gap-2">
        {players.map((p, i) => (
          <div
            key={p.id}
            data-chip={i}
            data-highlight={i === highlight ? 'true' : 'false'}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              i === highlight ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {p.name}
          </div>
        ))}
      </div>
      {first && <p className="text-sm text-slate-600">Đi đầu: {first.name}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @vobo/web test components/TurnReveal.test.tsx`
Expected: PASS — both the original announcement test and the new highlight test are green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/TurnReveal.tsx apps/web/components/TurnReveal.test.tsx
git commit -m "feat(web): GSAP decelerating dice reveal in TurnReveal"
```

---

### Task 6: FinishedPanel — banner spring + B-I-N-G-O stagger + confetti

**Files:**
- Modify: `apps/web/components/FinishedPanel.tsx`
- Create: `apps/web/components/FinishedPanel.test.tsx`

Behavior: a decorative B-I-N-G-O row and the winner banner animate in; `canvas-confetti` fires a double-burst — but only when motion is allowed. Under reduced motion (jsdom default) nothing tweens and confetti is not called.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/FinishedPanel.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import confetti from 'canvas-confetti';
import { FinishedPanel } from './FinishedPanel';
import type { RoomSnapshot } from '@/lib/types';

function snapshot(): RoomSnapshot {
  return {
    code: 'ABCD',
    youId: 'you',
    hostId: 'you',
    status: 'finished',
    roster: [
      { id: 'you', name: 'Tôi', isBot: false, connected: true },
      { id: 'p2', name: 'Lan', isBot: false, connected: true },
    ],
    turnMs: 20000,
    rolling: false,
    view: {
      phase: 'finished',
      you: { id: 'you', card: [], marked: [], completedLines: 5, ready: true },
      opponents: [],
      calledNumbers: [],
      currentPlayerId: 'you',
      winners: ['you'],
    },
  } as unknown as RoomSnapshot;
}

describe('FinishedPanel', () => {
  beforeEach(() => {
    vi.mocked(confetti).mockClear();
  });

  it('announces the winner and renders the B-I-N-G-O celebration letters', () => {
    render(<FinishedPanel snapshot={snapshot()} isHost onLeave={() => {}} />);
    expect(screen.getByText('🎉 Bạn thắng!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ván mới' })).toBeInTheDocument();
    // 5 celebration letters present
    const letters = document.querySelectorAll('[data-celebrate="letter"]');
    expect(letters).toHaveLength(5);
  });

  it('does not fire confetti under reduced motion (jsdom default)', () => {
    render(<FinishedPanel snapshot={snapshot()} isHost onLeave={() => {}} />);
    expect(vi.mocked(confetti)).not.toHaveBeenCalled();
  });

  it('fires confetti when motion is allowed', () => {
    const original = window.matchMedia;
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    render(<FinishedPanel snapshot={snapshot()} isHost onLeave={() => {}} />);
    expect(vi.mocked(confetti)).toHaveBeenCalled();

    window.matchMedia = original;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web test components/FinishedPanel.test.tsx`
Expected: FAIL — no `[data-celebrate="letter"]` elements and no confetti wiring yet (the letters assertion and/or confetti assertion fail).

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `apps/web/components/FinishedPanel.tsx` with:
```tsx
'use client';

import { useRef } from 'react';
import confetti from 'canvas-confetti';
import type { RoomSnapshot } from '@/lib/types';
import { registerGsap, prefersReducedMotion, gsap, useGSAP } from '@/lib/motion';

registerGsap();

const CELEBRATION = ['B', 'I', 'N', 'G', 'O'] as const;

export function FinishedPanel({
  snapshot,
  isHost = false,
  onNewGame = () => {},
  onLeave,
}: {
  snapshot: RoomSnapshot;
  isHost?: boolean;
  onNewGame?: () => void;
  onLeave: () => void;
}) {
  const winnerId = snapshot.view?.winners[0];
  const youWon = winnerId === snapshot.youId;
  const name = snapshot.roster.find((r) => r.id === winnerId)?.name ?? '?';
  const container = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const tl = gsap.timeline();
      tl.from('[data-celebrate="letter"]', {
        y: -16,
        scale: 0.4,
        opacity: 0,
        stagger: 0.08,
        duration: 0.4,
        ease: 'back.out(2)',
      });
      tl.from(
        '[data-celebrate="banner"]',
        { y: 20, scale: 0.8, opacity: 0, duration: 0.5, ease: 'back.out(1.7)' },
        '-=0.2',
      );
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.3 } });
      gsap.delayedCall(0.25, () =>
        confetti({ particleCount: 50, spread: 100, origin: { y: 0.35 } }),
      );
    },
    { scope: container },
  );

  return (
    <div ref={container} className="mx-auto max-w-sm text-center">
      <div className="mb-3 flex justify-center gap-2 text-3xl font-extrabold text-emerald-500">
        {CELEBRATION.map((L) => (
          <span key={L} data-celebrate="letter">
            {L}
          </span>
        ))}
      </div>
      <h2 data-celebrate="banner" className="text-2xl font-bold">
        {youWon ? '🎉 Bạn thắng!' : `${name} thắng!`}
      </h2>
      <div className="mt-4 flex flex-col items-center gap-2">
        {isHost ? (
          <button
            type="button"
            onClick={onNewGame}
            className="rounded bg-emerald-600 px-4 py-2 font-medium text-white"
          >
            Ván mới
          </button>
        ) : (
          <p className="text-sm text-slate-500">Chờ chủ phòng mở ván mới…</p>
        )}
        <button type="button" onClick={onLeave} className="rounded bg-slate-800 px-4 py-2 text-white">
          Về sảnh chính
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/web test components/FinishedPanel.test.tsx`
Expected: PASS — winner text, 5 letters, no-confetti-under-reduced-motion, and confetti-when-allowed all green.

- [ ] **Step 5: Run the RoomView test (FinishedPanel is rendered there indirectly)**

Run: `pnpm --filter @vobo/web test components/RoomView.test.tsx`
Expected: PASS — RoomView still routes to FinishedPanel without regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/FinishedPanel.tsx apps/web/components/FinishedPanel.test.tsx
git commit -m "feat(web): BINGO win celebration — banner, letters, confetti"
```

---

### Task 7: GameBoard — cell-mark pop + line-complete cascade

**Files:**
- Modify: `apps/web/components/GameBoard.tsx`
- Modify: `apps/web/components/GameBoard.test.tsx`

Behavior: when `view.you.marked` gains a cell, that cell scale-bounces; when `completedLineCells(...)` gains cells, the newly-completed line's cells flash in a staggered cascade. Diffs come from `usePrevious`. Each cell button gains a `data-idx` so the effect can target it. `data-marked` / `data-line` remain set by React exactly as before, so existing tests are untouched.

- [ ] **Step 1: Write the failing test (append to the existing describe block)**

In `apps/web/components/GameBoard.test.tsx`, add this test inside the `describe('GameBoard', ...)` block, after the existing tests:
```tsx
  it('updates data-marked when a new number is marked across rerenders', () => {
    const base = view();
    const { rerender } = render(<GameBoard view={base} />);
    expect(screen.getByRole('button', { name: '4' }).getAttribute('data-marked')).toBe('false');

    const next: BingoView = {
      ...base,
      you: { ...base.you, marked: base.you.marked.map((m, i) => m || i === 3) },
      calledNumbers: [1, 2, 3, 4],
    };
    rerender(<GameBoard view={next} />);
    expect(screen.getByRole('button', { name: '4' }).getAttribute('data-marked')).toBe('true');
    expect(screen.getByRole('button', { name: '4' }).getAttribute('data-idx')).toBe('3');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web test components/GameBoard.test.tsx`
Expected: FAIL — `data-idx` attribute does not exist yet (returns `null`, not `'3'`).

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `apps/web/components/GameBoard.tsx` with:
```tsx
'use client';

import { useRef } from 'react';
import type { BingoView } from '@/lib/types';
import { lettersEarned, BINGO_LETTERS, completedLineCells } from '@/lib/bingo';
import { usePrevious } from '@/lib/usePrevious';
import { registerGsap, prefersReducedMotion, gsap, useGSAP } from '@/lib/motion';

registerGsap();

export function GameBoard({
  view,
  isYourTurn = false,
  onCall = () => {},
}: {
  view: BingoView;
  isYourTurn?: boolean;
  onCall?: (n: number) => void;
}) {
  const letters = lettersEarned(view.you.completedLines);
  const completed = completedLineCells(view.you.marked);
  const container = useRef<HTMLDivElement>(null);

  const prevMarked = usePrevious(view.you.marked);
  const prevCompleted = usePrevious(completed);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const root = container.current;
      if (!root) return;

      // Newly-marked cells → scale-bounce.
      if (prevMarked) {
        view.you.marked.forEach((m, i) => {
          if (m && !prevMarked[i]) {
            const el = root.querySelector(`[data-idx="${i}"]`);
            if (el) {
              gsap.fromTo(el, { scale: 0.7 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' });
            }
          }
        });
      }

      // Newly-completed line cells → staggered flash cascade.
      if (prevCompleted) {
        const fresh = [...completed]
          .filter((i) => !prevCompleted.has(i))
          .sort((a, b) => a - b);
        const els = fresh
          .map((i) => root.querySelector(`[data-idx="${i}"]`))
          .filter((e): e is Element => e != null);
        if (els.length > 0) {
          gsap.fromTo(
            els,
            { scale: 0.6 },
            { scale: 1, duration: 0.4, stagger: 0.06, ease: 'back.out(2)' },
          );
        }
      }
    },
    { dependencies: [view.you.marked], scope: container },
  );

  return (
    <div ref={container} className="mx-auto w-full max-w-md">
      <div className="mb-2 flex justify-center gap-3 text-xl">
        {BINGO_LETTERS.map((L, i) => (
          <span key={L} className={letters[i] ? 'font-bold text-emerald-600' : 'text-slate-300'}>
            {L}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {view.you.card.map((n, idx) => {
          const marked = view.you.marked[idx] === true;
          const inLine = completed.has(idx);
          const callable = isYourTurn && !marked;
          return (
            <button
              key={idx}
              type="button"
              data-idx={idx}
              data-marked={marked ? 'true' : 'false'}
              data-line={inLine ? 'true' : 'false'}
              disabled={!callable}
              onClick={() => callable && onCall(n)}
              className={`flex aspect-square items-center justify-center rounded border text-lg font-medium ${
                inLine
                  ? 'border-emerald-500 bg-emerald-500 font-bold text-white'
                  : marked
                    ? 'border-amber-300 bg-amber-300 font-bold text-slate-900'
                    : callable
                      ? 'border-sky-500 text-sky-700'
                      : 'border-slate-300 text-slate-700'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @vobo/web test components/GameBoard.test.tsx`
Expected: PASS — all existing GameBoard tests plus the new rerender/`data-idx` assertion are green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/GameBoard.tsx apps/web/components/GameBoard.test.tsx
git commit -m "feat(web): GameBoard cell-mark pop + line-complete cascade"
```

---

### Task 8: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the whole web test suite**

Run: `pnpm --filter @vobo/web test`
Expected: PASS — 33 original tests + the new motion (2), usePrevious (1), TurnReveal (+1), FinishedPanel (3), GameBoard (+1) tests. Total ≈ 41 tests, all green.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vobo/web typecheck`
Expected: PASS — no TypeScript errors (strict + `noUncheckedIndexedAccess`).

- [ ] **Step 3: Production build gate**

Run: `pnpm --filter @vobo/web build`
Expected: PASS — `next build` completes with no errors.

- [ ] **Step 4: Manual smoke (optional, if a dev environment is available)**

Run: `pnpm dev`, open two browsers into one room, start a game:
- Dice reveal spins and lands on the first player.
- Calling a number pops the marked cell; completing a line cascades green.
- On BINGO, the winner banner + B-I-N-G-O letters animate and confetti fires.
- With OS "reduce motion" on, all of the above appear instantly with no confetti.

- [ ] **Step 5: Final commit (if any lockfile/config drift)**

```bash
git add -A
git commit -m "chore(web): gsap animations verification gate" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Effect ordering is intentional.** `usePrevious` commits its new value in a `useEffect` (passive), while `useGSAP` runs in a layout effect (earlier). So inside the `useGSAP` callback, `prevMarked` / `prevCompleted` still hold the previous render's values — exactly what the diff needs.
- **Reduced motion is the test default.** jsdom has no `window.matchMedia`, so `prefersReducedMotion()` returns `true` and every animation takes the instant path. Only the FinishedPanel "motion allowed" test overrides `window.matchMedia`, and it restores it afterward.
- **Do not gate state on animation.** React sets `data-marked` / `data-line` / text regardless of GSAP. If GSAP or confetti is unavailable, the game still shows the correct final state.
- **`noUncheckedIndexedAccess`:** indexed reads like `prevMarked[i]` are `boolean | undefined`; the `&& !prevMarked[i]` comparison handles `undefined` correctly (treated as falsy → not "was already marked"), so no `!` assertion is needed there.
