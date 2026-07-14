# Vobo UX v3 — Web Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Client side of the v3 tweaks: pick the turn time when creating a room, a pill player box whose timer draws a gray track behind the green/amber remaining arc, and a dice-reveal overlay during the server's `rolling` window.

**Architecture:** Small prop-driven changes to existing components + one new `TurnReveal` overlay, plus the socket `createRoom(name, turnMs)` and two new snapshot fields (`turnMs`, `rolling`) already emitted by the server. TDD for the logic-bearing bits; `next build` gate at the end.

**Tech Stack:** Next.js 15, React 19, Tailwind v3, socket.io-client, Vitest + RTL, `next build`. Spec: `docs/superpowers/specs/2026-07-14-vobo-ux-v3-design.md`. Built on `main` (v3 engine+server already merged: `RoomSnapshot` now has `turnMs`/`rolling`; `room:create` accepts `{ name, turnMs }`).

---

## File Structure

```
apps/web/
├─ lib/types.ts        # RoomSnapshot + turnMs + rolling
├─ lib/socket.tsx      # createRoom(name, turnMs?)
├─ app/page.tsx        # turn-time selector
├─ components/
│  ├─ TurnRing.tsx     # gray track behind the colored remaining arc
│  ├─ PlayerCarousel.tsx  # pill boxes
│  ├─ TurnReveal.tsx   # NEW dice-reveal overlay while rolling
│  └─ RoomView.tsx     # show TurnReveal during rolling
```

---

## Task 1: Client types + socket createRoom(turnMs)

**Files:**
- Modify: `apps/web/lib/types.ts`, `apps/web/lib/socket.tsx`
- Modify: `apps/web/components/RoomView.test.tsx`, `apps/web/components/Lobby.test.tsx`

- [ ] **Step 1: Add snapshot fields** — in `lib/types.ts`, change the `RoomSnapshot` tail:
```ts
  view: BingoView | null;
  turnStartedAt: number | null;
  turnEndsAt: number | null;
}
```
to:
```ts
  view: BingoView | null;
  turnStartedAt: number | null;
  turnEndsAt: number | null;
  turnMs: number;
  rolling: boolean;
}
```

- [ ] **Step 2: Widen the socket createRoom signature** — in `lib/socket.tsx`:
  - In `interface SocketContextValue`, change:
    ```ts
      createRoom: (name: string) => Promise<Ack<{ code: string; playerId: string; token: string }>>;
    ```
    to:
    ```ts
      createRoom: (name: string, turnMs?: number) => Promise<Ack<{ code: string; playerId: string; token: string }>>;
    ```
  - In the `value` object, change the `createRoom` implementation:
    ```ts
    createRoom: async (name) => {
      const r = await emit<Ack<{ code: string; playerId: string; token: string }>>('room:create', { name });
      if (r.ok) saveToken(r.code, r.token);
      return r;
    },
    ```
    to:
    ```ts
    createRoom: async (name, turnMs) => {
      const r = await emit<Ack<{ code: string; playerId: string; token: string }>>('room:create', { name, turnMs });
      if (r.ok) saveToken(r.code, r.token);
      return r;
    },
    ```

- [ ] **Step 3: Fix test snapshot fixtures** — the new required `turnMs`/`rolling` break `RoomSnapshot` object literals in tests. In `apps/web/components/RoomView.test.tsx` and `apps/web/components/Lobby.test.tsx`, every `RoomSnapshot` literal (they currently end with `turnStartedAt: null, turnEndsAt: null,`) must also include `turnMs: 20000,` and `rolling: false,`. Add those two lines to each `RoomSnapshot` literal in both files.

- [ ] **Step 4: Typecheck + tests**

Run: `pnpm --filter @vobo/web typecheck`
Then: `pnpm --filter @vobo/web test`
Expected: no errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/socket.tsx apps/web/components/RoomView.test.tsx apps/web/components/Lobby.test.tsx
git commit -m "feat(web): snapshot turnMs/rolling and createRoom turn-time arg"
```

---

## Task 2: Landing — turn-time selector

**Files:** Modify `apps/web/app/page.tsx`

- [ ] **Step 1: Add the selector + pass the turn time.** In `app/page.tsx`:

(a) Add a `turnSec` state after the `error` state:
```ts
  const [turnSec, setTurnSec] = useState(20);
