# Vobo Per-Room Win Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track games won per player within a room's session and show a ranked leaderboard in the waiting room (Lobby) and the result overlay (ResultOverlay).

**Architecture:** The server keeps a `wins` tally on the in-memory `Room`, incremented exactly once per finished game via a guarded `RoomManager.recordWin(room)` (called from `orchestrate`), and surfaces each player's count in the snapshot roster. The web adds a presentational `Leaderboard` component plumbed into Lobby and ResultOverlay.

**Tech Stack:** Node + Socket.IO (server), Next.js 15 / React 19 / TS strict + noUncheckedIndexedAccess / Vitest + RTL (web). Both test scripts are `vitest run`; single-file run: `pnpm --filter <pkg> test <pattern>`.

---

## File Structure

- **Modify** `apps/server/src/types.ts` — `Room.wins`, `Room.winRecorded`; `RosterEntry.wins` (required).
- **Modify** `apps/server/src/roomManager.ts` — `createRoom` init `wins`, `startGame` reset `winRecorded`, new `recordWin`.
- **Modify** `apps/server/src/socketServer.ts` — `orchestrate` finished branch calls `recordWin`; `snapshotFor` sets `wins`.
- **Create** `apps/server/src/roomManager.wins.test.ts` — unit tests for the tally.
- **Modify** `apps/server/src/socketServer.integration.test.ts` — assert wins in the finish→lobby flow.
- **Modify** `apps/web/lib/types.ts` — `RosterEntry.wins?` (optional).
- **Create** `apps/web/components/Leaderboard.tsx`, `apps/web/components/Leaderboard.test.tsx`.
- **Modify** `apps/web/components/Lobby.tsx` + `Lobby.test.tsx`.
- **Modify** `apps/web/components/ResultOverlay.tsx` + `ResultOverlay.test.tsx`.

---

### Task 1: Server — win tally on the Room

**Files:**
- Modify: `apps/server/src/types.ts`, `apps/server/src/roomManager.ts`, `apps/server/src/socketServer.ts`
- Create: `apps/server/src/roomManager.wins.test.ts`
- Modify: `apps/server/src/socketServer.integration.test.ts`

These change together because `RosterEntry.wins` is required — every construction site must set it in the same commit to keep the build green.

- [ ] **Step 1: Write the failing unit tests**

Create `apps/server/src/roomManager.wins.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { RoomManager } from './roomManager';
import { InMemoryRoomStore } from './roomStore';
import { DEFAULT_CONFIG } from './config';

function finished2p() {
  const store = new InMemoryRoomStore();
  const m = new RoomManager(store, DEFAULT_CONFIG);
  const a = m.createRoom('An');
  const b = m.joinRoom(a.code, 'Bình') as { ok: true; playerId: string };
  m.startGame(a.code, a.playerId);
  const room = store.get(a.code)!;
  room.state!.phase = 'finished';
  room.state!.winners = [a.playerId];
  return { store, m, code: a.code, host: a.playerId, other: b.playerId, room };
}

describe('RoomManager win tally', () => {
  it('createRoom initializes an empty wins map', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const a = m.createRoom('An');
    expect(store.get(a.code)!.wins).toEqual({});
  });

  it('recordWin counts the winner once and is idempotent (no double-count)', () => {
    const { m, room, host } = finished2p();
    m.recordWin(room);
    m.recordWin(room); // a repeat orchestrate on a still-finished room
    expect(room.wins[host]).toBe(1);
  });

  it('does nothing when the game is not finished', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const a = m.createRoom('An');
    m.joinRoom(a.code, 'Bình');
    m.startGame(a.code, a.playerId); // phase is setup, not finished
    const room = store.get(a.code)!;
    m.recordWin(room);
    expect(room.wins).toEqual({});
  });

  it('keeps wins across returnToLobby and recounts after a new game', () => {
    const { m, room, host, code, store } = finished2p();
    m.recordWin(room);
    expect(room.wins[host]).toBe(1);

    m.returnToLobby(code, host);
    expect(store.get(code)!.wins[host]).toBe(1); // persists

    m.startGame(code, host); // resets the guard, keeps wins
    const r2 = store.get(code)!;
    r2.state!.phase = 'finished';
    r2.state!.winners = [host];
    m.recordWin(r2);
    expect(r2.wins[host]).toBe(2); // counted again after the guard reset
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @vobo/server test roomManager.wins`
Expected: FAIL — `room.wins` / `m.recordWin` don't exist yet (compile/type error).

