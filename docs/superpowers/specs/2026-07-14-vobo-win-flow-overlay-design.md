# Vobo Win-Flow Overlay + "Chơi lại" for Everyone — Design

**Date:** 2026-07-14
**Scope:** `apps/server` (one permission change) + `apps/web` (finished-state UI). No engine changes.
**Builds on:** the GSAP animations work (branch `feat/gsap-animations`) — reuses the confetti/celebration added to `FinishedPanel`.

## Goal

Change what happens when a game ends:

1. Instead of replacing the board with a separate full-screen `FinishedPanel`, keep the
   game screen visible (dimmed) and show a **result overlay** on top of it, with a
   **winner** celebration and a distinct **loser** effect.
2. Show **"Chơi lại"** and **"Thoát phòng"** buttons to **every** player. Pressing
   "Chơi lại" sends the whole room back to the waiting room (lobby) — no longer
   host-only.

## Non-Goals

- No change to the lobby / setup flow: after "Chơi lại", the room is back in the
  waiting room, where the host still presses "Bắt đầu" and players re-fill cards
  (existing behavior of `returnToLobby`).
- No new server events. "Chơi lại" continues to use the existing `room:newGame` →
  `returnToLobby` path; only its permission check changes.
- No engine changes.

## Server Change (`apps/server`)

### `RoomManager.returnToLobby(code, playerId)` — `apps/server/src/roomManager.ts`

Currently host-only:
```ts
if (room.hostId !== hostId) return fail('not_host', 'Chỉ chủ phòng mới mở ván mới');
```

