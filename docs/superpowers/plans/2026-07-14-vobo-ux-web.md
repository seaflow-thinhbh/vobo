# Vobo UX Tweaks — Web Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the client side of the v2 UX tweaks in `apps/web`: tap-to-call on a responsive board, a player carousel with a depleting turn-timer border (replacing the opponent strip + turn indicator), a host "new game" button, and a public room list on the landing page — all against the already-merged server support.

**Architecture:** Pure prop-driven components (RTL-tested) + a couple of pure helpers; the one `SocketProvider` gains room-list state and the `newGame`/room-list actions. New props on existing components are added as OPTIONAL so each task keeps `next build`/typecheck green until the final rewire task swaps everything in and deletes the retired components.

**Tech Stack:** Next.js 15, React 19, Tailwind v3, socket.io-client, Vitest + RTL, `next build` gate. Spec: `docs/superpowers/specs/2026-07-14-vobo-ux-tweaks-design.md`.

**Server contract already live (merged):** `RoomSnapshot` carries `turnStartedAt: number|null` and `turnEndsAt: number|null`; events `rooms:subscribe` (ack → `OpenRoom[]`), `rooms:unsubscribe` (ack → `{ok:true}`), `rooms:list` (push `OpenRoom[]`), `room:newGame` (ack → `{ok}`); `OpenRoom = {code, hostName, playerCount, maxPlayers}`.

---

## File Structure

```
apps/web/
├─ lib/
│  ├─ types.ts        # + RoomSnapshot.turn*, + OpenRoom
│  ├─ socket.tsx      # + openRooms state, subscribeRooms/unsubscribeRooms/newGame
│  └─ carousel.ts     # NEW pure helpers: visibleWindow, ringColor
├─ components/
│  ├─ GameBoard.tsx   # responsive grid + tap-to-call (optional isYourTurn/onCall)
│  ├─ TurnRing.tsx    # NEW depleting SVG border driven by turnStartedAt/EndsAt
│  ├─ PlayerCarousel.tsx  # NEW; replaces OpponentStrip + TurnIndicator
│  ├─ FinishedPanel.tsx   # + optional isHost/onNewGame
│  ├─ RoomList.tsx    # NEW landing room list
│  ├─ RoomView.tsx    # rewire playing/finished; RoomActions.newGame
│  ├─ OpponentStrip.tsx / TurnIndicator.tsx / CallPanel.tsx  # DELETED in the rewire task
│  └─ *.test.tsx
└─ app/page.tsx       # subscribe + RoomList
```

---

## Task 1: Client types — turn deadline + OpenRoom

**Files:** Modify `apps/web/lib/types.ts`

- [ ] **Step 1: Add turn fields to `RoomSnapshot`.** Change:
```ts
export interface RoomSnapshot {
  code: string;
  status: RoomStatus;
  hostId: string;
  youId: string;
  roster: RosterEntry[];
  view: BingoView | null;
}
```
to:
```ts
export interface RoomSnapshot {
  code: string;
  status: RoomStatus;
  hostId: string;
  youId: string;
  roster: RosterEntry[];
  view: BingoView | null;
  turnStartedAt: number | null;
  turnEndsAt: number | null;
}

export interface OpenRoom {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vobo/web typecheck`
Expected: no errors (test fixtures that build a `RoomSnapshot` may now be missing `turnStartedAt/turnEndsAt` — if `tsc` flags any `*.test.tsx`, that is expected and fixed in the tasks that touch those tests; for THIS task only `lib/types.ts` changes, and typecheck of the app should still pass because the existing test snapshots are widened via object literals — if it does flag existing tests, note them; they are updated in Tasks 7/8).