```

(b) Change `onCreate` to pass the turn time (ms):
```ts
  async function onCreate() {
    if (!name.trim()) return setError('Nhập tên trước đã');
    const r = await createRoom(name.trim(), turnSec * 1000);
    if (r.ok) router.push(`/room/${r.code}`);
    else setError(r.message);
  }
```

(c) Add the selector UI right BEFORE the "Tạo phòng" button (before the `<button onClick={onCreate} ...>` line):
```tsx
      <div className="mb-3">
        <div className="mb-1 text-xs text-slate-500">Thời gian mỗi lượt</div>
        <div className="flex gap-1">
          {[15, 20, 30, 45, 60].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTurnSec(s)}
              className={`flex-1 rounded py-1.5 text-sm font-medium ${
                turnSec === s ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {s}s
            </button>
          ))}
        </div>
      </div>
```

- [ ] **Step 2: Typecheck + tests**

Run: `pnpm --filter @vobo/web typecheck`
Then: `pnpm --filter @vobo/web test`
Expected: no errors; tests pass (landing has no unit test).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "feat(web): turn-time selector on room creation"
```

---

## Task 3: TurnRing — gray track behind the remaining arc

**Files:** Modify `apps/web/components/TurnRing.tsx`

Adds a full-perimeter gray track (the "already counted" part) behind the green/amber remaining arc, and a pill-radius border. No unit test (animation; verified by build).

- [ ] **Step 1: Replace the returned SVG** — in `TurnRing.tsx`, replace the whole `return ( <svg ...> ... </svg> );` with:

```tsx
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {/* gray track = full perimeter (the elapsed part shows through here) */}
      <rect x="1.5" y="1.5" width="97" height="97" rx="48" fill="none" stroke="#cbd5e1" strokeWidth="3" />
      {/* colored arc = remaining time, depleting */}
      <rect
        x="1.5"
        y="1.5"
        width="97"
        height="97"
        rx="48"
        pathLength={100}
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeDasharray={`${fraction * 100} 100`}
        strokeLinecap="round"
      />
    </svg>
  );
```

(Leave the rest of the component — the `useState`/`useEffect` local-clock countdown and the `stroke`/`fraction` computation — unchanged.)

- [ ] **Step 2: Typecheck + tests**

Run: `pnpm --filter @vobo/web typecheck`
Then: `pnpm --filter @vobo/web test`
Expected: no errors; tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/TurnRing.tsx
git commit -m "feat(web): TurnRing gray track behind remaining-time arc"
```

---

## Task 4: PlayerCarousel — pill boxes

**Files:** Modify `apps/web/components/PlayerCarousel.tsx`

- [ ] **Step 1: Make the tiles pills** — in `PlayerCarousel.tsx`, change the tile `<div>`'s className from:
```tsx
            className={`relative min-w-[84px] rounded-lg p-3 text-center text-sm font-semibold ${
              isCurrent ? 'bg-slate-50' : 'scale-90 bg-slate-100 opacity-60'
            }`}
```
to:
```tsx
            className={`relative min-w-[84px] rounded-full px-4 py-3 text-center text-sm font-semibold ${
              isCurrent ? 'bg-slate-50' : 'scale-90 border border-slate-200 bg-white opacity-60'
            }`}
```

- [ ] **Step 2: Typecheck + tests**

Run: `pnpm --filter @vobo/web exec vitest run components/PlayerCarousel.test.tsx`
Then: `pnpm --filter @vobo/web typecheck`
Expected: PASS (the existing 3 tests still pass — they assert `data-current`/names, unaffected by styling), typecheck clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/PlayerCarousel.tsx
git commit -m "feat(web): pill-shaped player carousel tiles"
```

---

## Task 5: TurnReveal overlay + RoomView rolling branch

**Files:**
- Create: `apps/web/components/TurnReveal.tsx`
- Modify: `apps/web/components/RoomView.tsx`
- Test: `apps/web/components/TurnReveal.test.tsx`

- [ ] **Step 1: Write the failing test** — `components/TurnReveal.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TurnReveal } from './TurnReveal';
import type { RosterEntry } from '@/lib/types';

const players: RosterEntry[] = [
  { id: 'a', name: 'An', isBot: false, connected: true },
  { id: 'b', name: 'Bình', isBot: false, connected: true },
];

