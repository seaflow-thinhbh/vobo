# Vobo Win-Flow Overlay + Play-Again-for-All Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a game ends, show a winner/loser result overlay on top of the dimmed board, with "Chơi lại" and "Thoát phòng" buttons available to every player (not just the host).

**Architecture:** One server permission change (`returnToLobby` becomes any-participant instead of host-only, guarded by a membership check) plus a new web `ResultOverlay` component rendered over the still-visible finished board. The winner branch reuses the confetti + B-I-N-G-O celebration; the loser branch shows a somber 😔 drop+shake. `FinishedPanel` is retired.

**Tech Stack:** Node + Socket.IO (server), Next.js 15 / React 19 / TS strict + noUncheckedIndexedAccess / Vitest + RTL / GSAP + canvas-confetti (web). Both test scripts are `vitest run`; single-file run: `pnpm --filter <pkg> test <pattern>`.

---

## File Structure

- **Modify** `apps/server/src/roomManager.ts` — `returnToLobby(code, playerId)`: drop host check, add membership (`not_player`) guard, keep `not_finished`.
- **Modify** `apps/server/src/roomManager.newgame.test.ts` — non-host participant success + `not_player` rejection.
- **Create** `apps/web/components/ResultOverlay.tsx` — winner/loser overlay + buttons for all.
- **Create** `apps/web/components/ResultOverlay.test.tsx`.
- **Modify** `apps/web/components/RoomView.tsx` — finished branch → dimmed board + `ResultOverlay`; drop `FinishedPanel` import.
- **Modify** `apps/web/components/RoomView.test.tsx` — finished-status test.
- **Delete** `apps/web/components/FinishedPanel.tsx`, `apps/web/components/FinishedPanel.test.tsx`.

Reuses (no change): `apps/web/lib/motion.ts` (`registerGsap`, `prefersReducedMotion`, `gsap`, `useGSAP`) and the global `canvas-confetti` mock in `apps/web/vitest.setup.ts`.

---

### Task 1: Server — `returnToLobby` any-participant + membership guard

**Files:**
- Modify: `apps/server/src/roomManager.ts` (the `returnToLobby` method, currently ~line 210)
- Test: `apps/server/src/roomManager.newgame.test.ts`

- [ ] **Step 1: Update the tests to the new behavior (write the failing tests)**

Replace the ENTIRE `describe('RoomManager.returnToLobby', ...)` block in `apps/server/src/roomManager.newgame.test.ts` (keep the imports and the `finishedRoom()` helper above it unchanged) with:
```ts
describe('RoomManager.returnToLobby', () => {
  it('host resets a finished game to lobby, keeping connected humans + bots, dropping leavers', () => {
    const { store, m, code, host, left } = finishedRoom();
    const r = m.returnToLobby(code, host);
    expect(r.ok).toBe(true);
    const room = store.get(code)!;
    expect(room.state).toBeUndefined(); // back to lobby
    const ids = room.roster.map((p) => p.id);
    expect(ids).toContain(host); // connected human kept
    expect(ids.some((id) => id.startsWith('bot_'))).toBe(true); // bot kept
    expect(ids).not.toContain(left); // player who left is dropped
    expect(room.turnStartedAt).toBeUndefined();
    expect(room.turnEndsAt).toBeUndefined();
  });

  it('lets a NON-host participant return a finished game to lobby', () => {
    const store = new InMemoryRoomStore();
    const m = new RoomManager(store, DEFAULT_CONFIG);
    const a = m.createRoom('An');
    const b = m.joinRoom(a.code, 'Bình') as { ok: true; playerId: string };
    m.startGame(a.code, a.playerId);
    const room = store.get(a.code)!;
    room.state!.phase = 'finished';
    room.state!.winners = [a.playerId];

    const r = m.returnToLobby(a.code, b.playerId); // Bình is not the host
    expect(r.ok).toBe(true);
    expect(store.get(a.code)!.state).toBeUndefined();
  });

  it('rejects a non-participant and a not-finished room', () => {
    const { m, code } = finishedRoom();
    expect(m.returnToLobby(code, 'ghost')).toMatchObject({ ok: false, code: 'not_player' });

    // a fresh lobby room (never started) -> not_finished
    const store2 = new InMemoryRoomStore();
    const m2 = new RoomManager(store2, DEFAULT_CONFIG);
    const a = m2.createRoom('An');
    expect(m2.returnToLobby(a.code, a.playerId)).toMatchObject({ ok: false, code: 'not_finished' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @vobo/server test roomManager.newgame`