**New behavior:** any **participant** of the finished game may trigger the return to the
waiting room. Replace the host check with a **membership** check (so a non-participant
still cannot reset someone else's room). Keep the finished-phase guard, which also gives
idempotency — a second presser after the first transition finds `phase !== 'finished'`
and gets a harmless `not_finished` failure the client ignores.

New guard order in `returnToLobby(code, playerId)`:
```ts
const room = this.store.get(code);
if (!room) return fail('no_room', 'Không tìm thấy phòng');
if (!room.state || room.state.phase !== 'finished') {
  return fail('not_finished', 'Ván chưa kết thúc');
}
if (!room.state.players.some((p) => p.id === playerId)) {
  return fail('not_player', 'Bạn không ở trong ván này');
}
// ...existing roster-rebuild + state reset unchanged...
```

- Rename the parameter `hostId` → `playerId` for clarity.
- The socket handler `room:newGame` already passes `c.playerId` (the connected
  player) and needs no change beyond the rename ripple.

### Tests — `apps/server/src/roomManager.newgame.test.ts`

The existing `describe('RoomManager.returnToLobby')` has a "rejects non-host and
not-finished" test asserting `'ghost'` → `not_host`. Update it:

- Change the `'ghost'` (non-participant) expectation from `not_host` → **`not_player`**.
- Keep the not-finished case → `not_finished`.
- Add a test: a **non-host participant** (a second connected human, e.g. `Bình`) calling
  `returnToLobby` on a finished room **succeeds** and the room returns to lobby
  (`room.state` undefined). The existing `finishedRoom()` helper has `Bình` *leave*
  mid-game (seat removed), so this test needs a small finished room where a second human
  is still seated — build it inline or add a helper variant.

## Web Changes (`apps/web`)

### New component — `apps/web/components/ResultOverlay.tsx`

An absolutely-positioned overlay rendered on top of the (dimmed) game screen when the
room is finished. Props:
```ts
{
  snapshot: RoomSnapshot;
  onPlayAgain: () => void;   // wired to actions.newGame
  onLeave: () => void;       // wired to actions.leave
}
```
Behavior:
- Derive `winnerId = snapshot.view?.winners[0]`, `youWon = winnerId === snapshot.youId`,
  `winnerName = roster.find(id === winnerId)?.name ?? '?'`.
- **Winner branch** (`youWon`): bright translucent backdrop; the B-I-N-G-O letters
  stagger in; "🎉 Bạn thắng!" springs in; `canvas-confetti` double-burst. (This is the
  celebration currently living in `FinishedPanel` — moved here.)
- **Loser branch** (`!youWon`): a somber, grayed backdrop; a 😔 icon drops in from the
  top and does a short shake (GSAP); text "{winnerName} thắng!" and "Chúc may mắn lần
  sau"; **no confetti**.
- **Buttons for everyone:** "Chơi lại" (`onPlayAgain`) and "Thoát phòng" (`onLeave`).
- Reduced-motion: no tweens, no confetti — content appears instantly (jsdom default).
- Uses `useGSAP` scoped to the overlay container and the shared `motion.ts` guard.
- The overlay carries a stable test hook: `data-result="win"` or `data-result="lose"`
  on its root so tests can assert which branch rendered.

### `RoomView.tsx` — finished branch

Replace:
```tsx
if (snapshot.status === 'finished') {
  return <FinishedPanel snapshot={snapshot} isHost={isHost} onNewGame={actions.newGame} onLeave={actions.leave} />;
}
```
with: render the same playing layout (PlayerCarousel + GameBoard) in a **dimmed,
non-interactive** wrapper, and overlay `ResultOverlay` on top:
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
- `GameBoard` is rendered with `isYourTurn` defaulting to `false` → nothing clickable;
  the wrapper's `pointer-events-none` + `opacity-40` dim it further.
- The host-only gating is gone: the overlay's buttons are identical for every player.

### Retire `FinishedPanel`

- Delete `apps/web/components/FinishedPanel.tsx` and
  `apps/web/components/FinishedPanel.test.tsx`; remove its import from `RoomView.tsx`.
- Its celebration logic (confetti + B-I-N-G-O stagger) lives on in `ResultOverlay`'s
  winner branch, so nothing is lost.

### Labels

- "Ván mới" → **"Chơi lại"**.
- "Về sảnh chính" → **"Thoát phòng"** (same `actions.leave` action).

## Data Flow

Any player clicks "Chơi lại" → `actions.newGame()` → socket `room:newGame` →
`returnToLobby(code, playerId)` (now any player) → room state cleared → `orchestrate()`
pushes the lobby snapshot to everyone → all clients render the waiting room. First click
wins; later clicks no-op.

"Thoát phòng" → `actions.leave()` → existing leave path → client returns to landing.

## Testing & Non-Regression

- **Server:** returnToLobby non-host success + still-`not_finished` guard (Vitest).
- **Web (`ResultOverlay.test.tsx`):**
  - Winner branch: `data-result="win"`, "🎉 Bạn thắng!" present, confetti mock called
    when motion is allowed (override `window.matchMedia`), not called under reduced
    motion.
  - Loser branch: `data-result="lose"`, "{winner} thắng!" present, confetti **not**
    called.
  - Both branches render "Chơi lại" and "Thoát phòng"; clicking them invokes
    `onPlayAgain` / `onLeave`.
- **Web (`RoomView.test.tsx`):** finished snapshot renders the board + overlay (assert
  a `ResultOverlay` hook is present) with no host-specific gating; update any existing
  assertions that referenced `FinishedPanel`.
- `canvas-confetti` remains globally mocked in `vitest.setup.ts`.
- **Gates:** `pnpm --filter @vobo/server test`, `pnpm --filter @vobo/web test`,
  `pnpm --filter @vobo/web typecheck`, `pnpm --filter @vobo/web build`.

## File Structure

- Modify: `apps/server/src/roomManager.ts` — drop host check in `returnToLobby`.
- Modify: `apps/server/src/roomManager.*.test.ts` — non-host returnToLobby tests.
- Create: `apps/web/components/ResultOverlay.tsx` — winner/loser overlay + buttons.
- Create: `apps/web/components/ResultOverlay.test.tsx`.
- Modify: `apps/web/components/RoomView.tsx` — finished branch → board + overlay.
- Modify: `apps/web/components/RoomView.test.tsx` — finished assertions.
- Delete: `apps/web/components/FinishedPanel.tsx`, `apps/web/components/FinishedPanel.test.tsx`.

## Risk

- Low. The only behavioral server change is widening a permission (host → any player)
  guarded by the finished phase. The web change is presentational + reuses existing
  celebration code. Confetti/GSAP failures degrade gracefully (buttons and text remain).