> If typecheck fails on existing `RoomView.test.tsx` / `Lobby.test.tsx` snapshot literals missing the two new fields, add `turnStartedAt: null, turnEndsAt: null` to those literals now (minimal) so the build stays green; those tests are otherwise rewritten later.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/types.ts apps/web/components/RoomView.test.tsx apps/web/components/Lobby.test.tsx
git commit -m "feat(web): add turn-deadline fields and OpenRoom type"
```

---

## Task 2: Socket — room list state + newGame action

**Files:** Modify `apps/web/lib/socket.tsx`

- [ ] **Step 1: Import `OpenRoom`.** Change the types import line:
```ts
import type { RoomSnapshot, Ack, Difficulty } from './types';
```
to:
```ts
import type { RoomSnapshot, Ack, Difficulty, OpenRoom } from './types';
```

- [ ] **Step 2: Extend the context type.** In `interface SocketContextValue`, add after `leave: () => Promise<Ok>;`:
```ts
  openRooms: OpenRoom[];
  subscribeRooms: () => Promise<OpenRoom[]>;
  unsubscribeRooms: () => Promise<void>;
  newGame: () => Promise<Ok>;
```

- [ ] **Step 3: Add state + listener.** In `SocketProvider`, after the `snapshot` state line add:
```ts
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
```
and inside the `useEffect`, after the `socket.on('room:state', ...)` line add:
```ts
    socket.on('rooms:list', (rooms: OpenRoom[]) => setOpenRooms(rooms));
```

- [ ] **Step 4: Add the actions.** In the `value` object, after `leave: () => emit('room:leave'),` add:
```ts
    openRooms,
    subscribeRooms: async () => {
      const rooms = await emit<OpenRoom[]>('rooms:subscribe');
      setOpenRooms(rooms);
      return rooms;
    },
    unsubscribeRooms: async () => {
      await emit('rooms:unsubscribe');
    },
    newGame: () => emit('room:newGame'),
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @vobo/web typecheck`
Then: `pnpm --filter @vobo/web test`
Expected: no errors; existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/socket.tsx
git commit -m "feat(web): socket room-list state, subscribe/unsubscribe, newGame"
```

---

## Task 3: Carousel helpers (visibleWindow, ringColor)

**Files:** Create `apps/web/lib/carousel.ts`, Test `apps/web/lib/carousel.test.ts`

- [ ] **Step 1: Write the failing test** — `lib/carousel.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { visibleWindow, ringColor } from './carousel';

describe('visibleWindow', () => {
  it('shows everyone when 3 or fewer players', () => {
    expect(visibleWindow(2, 0)).toEqual([0, 1]);
    expect(visibleWindow(3, 2)).toEqual([0, 1, 2]);
  });
  it('shows a 3-wide window centered on the current player when more than 3', () => {
    expect(visibleWindow(5, 2)).toEqual([1, 2, 3]);
  });
  it('clamps the window at the edges', () => {
    expect(visibleWindow(5, 0)).toEqual([0, 1, 2]);
    expect(visibleWindow(5, 4)).toEqual([2, 3, 4]);
  });
});

describe('ringColor', () => {
  it('is green above half remaining, amber at or below half', () => {
    expect(ringColor(0.8)).toBe('green');
    expect(ringColor(0.5)).toBe('amber');
    expect(ringColor(0.2)).toBe('amber');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web exec vitest run lib/carousel.test.ts`
Expected: FAIL — cannot find module `./carousel`.

- [ ] **Step 3: Implement** — `lib/carousel.ts`

```ts
/** Indices of the (up to 3) player tiles to show, centered on the current player. */
export function visibleWindow(count: number, currentIndex: number): number[] {
  if (count <= 3) return Array.from({ length: count }, (_, i) => i);
  let start = currentIndex - 1;
  if (start < 0) start = 0;
  if (start > count - 3) start = count - 3;
  return [start, start + 1, start + 2];
}

/** Turn-timer border colour: green while >50% time remains, amber at/below 50%. */
export function ringColor(fractionRemaining: number): 'green' | 'amber' {
  return fractionRemaining > 0.5 ? 'green' : 'amber';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/web exec vitest run lib/carousel.test.ts`