describe('TurnReveal', () => {
  it('shows all players and announces who goes first', () => {
    render(<TurnReveal players={players} firstPlayerId="b" />);
    expect(screen.getByText('An')).toBeInTheDocument();
    expect(screen.getByText(/Đi đầu:/)).toBeInTheDocument();
    expect(screen.getByText('Bình')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web exec vitest run components/TurnReveal.test.tsx`
Expected: FAIL — cannot find module `./TurnReveal`.

- [ ] **Step 3: Implement** — `components/TurnReveal.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { RosterEntry } from '@/lib/types';

/** Dice-reveal shown during the server's "rolling" window: a highlight cycles the
 *  players and the first player (already decided server-side) is announced. */
export function TurnReveal({
  players,
  firstPlayerId,
}: {
  players: RosterEntry[];
  firstPlayerId: string | null;
}) {
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (typeof setInterval === 'undefined') return;
    const id = setInterval(() => {
      setHighlight((h) => (h + 1) % Math.max(1, players.length));
    }, 120);
    return () => clearInterval(id);
  }, [players.length]);

  const first = players.find((p) => p.id === firstPlayerId);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-8">
      <p className="text-lg font-semibold">🎲 Chọn lượt đi đầu…</p>
      <div className="flex flex-wrap justify-center gap-2">
        {players.map((p, i) => (
          <div
            key={p.id}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              i === highlight ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {p.name}
          </div>
        ))}
      </div>
      {first && (
        <p className="text-sm text-slate-600">
          Đi đầu: <b>{first.name}</b>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Show it in `RoomView` during rolling** — in `components/RoomView.tsx`:

(a) Add the import after the `PlayerCarousel` import:
```ts
import { TurnReveal } from './TurnReveal';
```

(b) In the playing branch (the `// playing` section at the end), add the rolling check as the FIRST thing. Change:
```tsx
  // playing
  const isYourTurn = view.currentPlayerId === snapshot.youId;
  return (
```
to:
```tsx
  // playing
  if (snapshot.rolling) {
    return <TurnReveal players={snapshot.roster} firstPlayerId={view.currentPlayerId} />;
  }
  const isYourTurn = view.currentPlayerId === snapshot.youId;
  return (
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @vobo/web exec vitest run components/TurnReveal.test.tsx`
Then: `pnpm --filter @vobo/web test`
Then: `pnpm --filter @vobo/web typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/TurnReveal.tsx apps/web/components/RoomView.tsx apps/web/components/TurnReveal.test.tsx
git commit -m "feat(web): TurnReveal dice overlay during the rolling window"
```

---

## Task 6: Build gate + full verification

**Files:** none (verification)

- [ ] **Step 1: Full web test suite**

Run: `pnpm --filter @vobo/web test`
Expected: all tests pass (incl. TurnReveal, PlayerCarousel, RoomView, plus the v2 suites).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vobo/web typecheck`
Expected: no errors.

- [ ] **Step 3: Production build — the gate**

Run: `pnpm --filter @vobo/web build`
Expected: `next build` succeeds, routes `/` and `/room/[code]` compiled. If it fails, fix the offending file in `apps/web/` (likely a missing `'use client'` or import) and re-run until green.

- [ ] **Step 4: Commit (only if build fixes were needed; else skip and say so)**

```bash
git add -A apps/web
git commit -m "chore(web): verify build + tests green for v3 tweaks"
```

---

## Self-Review

**Spec coverage (web §4):**
- `RoomSnapshot.turnMs/rolling` client types → Task 1 ✅
- `createRoom(name, turnMs)` socket → Task 1 ✅
- Turn-time selector on room creation → Task 2 ✅
- TurnRing gray track + colored remaining arc → Task 3 ✅
- Pill player boxes → Task 4 ✅
- `TurnReveal` overlay while `rolling` → Task 5 ✅
- Build gate → Task 6 ✅

**Placeholder scan:** none. Every step shows exact code.

**Type consistency:** `RoomSnapshot.turnMs: number`/`rolling: boolean` (Task 1) match the server payload and are read in `RoomView` (`snapshot.rolling`, Task 5). `createRoom(name, turnMs?)` (Task 1) is called with `turnSec * 1000` (Task 2). `TurnReveal` props (`players: RosterEntry[]`, `firstPlayerId: string | null`) are fed `snapshot.roster` + `view.currentPlayerId` in RoomView (Task 5). The existing `RoomSnapshot` test literals get the two new fields (Task 1) so component tests still typecheck.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-vobo-ux-v3-web.md`. This is the **web plan** (2 of 2 for v3); after it, all three v3 tweaks are live.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.

**2. Inline Execution** — execute in this session with checkpoints.

Which approach?