Expected: FAIL — the `'ghost'` case still returns `not_host` (not `not_player`), and the non-host success case fails because the host check rejects `Bình`.

- [ ] **Step 3: Update `returnToLobby`**

In `apps/server/src/roomManager.ts`, replace the current method signature line and its first guards. Change:
```ts
  returnToLobby(code: string, hostId: string): OpResult {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (room.hostId !== hostId) return fail('not_host', 'Chỉ chủ phòng mới mở ván mới');
    if (!room.state || room.state.phase !== 'finished') {
      return fail('not_finished', 'Ván chưa kết thúc');
    }
```
to:
```ts
  returnToLobby(code: string, playerId: string): OpResult {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (!room.state || room.state.phase !== 'finished') {
      return fail('not_finished', 'Ván chưa kết thúc');
    }
    if (!room.state.players.some((p) => p.id === playerId)) {
      return fail('not_player', 'Bạn không ở trong ván này');
    }
```
Leave the rest of the method (roster rebuild, state/timer reset, `return { ok: true }`) exactly as-is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @vobo/server test roomManager.newgame`
Expected: PASS — all three tests green.

- [ ] **Step 5: Run the full server suite (guard against callers relying on the old signature)**

Run: `pnpm --filter @vobo/server test`
Expected: PASS — the socket handler `room:newGame` passes `c.playerId` positionally, so the rename is transparent; all server tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/roomManager.ts apps/server/src/roomManager.newgame.test.ts
git commit -m "feat(server): any participant can return a finished room to lobby"
```

---

### Task 2: Web — `ResultOverlay` component

**Files:**
- Create: `apps/web/components/ResultOverlay.tsx`
- Test: `apps/web/components/ResultOverlay.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/ResultOverlay.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import confetti from 'canvas-confetti';
import { ResultOverlay } from './ResultOverlay';
import type { RoomSnapshot } from '@/lib/types';

function snapshot(winnerId: string, youId: string): RoomSnapshot {
  return {
    code: 'ABCD',
    youId,
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
      you: { id: youId, card: [], marked: [], completedLines: 5, ready: true },
      opponents: [],
      calledNumbers: [],
      currentPlayerId: youId,
      winners: [winnerId],
    },
  } as unknown as RoomSnapshot;
}

describe('ResultOverlay', () => {
  beforeEach(() => vi.mocked(confetti).mockClear());

  it('winner branch: celebrates and fires confetti when motion is allowed', () => {
    const original = window.matchMedia;
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    render(<ResultOverlay snapshot={snapshot('you', 'you')} onPlayAgain={() => {}} onLeave={() => {}} />);
    expect(document.querySelector('[data-result="win"]')).toBeTruthy();
    expect(screen.getByText('🎉 Bạn thắng!')).toBeInTheDocument();
    expect(vi.mocked(confetti)).toHaveBeenCalled();

    window.matchMedia = original;
  });

  it('loser branch: shows the winner name and fires no confetti', () => {
    render(<ResultOverlay snapshot={snapshot('p2', 'you')} onPlayAgain={() => {}} onLeave={() => {}} />);
    expect(document.querySelector('[data-result="lose"]')).toBeTruthy();
    expect(screen.getByText('Lan thắng!')).toBeInTheDocument();
    expect(vi.mocked(confetti)).not.toHaveBeenCalled();
  });

  it('shows Chơi lại + Thoát phòng for everyone and wires the callbacks', async () => {
    const onPlayAgain = vi.fn();
    const onLeave = vi.fn();
    const user = userEvent.setup();
    render(<ResultOverlay snapshot={snapshot('p2', 'you')} onPlayAgain={onPlayAgain} onLeave={onLeave} />);
    await user.click(screen.getByRole('button', { name: 'Chơi lại' }));
    await user.click(screen.getByRole('button', { name: 'Thoát phòng' }));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web test components/ResultOverlay.test.tsx`
Expected: FAIL — cannot resolve `./ResultOverlay`.

- [ ] **Step 3: Write the component**