Then: `pnpm --filter @vobo/web typecheck`
Expected: PASS (2 suites / 4 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/carousel.ts apps/web/lib/carousel.test.ts
git commit -m "feat(web): carousel helpers (visibleWindow, ringColor)"
```

---

## Task 4: GameBoard — responsive grid + tap-to-call

**Files:** Modify `apps/web/components/GameBoard.tsx`, `apps/web/components/GameBoard.test.tsx`

New props `isYourTurn`/`onCall` are OPTIONAL (default off / noop) so `RoomView` keeps compiling until it's rewired later.

- [ ] **Step 1: Replace the test** — overwrite `components/GameBoard.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameBoard } from './GameBoard';
import type { BingoView } from '@/lib/types';

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

function view(): BingoView {
  const marked = ordered.map((n) => [1, 2, 3].includes(n)); // 1,2,3 marked
  return {
    phase: 'playing',
    you: { id: 'you', card: ordered, marked, completedLines: 2, ready: true },
    opponents: [],
    calledNumbers: [1, 2, 3],
    currentPlayerId: 'you',
    winners: [],
  };
}

describe('GameBoard', () => {
  it('renders 25 number buttons and marks called cells', () => {
    render(<GameBoard view={view()} />);
    expect(screen.getByRole('button', { name: '1' }).getAttribute('data-marked')).toBe('true');
    expect(screen.getByRole('button', { name: '4' }).getAttribute('data-marked')).toBe('false');
  });

  it('on your turn, clicking an unmarked cell calls onCall with that number', async () => {
    const onCall = vi.fn();
    const user = userEvent.setup();
    render(<GameBoard view={view()} isYourTurn onCall={onCall} />);
    await user.click(screen.getByRole('button', { name: '4' }));
    expect(onCall).toHaveBeenCalledWith(4);
  });

  it('marked cells are disabled, and off your turn nothing is clickable', () => {
    const onCall = vi.fn();
    const { rerender } = render(<GameBoard view={view()} isYourTurn onCall={onCall} />);
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled(); // marked
    rerender(<GameBoard view={view()} isYourTurn={false} onCall={onCall} />);
    expect(screen.getByRole('button', { name: '4' })).toBeDisabled(); // off turn
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web exec vitest run components/GameBoard.test.tsx`
Expected: FAIL — cells are `<td>` not `<button>` (getByRole('button') fails) / onCall not wired.

- [ ] **Step 3: Rewrite** — `components/GameBoard.tsx`

```tsx
'use client';

import type { BingoView } from '@/lib/types';
import { lettersEarned, BINGO_LETTERS } from '@/lib/bingo';

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

  return (
    <div className="mx-auto w-full max-w-md">
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
          const callable = isYourTurn && !marked;
          return (
            <button
              key={idx}
              type="button"
              data-marked={marked ? 'true' : 'false'}
              disabled={!callable}
              onClick={() => callable && onCall(n)}
              className={`flex aspect-square items-center justify-center rounded border text-lg font-medium ${
                marked
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/web exec vitest run components/GameBoard.test.tsx`
Then: `pnpm --filter @vobo/web typecheck`
Expected: PASS (3 tests), typecheck clean (RoomView still calls `<GameBoard view={view} />` — valid since the new props are optional).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/GameBoard.tsx apps/web/components/GameBoard.test.tsx
git commit -m "feat(web): responsive GameBoard with tap-to-call"
```

---

## Task 5: TurnRing — depleting border

**Files:** Create `apps/web/components/TurnRing.tsx`

Animation component; no unit test (covered by `ringColor` test + `next build`). Verified by typecheck.

- [ ] **Step 1: Implement** — `components/TurnRing.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { ringColor } from '@/lib/carousel';

/** An SVG border around its parent that depletes from full to empty over the turn. */
export function TurnRing({ startedAt, endsAt }: { startedAt: number; endsAt: number }) {
  const [now, setNow] = useState(startedAt); // start deterministic (avoids hydration mismatch)

  useEffect(() => {
    if (typeof requestAnimationFrame === 'undefined') return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const total = Math.max(1, endsAt - startedAt);
  const fraction = Math.min(1, Math.max(0, (endsAt - now) / total));
  const stroke = ringColor(fraction) === 'green' ? '#10b981' : '#f59e0b';

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="1.5"
        width="97"
        height="97"
        rx="8"
        pathLength={100}
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeDasharray={`${fraction * 100} 100`}
        strokeLinecap="round"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vobo/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/TurnRing.tsx
git commit -m "feat(web): TurnRing depleting-border turn timer"
```

---

## Task 6: PlayerCarousel

**Files:** Create `apps/web/components/PlayerCarousel.tsx`, Test `apps/web/components/PlayerCarousel.test.tsx`

Does NOT delete OpponentStrip/TurnIndicator yet (RoomView still imports them until Task 8).

- [ ] **Step 1: Write the failing test** — `components/PlayerCarousel.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerCarousel } from './PlayerCarousel';
import type { RosterEntry } from '@/lib/types';

function players(n: number): RosterEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    isBot: false,
    connected: true,
  }));
}

describe('PlayerCarousel', () => {
  it('shows all players when there are 3 or fewer', () => {
    render(
      <PlayerCarousel players={players(3)} currentPlayerId="p1" youId="p0" turnStartedAt={null} turnEndsAt={null} />,
    );
    expect(screen.getByText(/P0/)).toBeInTheDocument();
    expect(screen.getByText(/P1/)).toBeInTheDocument();
    expect(screen.getByText(/P2/)).toBeInTheDocument();
  });

  it('shows only 3 tiles with the current player when there are more than 3', () => {
    const { container } = render(
      <PlayerCarousel players={players(5)} currentPlayerId="p2" youId="p0" turnStartedAt={null} turnEndsAt={null} />,
    );
    expect(container.querySelectorAll('[data-player]')).toHaveLength(3);
    const current = container.querySelector('[data-current="true"]')!;
    expect(current.getAttribute('data-player')).toBe('p2');
  });

  it('marks "(bạn)" on your own tile', () => {
    render(
      <PlayerCarousel players={players(2)} currentPlayerId="p0" youId="p0" turnStartedAt={null} turnEndsAt={null} />,
    );
    expect(screen.getByText(/\(bạn\)/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web exec vitest run components/PlayerCarousel.test.tsx`
Expected: FAIL — cannot find module `./PlayerCarousel`.

- [ ] **Step 3: Implement** — `components/PlayerCarousel.tsx`

```tsx
'use client';

import type { RosterEntry } from '@/lib/types';
import { visibleWindow } from '@/lib/carousel';
import { TurnRing } from './TurnRing';

export function PlayerCarousel({
  players,
  currentPlayerId,
  youId,
  turnStartedAt,
  turnEndsAt,
}: {
  players: RosterEntry[];
  currentPlayerId: string | null;
  youId: string;
  turnStartedAt: number | null;
  turnEndsAt: number | null;
}) {
  const currentIndex = currentPlayerId ? players.findIndex((p) => p.id === currentPlayerId) : -1;
  const idxs = visibleWindow(players.length, currentIndex >= 0 ? currentIndex : 0);

  return (
    <div className="flex items-center justify-center gap-2">
      {idxs.map((i) => {
        const p = players[i];
        if (!p) return null;
        const isCurrent = p.id === currentPlayerId;
        return (
          <div
            key={p.id}
            data-player={p.id}
            data-current={isCurrent ? 'true' : 'false'}
            className={`relative min-w-[84px] rounded-lg p-3 text-center text-sm font-semibold ${
              isCurrent ? 'bg-slate-50' : 'scale-90 bg-slate-100 opacity-60'
            }`}
          >
            {isCurrent && turnStartedAt != null && turnEndsAt != null && (
              <TurnRing startedAt={turnStartedAt} endsAt={turnEndsAt} />
            )}
            <div className="flex items-center justify-center gap-1">
              <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className="max-w-[72px] truncate">
                {p.name}
                {p.id === youId ? ' (bạn)' : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/web exec vitest run components/PlayerCarousel.test.tsx`
Then: `pnpm --filter @vobo/web typecheck`
Expected: PASS (3 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/PlayerCarousel.tsx apps/web/components/PlayerCarousel.test.tsx
git commit -m "feat(web): PlayerCarousel with turn-timer ring"
```

---

## Task 7: FinishedPanel — new-game button

**Files:** Modify `apps/web/components/FinishedPanel.tsx`, `apps/web/components/Lobby.test.tsx`

New props `isHost`/`onNewGame` are OPTIONAL so RoomView compiles until Task 8.

- [ ] **Step 1: Update the FinishedPanel test.** In `components/Lobby.test.tsx`, the `describe('FinishedPanel', ...)` block renders `<FinishedPanel snapshot={snap} onLeave={() => {}} />`. Replace that whole `describe('FinishedPanel', ...)` block with:

```tsx
describe('FinishedPanel', () => {
  const snap: RoomSnapshot = {
    code: 'K7QX9P',
    status: 'finished',
    hostId: 'you',
    youId: 'you',
    roster: [{ id: 'you', name: 'An', isBot: false, connected: true }],
    view: {
      phase: 'finished',
      you: { id: 'you', card: [], marked: [], completedLines: 5, ready: true },
      opponents: [],
      calledNumbers: [],
      currentPlayerId: null,
      winners: ['you'],
    },
    turnStartedAt: null,
    turnEndsAt: null,
  };

  it('announces the winner and lets the host start a new game', async () => {
    const onNewGame = vi.fn();
    const user = userEvent.setup();
    render(<FinishedPanel snapshot={snap} isHost onNewGame={onNewGame} onLeave={() => {}} />);
    expect(screen.getByText('🎉 Bạn thắng!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ván mới' }));
    expect(onNewGame).toHaveBeenCalled();
  });

  it('non-host sees a waiting message instead of the new-game button', () => {
    render(<FinishedPanel snapshot={snap} isHost={false} onNewGame={() => {}} onLeave={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Ván mới' })).toBeNull();
    expect(screen.getByText(/Chờ chủ phòng/)).toBeInTheDocument();
  });
});
```

(`vi` and `userEvent` are already imported at the top of `Lobby.test.tsx`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web exec vitest run components/Lobby.test.tsx`
Expected: FAIL — no "Ván mới" button yet.

- [ ] **Step 3: Rewrite** — `components/FinishedPanel.tsx`

```tsx
'use client';

import type { RoomSnapshot } from '@/lib/types';

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
  return (
    <div className="mx-auto max-w-sm text-center">
      <h2 className="text-2xl font-bold">{youWon ? '🎉 Bạn thắng!' : `${name} thắng!`}</h2>
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

Run: `pnpm --filter @vobo/web exec vitest run components/Lobby.test.tsx`
Then: `pnpm --filter @vobo/web typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/FinishedPanel.tsx apps/web/components/Lobby.test.tsx
git commit -m "feat(web): FinishedPanel host new-game button"
```

---

## Task 8: RoomView rewire + retire old components + room page

**Files:**
- Modify: `apps/web/components/RoomView.tsx`, `apps/web/components/RoomView.test.tsx`, `apps/web/app/room/[code]/page.tsx`
- Delete: `apps/web/components/OpponentStrip.tsx`, `apps/web/components/TurnIndicator.tsx`, `apps/web/components/OpponentStrip.test.tsx`, `apps/web/components/CallPanel.tsx`, `apps/web/components/CallPanel.test.tsx`

- [ ] **Step 1: Rewrite** — `components/RoomView.tsx`

```tsx
'use client';

import type { RoomSnapshot, Difficulty } from '@/lib/types';
import { Lobby } from './Lobby';
import { CardEditor } from './CardEditor';
import { GameBoard } from './GameBoard';
import { PlayerCarousel } from './PlayerCarousel';
import { FinishedPanel } from './FinishedPanel';

export interface RoomActions {
  addBot: (d: Difficulty) => Promise<unknown>;
  start: () => Promise<unknown>;
  fillCard: (card: number[]) => Promise<unknown>;
  ready: () => Promise<unknown>;
  call: (n: number) => Promise<unknown>;
  leave: () => Promise<unknown>;
  newGame: () => Promise<unknown>;
}

export function RoomView({ snapshot, actions }: { snapshot: RoomSnapshot; actions: RoomActions }) {
  const isHost = snapshot.hostId === snapshot.youId;

  if (snapshot.status === 'lobby') {
    return <Lobby snapshot={snapshot} isHost={isHost} onAddBot={actions.addBot} onStart={actions.start} />;
  }

  const view = snapshot.view;
  if (!view) return <p className="text-center text-slate-500">Đang tải…</p>;

  if (snapshot.status === 'setup') {
    if (view.you.ready) {
      return <p className="text-center text-slate-500">Chờ người khác điền vé…</p>;
    }
    return (
      <CardEditor
        onSubmit={async (card) => {
          const r = (await actions.fillCard(card)) as { ok?: boolean } | undefined;
          if (r?.ok !== false) await actions.ready();
        }}
      />
    );
  }

  if (snapshot.status === 'finished') {
    return (
      <FinishedPanel snapshot={snapshot} isHost={isHost} onNewGame={actions.newGame} onLeave={actions.leave} />
    );
  }

  // playing
  const isYourTurn = view.currentPlayerId === snapshot.youId;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3">
      <PlayerCarousel
        players={snapshot.roster}
        currentPlayerId={view.currentPlayerId}
        youId={snapshot.youId}
        turnStartedAt={snapshot.turnStartedAt}
        turnEndsAt={snapshot.turnEndsAt}
      />
      <GameBoard view={view} isYourTurn={isYourTurn} onCall={actions.call} />
    </div>
  );
}
```

- [ ] **Step 2: Update the RoomView playing test.** In `components/RoomView.test.tsx`, the second test (`renders the game board and call panel while playing`) currently asserts `'Lượt của bạn'` and `'Chọn số để hô:'` (both removed). Replace that test with:

```tsx
  it('renders the player carousel and board while playing', () => {
    const snap: RoomSnapshot = {
      code: 'K7QX9P',
      status: 'playing',
      hostId: 'you',
      youId: 'you',
      roster: [
        { id: 'you', name: 'An', isBot: false, connected: true },
        { id: 'b', name: 'Bình', isBot: false, connected: true },
      ],
      view: {
        phase: 'playing',
        you: { id: 'you', card: ordered, marked: ordered.map(() => false), completedLines: 0, ready: true },
        opponents: [{ id: 'b', name: 'Bình', isBot: false, completedLines: 0, connected: true, ready: true }],
        calledNumbers: [],
        currentPlayerId: 'you',
        winners: [],
      },
      turnStartedAt: null,
      turnEndsAt: null,
    };
    render(<RoomView snapshot={snap} actions={actions} />);
    expect(screen.getByText(/Bình/)).toBeInTheDocument(); // carousel tile
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument(); // board cell
  });
```

Also add `newGame: noop,` to the `actions` object at the top of `RoomView.test.tsx` (it must satisfy `RoomActions`), and add `turnStartedAt: null, turnEndsAt: null` to the lobby snapshot literal in the first test if not already present.

- [ ] **Step 3: Add `newGame` to the room page actions.** In `app/room/[code]/page.tsx`, the `actions` object currently ends with the `leave` entry. Add `newGame: s.newGame,` to it (e.g. right after `call: s.call,`):

```ts
    call: s.call,
    newGame: s.newGame,
    leave: async () => {
```

- [ ] **Step 4: Delete the retired components + tests**

Run:
```bash
git rm apps/web/components/OpponentStrip.tsx apps/web/components/TurnIndicator.tsx apps/web/components/OpponentStrip.test.tsx apps/web/components/CallPanel.tsx apps/web/components/CallPanel.test.tsx
```

- [ ] **Step 5: Run the full web suite + typecheck**

Run: `pnpm --filter @vobo/web test`
Expected: all remaining tests pass; the deleted components' tests are gone; RoomView test passes.
Run: `pnpm --filter @vobo/web typecheck`
Expected: no errors (nothing imports the deleted files).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/RoomView.tsx apps/web/components/RoomView.test.tsx "apps/web/app/room/[code]/page.tsx"
git commit -m "feat(web): rewire RoomView to carousel + tap board; retire OpponentStrip/TurnIndicator/CallPanel"
```

---

## Task 9: RoomList component

**Files:** Create `apps/web/components/RoomList.tsx`, Test `apps/web/components/RoomList.test.tsx`

- [ ] **Step 1: Write the failing test** — `components/RoomList.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoomList } from './RoomList';
import type { OpenRoom } from '@/lib/types';

const rooms: OpenRoom[] = [{ code: 'K7QX9P', hostName: 'An', playerCount: 2, maxPlayers: 6 }];

describe('RoomList', () => {
  it('renders each open room and joins on click', async () => {
    const onJoin = vi.fn();
    const user = userEvent.setup();
    render(<RoomList rooms={rooms} onJoin={onJoin} />);
    expect(screen.getByText(/An/)).toBeInTheDocument();
    expect(screen.getByText('2/6')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vào' }));
    expect(onJoin).toHaveBeenCalledWith('K7QX9P');
  });

  it('shows an empty message when there are no rooms', () => {
    render(<RoomList rooms={[]} onJoin={() => {}} />);
    expect(screen.getByText(/Chưa có phòng nào/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web exec vitest run components/RoomList.test.tsx`
Expected: FAIL — cannot find module `./RoomList`.

- [ ] **Step 3: Implement** — `components/RoomList.tsx`

```tsx
'use client';

import type { OpenRoom } from '@/lib/types';

export function RoomList({
  rooms,
  onJoin,
  disabled = false,
}: {
  rooms: OpenRoom[];
  onJoin: (code: string) => void;
  disabled?: boolean;
}) {
  if (rooms.length === 0) {
    return <p className="text-center text-sm text-slate-400">Chưa có phòng nào đang chờ</p>;
  }
  return (
    <ul className="divide-y rounded border">
      {rooms.map((r) => (
        <li key={r.code} className="flex items-center gap-2 px-3 py-2 text-sm">
          <span className="flex-1 truncate">
            Phòng của <b>{r.hostName}</b>
          </span>
          <span className="text-slate-500">
            {r.playerCount}/{r.maxPlayers}
          </span>
          <button
            type="button"
            onClick={() => onJoin(r.code)}
            disabled={disabled}
            className="rounded bg-sky-600 px-3 py-1 font-medium text-white disabled:opacity-40"
          >
            Vào
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/web exec vitest run components/RoomList.test.tsx`
Then: `pnpm --filter @vobo/web typecheck`
Expected: PASS (2 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/RoomList.tsx apps/web/components/RoomList.test.tsx
git commit -m "feat(web): RoomList component"
```

---

## Task 10: Landing page — room list + subscription

**Files:** Modify `apps/web/app/page.tsx`

- [ ] **Step 1: Rewrite** — `app/page.tsx`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/lib/socket';
import { RoomList } from '@/components/RoomList';

export default function LandingPage() {
  const router = useRouter();
  const { createRoom, joinRoom, connected, openRooms, subscribeRooms, unsubscribeRooms } = useSocket();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!connected) return;
    void subscribeRooms();
    return () => {
      void unsubscribeRooms();
    };
  }, [connected, subscribeRooms, unsubscribeRooms]);

  async function onCreate() {
    if (!name.trim()) return setError('Nhập tên trước đã');
    const r = await createRoom(name.trim());
    if (r.ok) router.push(`/room/${r.code}`);
    else setError(r.message);
  }

  async function joinCode(raw: string) {
    if (!name.trim()) return setError('Nhập tên trước đã');
    const c = raw.trim().toUpperCase();
    if (!c) return setError('Nhập mã phòng');
    const r = await joinRoom(c, name.trim());
    if (r.ok) router.push(`/room/${c}`);
    else setError(r.message);
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-6 text-center text-3xl font-bold">Vobo · Bingo</h1>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên hiển thị"
        className="mb-3 w-full rounded border border-slate-300 px-3 py-2"
      />
      <button
        onClick={onCreate}
        disabled={!connected}
        className="mb-4 w-full rounded bg-emerald-600 py-2 font-medium text-white disabled:opacity-40"
      >
        Tạo phòng
      </button>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Mã phòng"
          className="w-full rounded border border-slate-300 px-3 py-2 uppercase"
        />
        <button
          onClick={() => joinCode(code)}
          disabled={!connected}
          className="rounded bg-sky-600 px-4 font-medium text-white disabled:opacity-40"
        >
          Vào
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {!connected && <p className="mt-3 text-xs text-slate-400">Đang kết nối máy chủ…</p>}

      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-600">Phòng đang chờ</h2>
      <RoomList rooms={openRooms} onJoin={(c) => joinCode(c)} disabled={!name.trim()} />
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + tests**

Run: `pnpm --filter @vobo/web typecheck`
Then: `pnpm --filter @vobo/web test`
Expected: no errors; all component tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "feat(web): landing room list + subscription"
```

---

## Task 11: Build gate + full verification

**Files:** none (verification)

- [ ] **Step 1: Full web test suite**

Run: `pnpm --filter @vobo/web test`
Expected: all tests pass (Smoke, bingo, carousel, CardEditor, GameBoard, PlayerCarousel, Lobby+FinishedPanel, RoomView, RoomList — the deleted OpponentStrip/CallPanel suites are gone).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @vobo/web typecheck`
Expected: no errors.

- [ ] **Step 3: Production build — the gate**

Run: `pnpm --filter @vobo/web build`
Expected: `next build` succeeds, routes `/` and `/room/[code]` compiled. If it fails, fix the offending file in `apps/web/` (most likely a stray import of a deleted component or a missing `'use client'`) and re-run until green.

- [ ] **Step 4: Commit (if any build fixes were needed; otherwise skip)**

```bash
git add -A apps/web
git commit -m "chore(web): verify build + tests green for UX tweaks"
```

---

## Self-Review

**Spec coverage (web portions of §3):**
- `RoomSnapshot.turn*` + `OpenRoom` types → Task 1 ✅
- socket `openRooms` + `subscribeRooms`/`unsubscribeRooms`/`newGame` + `rooms:list` listener → Task 2 ✅
- `lib/carousel.ts` `visibleWindow`/`ringColor` → Task 3 ✅
- GameBoard responsive grid + tap-to-call (#1, #1b) → Task 4 ✅
- `TurnRing` depleting border (#4) → Task 5 ✅
- `PlayerCarousel` replacing OpponentStrip/TurnIndicator, no BINGO letters, current centered, ring (#5) → Tasks 6, 8 ✅
- FinishedPanel host "Ván mới" + "Về sảnh chính" (#2) → Task 7 ✅
- RoomView rewire + `RoomActions.newGame` + delete CallPanel/OpponentStrip/TurnIndicator + room page `newGame` → Task 8 ✅
- `RoomList` + landing subscription (#3) → Tasks 9, 10 ✅
- Build gate → Task 11 ✅

**Placeholder scan:** none. Every step shows the exact code.

**Type consistency:** `OpenRoom {code,hostName,playerCount,maxPlayers}` matches the server payload and is used by socket (`openRooms`, `subscribeRooms`) and `RoomList`. `RoomActions` gains `newGame` (Task 8), supplied by the room page from `socket.newGame` (Task 8) and consumed by `FinishedPanel.onNewGame` (Task 7). `PlayerCarousel` props (`players/currentPlayerId/youId/turnStartedAt/turnEndsAt`) are fed from `snapshot.roster` + `snapshot.turn*` + `view.currentPlayerId` in RoomView (Task 8). GameBoard's new props are optional (Task 4), so RoomView compiles before and after the rewire. `visibleWindow`/`ringColor` signatures match TurnRing/PlayerCarousel usage.

**Green-between-tasks:** new props on GameBoard (Task 4) and FinishedPanel (Task 7) are OPTIONAL, so the pre-rewire RoomView keeps compiling; the retired components are deleted only in Task 8 once RoomView no longer imports them.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-14-vobo-ux-web.md`. This is the **web plan** (2 of 2); after it, all six v2 UX tweaks are live.

Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.

**2. Inline Execution** — execute in this session with checkpoints.

Which approach?