- [ ] **Step 3: Add the Room + RosterEntry fields**

In `apps/server/src/types.ts`, inside `interface Room` (after `revealDone?`), add:
```ts
  wins: Record<string, number>; // playerId -> games won this room session
  winRecorded?: boolean; // guard: the current finished game's win was already counted
```
and in `interface RosterEntry`, add the required field:
```ts
  wins: number; // games won this room session
```

- [ ] **Step 4: Init + reset + recordWin in RoomManager**

In `apps/server/src/roomManager.ts`:

(a) In `createRoom`, add `wins: {}` to the `Room` literal (e.g. right after the `turnMs:` line):
```ts
      turnMs: turnMs !== undefined && TURN_PRESETS_MS.includes(turnMs) ? turnMs : this.cfg.turnMs,
      wins: {},
```

(b) In `startGame`, alongside the existing reset lines, add the guard reset:
```ts
    room.rolling = false;
    room.revealDone = false;
    room.winRecorded = false;
```

(c) Add a new method (place it just before `returnToLobby`):
```ts
  /** Count the winner of a just-finished game, exactly once. Safe to call repeatedly. */
  recordWin(room: Room): void {
    if (!room.state || room.state.phase !== 'finished' || room.winRecorded) return;
    const winnerId = room.state.winners[0];
    if (winnerId) room.wins[winnerId] = (room.wins[winnerId] ?? 0) + 1;
    room.winRecorded = true;
  }
```
Ensure `Room` is imported in this file (it already imports its types from `./types`; add `Room` to that import if not present).

- [ ] **Step 5: Wire orchestrate + snapshot in socketServer**

In `apps/server/src/socketServer.ts`:

(a) In `orchestrate`'s finished branch, right after `room.lastWinnerId = room.state.winners[0];`, add:
```ts
      manager.recordWin(room);
```

(b) In `snapshotFor`, add `wins` to each roster entry:
```ts
    const roster: RosterEntry[] = source.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      connected: p.isBot || room.seats.get(p.id)?.socketId != null,
      wins: room.wins[p.id] ?? 0,
    }));
```

- [ ] **Step 6: Run the unit tests to verify they pass**

Run: `pnpm --filter @vobo/server test roomManager.wins`
Expected: PASS — all 4 tests green.

- [ ] **Step 7: Add an integration assertion for the real finish→lobby flow**

In `apps/server/src/socketServer.integration.test.ts`, in the test `'host can start a new game after finish, returning the room to lobby'`, insert win assertions. After this existing line:
```ts
    await Promise.race([finished, delay(2000)]);
```
add:
```ts
    expect(snap?.status).toBe('finished');
    const winsAtFinish = (snap?.roster ?? []).reduce((t, p) => t + (p.wins ?? 0), 0);
    expect(winsAtFinish).toBe(1); // exactly one win counted (no double-count across broadcasts)
```
and after this existing line near the end:
```ts
    expect(lobby!.status).toBe('lobby');
```
add:
```ts
    const winsInLobby = lobby!.roster.reduce((t, p) => t + (p.wins ?? 0), 0);
    expect(winsInLobby).toBe(1); // the tally persists into the next lobby
```

- [ ] **Step 8: Run the full server suite**

Run: `pnpm --filter @vobo/server test`
Expected: PASS — all server tests green (unit tally + integration assertions + existing suite).

- [ ] **Step 9: Commit**

```bash
git add apps/server/src/types.ts apps/server/src/roomManager.ts apps/server/src/socketServer.ts apps/server/src/roomManager.wins.test.ts apps/server/src/socketServer.integration.test.ts
git commit -m "feat(server): per-room win tally (recordWin guard + snapshot wins)"
```

---

### Task 2: Web — `Leaderboard` component

**Files:**
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/components/Leaderboard.tsx`, `apps/web/components/Leaderboard.test.tsx`

- [ ] **Step 1: Add the optional web field**

In `apps/web/lib/types.ts`, inside `interface RosterEntry`, add:
```ts
  wins?: number; // games won this room session (server always sends it)