Create `apps/web/components/ResultOverlay.tsx`:
```tsx
'use client';

import { useRef } from 'react';
import confetti from 'canvas-confetti';
import type { RoomSnapshot } from '@/lib/types';
import { registerGsap, prefersReducedMotion, gsap, useGSAP } from '@/lib/motion';

registerGsap();

const CELEBRATION = ['B', 'I', 'N', 'G', 'O'] as const;

/** Overlay shown over the dimmed finished board: a winner celebration or a loser
 *  effect, plus "Chơi lại" / "Thoát phòng" buttons available to every player. */
export function ResultOverlay({
  snapshot,
  onPlayAgain,
  onLeave,
}: {
  snapshot: RoomSnapshot;
  onPlayAgain: () => void;
  onLeave: () => void;
}) {
  const winnerId = snapshot.view?.winners[0];
  const youWon = winnerId === snapshot.youId;
  const winnerName = snapshot.roster.find((r) => r.id === winnerId)?.name ?? '?';
  const container = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (youWon) {
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
      } else {
        const tl = gsap.timeline();
        tl.from('[data-lose="icon"]', { y: -40, opacity: 0, duration: 0.45, ease: 'bounce.out' });
        tl.to('[data-lose="icon"]', {
          x: -6,
          duration: 0.06,
          repeat: 5,
          yoyo: true,
          ease: 'power1.inOut',
        });
        tl.from('[data-lose="text"]', { opacity: 0, y: 10, duration: 0.3 }, '-=0.1');
      }
    },
    { scope: container },
  );

  return (
    <div
      ref={container}
      data-result={youWon ? 'win' : 'lose'}
      className={`absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl text-center ${
        youWon ? 'bg-white/85' : 'bg-slate-800/85 text-white'
      }`}
    >
      {youWon ? (
        <>
          <div className="flex justify-center gap-2 text-3xl font-extrabold text-emerald-500">
            {CELEBRATION.map((L) => (
              <span key={L} data-celebrate="letter">
                {L}
              </span>
            ))}
          </div>
          <h2 data-celebrate="banner" className="text-2xl font-bold">
            🎉 Bạn thắng!
          </h2>
        </>
      ) : (
        <>
          <div data-lose="icon" className="text-5xl">
            😔
          </div>
          <div data-lose="text">
            <h2 className="text-2xl font-bold">{winnerName} thắng!</h2>
            <p className="mt-1 text-sm text-slate-300">Chúc may mắn lần sau</p>
          </div>
        </>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onPlayAgain}
          className="rounded bg-emerald-600 px-4 py-2 font-medium text-white"
        >
          Chơi lại
        </button>
        <button
          type="button"
          onClick={onLeave}
          className={`rounded px-4 py-2 font-medium ${
            youWon ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-900'
          }`}
        >
          Thoát phòng
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vobo/web test components/ResultOverlay.test.tsx`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/ResultOverlay.tsx apps/web/components/ResultOverlay.test.tsx
git commit -m "feat(web): ResultOverlay — winner/loser overlay + play-again for all"
```

---

### Task 3: Web — rewire RoomView finished branch, retire FinishedPanel

**Files:**
- Modify: `apps/web/components/RoomView.tsx`
- Modify: `apps/web/components/RoomView.test.tsx`
- Delete: `apps/web/components/FinishedPanel.tsx`, `apps/web/components/FinishedPanel.test.tsx`

- [ ] **Step 1: Add the failing test (append to the existing describe block)**

In `apps/web/components/RoomView.test.tsx`, add this test inside `describe('RoomView', ...)`, after the existing tests (the file already imports render/screen, `RoomView`/`RoomActions`, `RoomSnapshot`, and defines `actions` and `ordered`):
```tsx
  it('renders the result overlay over the board when finished (buttons for non-host too)', () => {
    const snap: RoomSnapshot = {
      code: 'K7QX9P',
      status: 'finished',
      hostId: 'other', // you are NOT the host -> proves no host gating
      youId: 'you',
      roster: [
        { id: 'you', name: 'An', isBot: false, connected: true },
        { id: 'b', name: 'Bình', isBot: false, connected: true },
      ],
      view: {
        phase: 'finished',
        you: { id: 'you', card: ordered, marked: ordered.map(() => false), completedLines: 0, ready: true },
        opponents: [{ id: 'b', name: 'Bình', isBot: false, completedLines: 0, connected: true, ready: true }],
        calledNumbers: [],
        currentPlayerId: 'you',
        winners: ['b'], // Bình won -> you see the loser overlay
      },
      turnStartedAt: null,
      turnEndsAt: null,
      turnMs: 20000,
      rolling: false,
    };
    render(<RoomView snapshot={snap} actions={actions} />);
    expect(document.querySelector('[data-result="lose"]')).toBeTruthy(); // overlay present
    expect(screen.getByRole('button', { name: 'Chơi lại' })).toBeInTheDocument(); // for all, host is 'other'
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument(); // board underneath
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vobo/web test components/RoomView.test.tsx`
Expected: FAIL — the current finished branch renders `FinishedPanel` (no `data-result` overlay; non-host sees "Chờ chủ phòng…" not "Chơi lại").

- [ ] **Step 3: Rewire RoomView**

In `apps/web/components/RoomView.tsx`:

(a) Replace the import line
```tsx
import { FinishedPanel } from './FinishedPanel';
```
with
```tsx
import { ResultOverlay } from './ResultOverlay';
```

(b) Replace the finished branch
```tsx
  if (snapshot.status === 'finished') {
    return (
      <FinishedPanel snapshot={snapshot} isHost={isHost} onNewGame={actions.newGame} onLeave={actions.leave} />
    );
  }
```
with
```tsx
  if (snapshot.status === 'finished') {
    return (
      <div className="relative mx-auto max-w-md">
        <div className="pointer-events-none opacity-40">
          <PlayerCarousel
            players={snapshot.roster}
            currentPlayerId={view.currentPlayerId}
            youId={snapshot.youId}
            turnStartedAt={snapshot.turnStartedAt}
            turnEndsAt={snapshot.turnEndsAt}
          />
          <GameBoard view={view} />
        </div>
        <ResultOverlay snapshot={snapshot} onPlayAgain={actions.newGame} onLeave={actions.leave} />
      </div>
    );
  }
```
(Leave everything else — the `isHost` constant used by the Lobby branch, the `setup` branch, the `playing`/`rolling` branches — unchanged.)

- [ ] **Step 4: Delete FinishedPanel and its test**

```bash
git rm apps/web/components/FinishedPanel.tsx apps/web/components/FinishedPanel.test.tsx
```

- [ ] **Step 5: Run the affected web tests to verify they pass**

Run: `pnpm --filter @vobo/web test components/RoomView.test.tsx`
Expected: PASS — the new finished test plus the existing lobby/playing tests are green.

- [ ] **Step 6: Verify no dangling references to FinishedPanel**

Run: `pnpm --filter @vobo/web typecheck`
Expected: PASS — no imports of the deleted `FinishedPanel` remain (RoomView was the only importer).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/RoomView.tsx apps/web/components/RoomView.test.tsx
git commit -m "feat(web): finished state shows ResultOverlay over dimmed board; retire FinishedPanel"
```

---

### Task 4: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Server suite**

Run: `pnpm --filter @vobo/server test`
Expected: PASS — all server tests green (returnToLobby now any-participant).

- [ ] **Step 2: Web suite**

Run: `pnpm --filter @vobo/web test`
Expected: PASS. Note the FinishedPanel test (3 tests) is gone and ResultOverlay (3) + the new RoomView finished test (1) are added; total should be ~42 tests, all green.

- [ ] **Step 3: Web typecheck**

Run: `pnpm --filter @vobo/web typecheck`
Expected: PASS.

- [ ] **Step 4: Web production build**

Run: `pnpm --filter @vobo/web build`
Expected: PASS — `next build` completes.

- [ ] **Step 5: Manual smoke (optional, if a dev env is available)**

`pnpm dev`, two browsers into one room, finish a game:
- The winner sees confetti + "🎉 Bạn thắng!" over the dimmed board; the loser sees the 😔 drop+shake + "{winner} thắng!".
- Both players see "Chơi lại" and "Thoát phòng". Either player clicking "Chơi lại" returns the whole room to the waiting room. "Thoát phòng" leaves to the landing page.
- With OS reduce-motion on, overlay content appears instantly with no confetti.

---

## Notes for the implementer

- **Reduced motion is the test default.** jsdom lacks `matchMedia`, so `prefersReducedMotion()` returns `true` and animations no-op. The winner confetti test overrides `window.matchMedia` to force the motion path and restores it after.
- **`data-result="win"|"lose"`** on the overlay root is the stable test/automation hook — don't remove it.
- **The loser branch never calls `confetti`.** Keep the `confetti(...)` calls only inside the `youWon` branch.
- **`gsap`'s `bounce.out` / `back.out` / `power1.inOut` eases are in GSAP core** (EasePack) — no plugin import needed.
- **Do not reintroduce host gating** in the finished UI: the buttons are identical for every player; the server's membership guard is the only authorization.