```
(Optional so the existing roster fixtures keep compiling; read sites default to 0.)

- [ ] **Step 2: Write the failing test**

Create `apps/web/components/Leaderboard.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Leaderboard } from './Leaderboard';
import type { RosterEntry } from '@/lib/types';

describe('Leaderboard', () => {
  it('ranks players by wins descending and shows counts', () => {
    const roster: RosterEntry[] = [
      { id: 'a', name: 'An', isBot: false, connected: true, wins: 1 },
      { id: 'b', name: 'Bình', isBot: false, connected: true, wins: 3 },
      { id: 'c', name: 'Cường', isBot: false, connected: true, wins: 0 },
    ];
    const { container } = render(<Leaderboard roster={roster} />);
    const rows = [...container.querySelectorAll('[data-leaderboard] [data-player]')];
    expect(rows.map((r) => r.getAttribute('data-player'))).toEqual(['b', 'a', 'c']);
    expect(rows[0]!.textContent).toContain('Bình');
    expect(rows[0]!.textContent).toContain('3');
  });

  it('treats a missing wins value as 0', () => {
    const roster: RosterEntry[] = [
      { id: 'a', name: 'An', isBot: false, connected: true }, // no wins
      { id: 'b', name: 'Bình', isBot: false, connected: true, wins: 2 },
    ];
    const { container } = render(<Leaderboard roster={roster} />);
    const rows = [...container.querySelectorAll('[data-leaderboard] [data-player]')];
    expect(rows.map((r) => r.getAttribute('data-player'))).toEqual(['b', 'a']);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @vobo/web test components/Leaderboard.test.tsx`
Expected: FAIL — cannot resolve `./Leaderboard`.

- [ ] **Step 4: Write the component**

Create `apps/web/components/Leaderboard.tsx`:
```tsx
import type { RosterEntry } from '@/lib/types';

/** Per-room win leaderboard: players ranked by wins (desc). Presentational only. */
export function Leaderboard({ roster }: { roster: RosterEntry[] }) {
  const ranked = [...roster].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0));
  return (
    <div data-leaderboard className="rounded border border-slate-300/60 text-sm">
      <div className="border-b border-slate-300/60 px-3 py-1 text-xs font-semibold opacity-70">
        🏆 Bảng xếp hạng
      </div>
      <ul className="divide-y divide-slate-300/40">
        {ranked.map((p, i) => (
          <li key={p.id} data-player={p.id} className="flex items-center gap-2 px-3 py-1.5">
            <span className="w-5 opacity-60">#{i + 1}</span>
            <span>{p.name}</span>
            {p.isBot && <span className="text-xs opacity-50">bot</span>}
            <span className="ml-auto font-semibold">🏆 {p.wins ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @vobo/web test components/Leaderboard.test.tsx`
Expected: PASS — both tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/types.ts apps/web/components/Leaderboard.tsx apps/web/components/Leaderboard.test.tsx
git commit -m "feat(web): Leaderboard component + RosterEntry.wins"
```

---

### Task 3: Web — show the leaderboard in Lobby and ResultOverlay

**Files:**
- Modify: `apps/web/components/Lobby.tsx`, `apps/web/components/Lobby.test.tsx`
- Modify: `apps/web/components/ResultOverlay.tsx`, `apps/web/components/ResultOverlay.test.tsx`

- [ ] **Step 1: Write the failing tests**

(a) In `apps/web/components/Lobby.test.tsx`, add this test inside `describe('Lobby', ...)`, after the existing tests:
```tsx
  it('shows a win leaderboard ranked by wins', () => {
    const snap = lobbySnap(2);
    snap.roster[0]!.wins = 1;
    snap.roster[1]!.wins = 4;
    const { container } = render(<Lobby snapshot={snap} isHost onAddBot={() => {}} onStart={() => {}} />);
    const board = container.querySelector('[data-leaderboard]');
    expect(board).toBeTruthy();
    const rows = [...container.querySelectorAll('[data-leaderboard] [data-player]')];
    expect(rows[0]!.getAttribute('data-player')).toBe(snap.roster[1]!.id); // 4 wins first
  });
```

(b) In `apps/web/components/ResultOverlay.test.tsx`, first give the shared `snapshot(...)` helper some wins by adding `wins` to its two roster entries — change:
```tsx
    roster: [
      { id: 'you', name: 'Tôi', isBot: false, connected: true },
      { id: 'p2', name: 'Lan', isBot: false, connected: true },
    ],
```
to:
```tsx
    roster: [
      { id: 'you', name: 'Tôi', isBot: false, connected: true, wins: 2 },
      { id: 'p2', name: 'Lan', isBot: false, connected: true, wins: 1 },
    ],
```
Then add this test inside `describe('ResultOverlay', ...)`:
```tsx
  it('shows the win leaderboard', () => {
    const { container } = render(
      <ResultOverlay snapshot={snapshot('you', 'you')} onPlayAgain={() => {}} onLeave={() => {}} />,
    );
    const rows = [...container.querySelectorAll('[data-leaderboard] [data-player]')];
    expect(rows.map((r) => r.getAttribute('data-player'))).toEqual(['you', 'p2']); // 2 then 1
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @vobo/web test components/Lobby.test.tsx components/ResultOverlay.test.tsx`
Expected: FAIL — no `[data-leaderboard]` in either component yet.

- [ ] **Step 3: Render the leaderboard in Lobby**

In `apps/web/components/Lobby.tsx`:

(a) Add the import after the existing type import:
```tsx
import { Leaderboard } from './Leaderboard';
```
(b) Insert the leaderboard right after the roster `</ul>` (before the `{isHost ? (` block):
```tsx
      </ul>
      <div className="mb-3">
        <Leaderboard roster={snapshot.roster} />
      </div>
```

- [ ] **Step 4: Render the leaderboard in ResultOverlay**

In `apps/web/components/ResultOverlay.tsx`:

(a) Add the import after the `motion` import:
```tsx
import { Leaderboard } from './Leaderboard';
```
(b) Insert the leaderboard between the win/lose message block and the buttons — right before the `<div className="mt-2 flex gap-2">` that holds the buttons:
```tsx
      <div className="w-56 max-w-full">
        <Leaderboard roster={snapshot.roster} />
      </div>
      <div className="mt-2 flex gap-2">
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @vobo/web test components/Lobby.test.tsx components/ResultOverlay.test.tsx`
Expected: PASS — leaderboard renders and ranks correctly in both; existing tests in both files still green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/Lobby.tsx apps/web/components/Lobby.test.tsx apps/web/components/ResultOverlay.tsx apps/web/components/ResultOverlay.test.tsx
git commit -m "feat(web): show win leaderboard in Lobby and ResultOverlay"
```

---

### Task 4: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Server suite**

Run: `pnpm --filter @vobo/server test`
Expected: PASS — all server tests green (win tally unit + integration + existing).

- [ ] **Step 2: Web suite**

Run: `pnpm --filter @vobo/web test`
Expected: PASS — existing tests plus Leaderboard (2), Lobby (+1), ResultOverlay (+1). ~44 tests.

- [ ] **Step 3: Web typecheck**

Run: `pnpm --filter @vobo/web typecheck`
Expected: PASS.

- [ ] **Step 4: Web build**

Run: `pnpm --filter @vobo/web build`
Expected: PASS — `next build` completes.

- [ ] **Step 5: Manual smoke (optional, if a dev env is available)**

`pnpm dev`, play a couple of games in one room:
- After each game the winner's 🏆 count increments; the leaderboard reranks.
- The waiting room (Lobby) and the result overlay both show the standings.
- "Chơi lại" returns to the lobby with the tally intact.

---

## Notes for the implementer

- **Count-once is the only real correctness risk.** `orchestrate`'s finished branch runs on every broadcast for a finished room; `recordWin`'s `winRecorded` guard (reset only in `startGame`) ensures a single increment. The unit test asserts idempotency; the integration test asserts the real flow totals exactly 1.
- **`RosterEntry.wins` is required on the server** (snapshot always sets it) but **optional on the web** (so existing fixtures compile); web read sites use `?? 0`.
- **Bots are included** in the leaderboard by design — no filtering.
- **Leaderboard styling is color-neutral** (opacity-based, `text-current`) so it reads on both the light Lobby / winner overlay and the dark loser overlay.
