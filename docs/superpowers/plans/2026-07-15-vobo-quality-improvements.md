# Vobo Bingo Quality Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 quality-of-life improvements: host kick, double-click prevention, auto-remove on disconnect, in-game chat, all-players vote-to-replay, back button, and room cleanup when only bots remain.

**Architecture:** Server-side changes add to Room/RoomManager (kick, disconnect timers, replay votes) and a new ChatManager. Frontend gets a ChatPanel component and modified Lobby/ResultOverlay/RoomView. All follow existing Socket.IO ack pattern.

**Tech Stack:** TypeScript (server + engine), React 19 + Next.js 15 + Tailwind CSS 3 (web), Socket.IO 4.8

**Design Doc:** `docs/superpowers/specs/2026-07-15-vobo-quality-improvements-design.md`

## Global Constraints

- Must not break existing room create/join/play flow
- Follow existing Vietnamese-language UI conventions
- Use same Socket.IO ack pattern for client-server calls
- No new npm dependencies
- No database changes (in-memory only)
- Backward compatible: rooms without new fields still work

---

### Task 1: Server Types & Config — Add new types, events, config constants

**Files:**
- Modify: `apps/server/src/types.ts`
- Modify: `apps/server/src/config.ts`

**Interfaces:**
- Produces: `ChatMessage`, updated `Room` (with `disconnectTimers`, `replayVotes`, `messages`), updated `RoomSnapshot` (with `replayVotes`), new `ClientToServerEvents` handlers, new `ServerToClientEvents` handlers, `DISCONNECT_GRACE_MS` in `RoomConfig`

- [ ] **Step 1: Add DISCONNECT_GRACE_MS to config**

In `apps/server/src/config.ts`, add the new constant:

```ts
export interface RoomConfig {
  maxPlayers: number;
  minPlayers: number;
  turnMs: number;
  botDelayMs: number;
  revealMs: number;
  disconnectGraceMs: number; // ADD
}

export const DEFAULT_CONFIG: RoomConfig = {
  maxPlayers: 6,
  minPlayers: 2,
  turnMs: 20_000,
  botDelayMs: 1_200,
  revealMs: 1_500,
  disconnectGraceMs: 30_000, // ADD: 30-second grace before auto-removal
};
```

- [ ] **Step 2: Add ChatMessage type and update Room interface**

In `apps/server/src/types.ts`, add the ChatMessage interface and update Room:

```ts
// ADD after existing imports:
export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

// ADD these fields to the Room interface (after existing fields):
export interface Room {
  // ... existing fields unchanged ...
  disconnectTimers?: Map<string, NodeJS.Timeout>; // playerId -> timeout for auto-removal
  replayVotes?: Set<string>; // playerIds who voted to replay (finished phase)
  messages?: ChatMessage[]; // in-room chat history (max 100)
}
```

Actually edit the Room interface to add the new optional fields inline:

```ts
export interface Room {
  code: string;
  hostId: string;
  gameId: 'bingo';
  roster: PlayerSeat[];
  state?: BingoState;
  seats: Map<string, Seat>;
  rng: Rng;
  botRng: Rng;
  turnStartedAt?: number;
  turnEndsAt?: number;
  turnMs: number;
  lastWinnerId?: string;
  rolling?: boolean;
  revealDone?: boolean;
  wins: Record<string, number>;
  winRecorded?: boolean;
  // NEW FIELDS:
  disconnectTimers?: Map<string, ReturnType<typeof setTimeout>>;
  replayVotes?: Set<string>;
  messages?: ChatMessage[];
}
```

- [ ] **Step 3: Update RoomSnapshot with replayVotes**

In `apps/server/src/types.ts`, add `replayVotes` to `RoomSnapshot`:

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
  turnMs: number;
  rolling: boolean;
  replayVotes: string[]; // ADD: list of playerIds who voted to replay
}
```

- [ ] **Step 4: Add new Socket.IO event types**

In `apps/server/src/types.ts`, add to `ClientToServerEvents`:

```ts
export interface ClientToServerEvents {
  // ... existing events unchanged ...
  'room:kick': (p: { targetPlayerId: string }, ack: (r: Ack<OkAck>) => void) => void; // ADD
  'room:readyToReplay': (ack: (r: Ack<OkAck>) => void) => void; // ADD
  'chat:send': (p: { text: string }, ack: (r: Ack<OkAck>) => void) => void; // ADD
}
```

Add to `ServerToClientEvents`:

```ts
export interface ServerToClientEvents {
  // ... existing events unchanged ...
  'kicked': (p: { reason: string }) => void; // ADD
  'chat:message': (msg: ChatMessage) => void; // ADD
}
```

- [ ] **Step 5: Verify types compile**

```bash
cd apps/server; npx tsc --noEmit
```

Expected: No type errors (there may be existing warnings unrelated to our changes).

---

### Task 2: Server RoomManager — Kick, Auto-Disconnect Timer, Replay Votes

**Files:**
- Modify: `apps/server/src/roomManager.ts`

**Interfaces:**
- Consumes: `ChatMessage` type from Task 1, Room with new fields
- Produces: `kickPlayer()`, updated `markDisconnected()` with timer, `cancelDisconnectTimer()`, `readyToReplay()`, updated `returnToLobby()`

- [ ] **Step 1: Add kickPlayer method**

In `apps/server/src/roomManager.ts`, add after the `addBot` method:

```ts
  kickPlayer(code: string, hostId: string, targetPlayerId: string): OpResult {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (room.hostId !== hostId) return fail('not_host', 'Chỉ chủ phòng mới có quyền đá');
    if (room.state) return fail('already_started', 'Không thể đá khi ván đã bắt đầu');
    if (hostId === targetPlayerId) return fail('cannot_kick_self', 'Không thể tự đá chính mình');
    const target = room.roster.find((p) => p.id === targetPlayerId);
    if (!target) return fail('no_player', 'Người chơi không tồn tại');
    if (target.isBot) return fail('no_player', 'Không thể đá bot');
    // Remove from roster and seats
    room.roster = room.roster.filter((p) => p.id !== targetPlayerId);
    room.seats.delete(targetPlayerId);
    // Cancel any disconnect timer for this player
    room.disconnectTimers?.get(targetPlayerId);
    const t = room.disconnectTimers?.get(targetPlayerId);
    if (t) { clearTimeout(t); room.disconnectTimers!.delete(targetPlayerId); }
    return { ok: true };
  }
```

- [ ] **Step 2: Update markDisconnected to start a 30s auto-remove timer**

Replace the existing `markDisconnected` method:

```ts
  markDisconnected(code: string, playerId: string): void {
    const room = this.store.get(code);
    if (!room) return;
    const seat = room.seats.get(playerId);
    if (!seat) return;
    seat.socketId = undefined;
    // Start auto-remove timer
    if (!room.disconnectTimers) room.disconnectTimers = new Map();
    // Clear existing timer if any (shouldn't happen, but safe)
    const existing = room.disconnectTimers.get(playerId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      const currentRoom = this.store.get(code);
      if (!currentRoom) return;
      // Only remove if still disconnected (not reconnected in the meantime)
      const currentSeat = currentRoom.seats.get(playerId);
      if (currentSeat && !currentSeat.socketId) {
        this.leave(code, playerId);
      }
    }, this.cfg.disconnectGraceMs);
    room.disconnectTimers.set(playerId, timer);
  }
```

Note: We need to make `leave` callable internally since we now call it from the timer. It already takes `(code, playerId)` directly, so this works.

- [ ] **Step 3: Add cancelDisconnectTimer (called on resume)**

Add a helper method:

```ts
  cancelDisconnectTimer(code: string, playerId: string): void {
    const room = this.store.get(code);
    if (!room?.disconnectTimers) return;
    const t = room.disconnectTimers.get(playerId);
    if (t) { clearTimeout(t); room.disconnectTimers.delete(playerId); }
  }
```

- [ ] **Step 4: Update resume to cancel disconnect timer**

In the existing `resume` method, after finding the player, cancel their disconnect timer:

Find the line `return { ok: true, playerId };` in `resume()` and replace with:
```ts
    for (const [playerId, seat] of room.seats) {
      if (seat.token === token) {
        this.cancelDisconnectTimer(code, playerId);
        return { ok: true, playerId };
      }
    }
```

- [ ] **Step 5: Add readyToReplay method**

Add after `returnToLobby`:

```ts
  voteReplay(code: string, playerId: string): OpResult<{ allReady: boolean }> {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (!room.state || room.state.phase !== 'finished') {
      return fail('not_finished', 'Ván chưa kết thúc');
    }
    if (!room.seats.has(playerId)) return fail('not_player', 'Bạn không ở trong phòng');
    if (!room.replayVotes) room.replayVotes = new Set();
    room.replayVotes.add(playerId);
    const allReady = room.replayVotes.size >= room.seats.size;
    if (allReady) {
      room.replayVotes = undefined;
      this.returnToLobby(code, playerId);
    }
    return { ok: true, allReady };
  }
```

- [ ] **Step 6: Update returnToLobby to also clear replayVotes**

In `returnToLobby`, after setting `room.state = undefined`, add:
```ts
    room.replayVotes = undefined;
```

- [ ] **Step 7: Update snapshotFor in socketServer.ts to include replayVotes**

We'll do this in Task 3.

- [ ] **Step 8: Verify types compile**

```bash
cd apps/server; npx tsc --noEmit
```

Expected: No type errors.

---

### Task 3: Server SocketServer — Wire kick, chat, replay events, update disconnect/broadcast

**Files:**
- Modify: `apps/server/src/socketServer.ts`
- Create: `apps/server/src/chatManager.ts`

**Interfaces:**
- Consumes: RoomManager methods from Task 2, ChatManager from this task
- Produces: Updated socket event handlers

- [ ] **Step 1: Create ChatManager**

Create `apps/server/src/chatManager.ts`:

```ts
import type { ChatMessage } from './types';

export class ChatManager {
  private store = new Map<string, ChatMessage[]>(); // roomCode -> messages

  getMessages(code: string): ChatMessage[] {
    return this.store.get(code) ?? [];
  }

  private nextId = 0;

  addMessage(code: string, playerId: string, playerName: string, text: string): ChatMessage {
    const msg: ChatMessage = {
      id: `msg_${++this.nextId}`,
      playerId,
      playerName,
      text: text.slice(0, 500), // max 500 chars
      timestamp: Date.now(),
    };
    let list = this.store.get(code);
    if (!list) {
      list = [];
      this.store.set(code, list);
    }
    list.push(msg);
    // Keep only last 100 messages
    if (list.length > 100) list.splice(0, list.length - 100);
    return msg;
  }
}
```

- [ ] **Step 2: Update snapshotFor to include replayVotes**

In `apps/server/src/socketServer.ts`, update the `snapshotFor` function's return:

```ts
    return {
      code: room.code,
      status: room.state ? room.state.phase : 'lobby',
      hostId: room.hostId,
      youId: playerId,
      roster,
      view,
      turnStartedAt: room.state?.phase === 'playing' ? (room.turnStartedAt ?? null) : null,
      turnEndsAt: room.state?.phase === 'playing' ? (room.turnEndsAt ?? null) : null,
      turnMs: room.turnMs,
      rolling: room.state?.phase === 'playing' ? (room.rolling ?? false) : false,
      replayVotes: room.replayVotes ? [...room.replayVotes] : [], // ADD
    };
```

- [ ] **Step 3: Update attachSocketServer signature to accept ChatManager**

Change the function signature:

```ts
export function attachSocketServer(
  io: Io,
  manager: RoomManager,
  store: RoomStore,
  cfg: RoomConfig,
  chat: ChatManager, // ADD
): void {
```

- [ ] **Step 4: Add room:kick handler**

Add after `room:leave` handler in the socket connection callback:

```ts
    socket.on('room:kick', ({ targetPlayerId }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.kickPlayer(c.code, c.playerId, targetPlayerId);
      ack(r.ok ? { ok: true } : { ok: false, code: r.code, message: r.message } as Ack<OkAck>);
      if (r.ok) {
        // Notify the kicked player
        const room = store.get(c.code);
        const kickedSeat = room?.seats.get(targetPlayerId);
        // seat was already deleted by kickPlayer, so check roster
        const kickedSocketId = [...(io.sockets.adapter.rooms.get(c.code) ?? [])].find(
          (sid) => {
            const s = io.sockets.sockets.get(sid);
            // Can't easily check playerId here, just emit to all and let client filter
            return false; // client-side handling via snapshot change
          }
        );
        // Broadcast updated state first
        broadcast(c.code);
        broadcastRooms();
      }
    });
```

Wait — the kicked player's socket is still connected but they won't be in the room anymore. We need to emit the `kicked` event before their seat is deleted. Let me revise the approach: emit `kicked` from kickPlayer itself, or handle it in socketServer.

Better approach — kickPlayer deletes the seat, but we store the socketId before deletion:

```ts
    socket.on('room:kick', ({ targetPlayerId }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const room = store.get(c.code);
      const targetSocketId = room?.seats.get(targetPlayerId)?.socketId;
      const r = manager.kickPlayer(c.code, c.playerId, targetPlayerId);
      ack(r.ok ? { ok: true } : { ok: false, code: r.code, message: r.message } as Ack<OkAck>);
      if (r.ok) {
        if (targetSocketId) {
          io.to(targetSocketId).emit('kicked', { reason: 'Bạn đã bị đá khỏi phòng' });
        }
        broadcast(c.code);
        broadcastRooms();
      }
    });
```

- [ ] **Step 5: Add chat:send handler**

```ts
    socket.on('chat:send', ({ text }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      if (!text || !text.trim()) {
        return ack({ ok: false, code: 'empty_text', message: 'Tin nhắn trống' });
      }
      const room = store.get(c.code);
      const player = room?.roster.find((p) => p.id === c.playerId)
        ?? room?.state?.players.find((p) => p.id === c.playerId);
      const name = player?.name ?? '?';
      const msg = chat.addMessage(c.code, c.playerId, name, text.trim());
      io.to(c.code).emit('chat:message', msg);
      ack({ ok: true });
    });
```

- [ ] **Step 6: Add room:readyToReplay handler**

```ts
    socket.on('room:readyToReplay', (ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.voteReplay(c.code, c.playerId);
      ack(r.ok ? { ok: true } : { ok: false, code: r.code, message: r.message } as Ack<OkAck>);
      if (r.ok) {
        if (r.allReady) {
          orchestrate(c.code);
          broadcastRooms();
        } else {
          broadcast(c.code);
        }
      }
    });
```

- [ ] **Step 7: Update disconnect handler to NOT clear the turn timer (auto-remove now handled by markDisconnected)**

The existing `disconnect` handler already calls `manager.markDisconnected(code, playerId)` which now includes the timer. This is correct. No change needed.

But we need to make sure that when `leave` is called by the disconnect timer, it triggers `orchestrate` and `broadcastRooms`. Currently the `leave` method just returns a result - the timer calls it directly, not through the socket handler. So orchestrate won't run.

We need to handle this. When the disconnect timer fires and calls `leave()`, we need to broadcast. But since the timer is in RoomManager and broadcast is in socketServer, we need another approach.

Option: Pass a broadcast callback to RoomManager. Or: Have markDisconnected store the timeout and have a method to check pending timeouts. 

Simplest: The timer's leave() returns `{ roomDeleted }`, and we have room manager emit an event. But RoomManager doesn't know about Socket.IO.

Better: Have the socketServer regularly check, or restructure. Actually, the simplest fix: In the disconnect timer callback inside `markDisconnected`, after calling `leave`, we can just... but RoomManager doesn't have access to broadcast.

Let me restructure: Move the disconnect timer logic to `socketServer.ts` instead.

Actually, let's change the approach: Instead of putting the timer in RoomManager, put it in socketServer.ts where we have access to `broadcast`. In the socketServer's `disconnect` handler, after calling `manager.markDisconnected()`, start the 30s timer there:

```ts
    socket.on('disconnect', () => {
      const c = requireConn();
      if (!c) return;
      manager.markDisconnected(c.code, c.playerId);
      broadcast(c.code);
      // Start auto-remove timer
      const room = store.get(c.code);
      if (!room) return;
      if (!room.disconnectTimers) room.disconnectTimers = new Map();
      const existing = room.disconnectTimers.get(c.playerId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        const currentRoom = store.get(c.code);
        if (!currentRoom) return;
        const seat = currentRoom.seats.get(c.playerId);
        if (seat && !seat.socketId) {
          // Still disconnected after grace period — remove them
          const r = manager.leave(c.code, c.playerId);
          if (r.ok && !r.roomDeleted) orchestrate(c.code);
          else if (r.ok && r.roomDeleted) clearTurnTimer(c.code);
          if (r.ok) broadcastRooms();
          currentRoom.disconnectTimers?.delete(c.playerId);
        }
      }, cfg.disconnectGraceMs);
      room.disconnectTimers.set(c.playerId, timer);
    });
```

But then `markDisconnected` should just set `socketId = undefined` (no timer). Let me keep it simple: reverting markDisconnected to original, and putting all timer logic in socketServer.

Actually, let me reconsider. The simplest, cleanest approach:

1. `markDisconnected` stays as before: just sets `socketId = undefined`.
2. In `socketServer.ts` `disconnect` handler: after `markDisconnected`, start a 30s timeout that calls `manager.leave(code, playerId)` and triggers `orchestrate`/`broadcastRooms`.
3. In `resume` handler: cancel any existing disconnect timer.

This way RoomManager stays clean and socketServer handles all the orchestration.

In the disconnect timer, we also need to handle the kicked case (clear timer if player was kicked). The kick handler should also clear the timer.

Let me update the plan accordingly.

- [ ] **Step 7 (revised): Update disconnect handler with auto-remove timer**

Replace the existing `disconnect` handler:

```ts
    socket.on('disconnect', () => {
      const c = requireConn();
      if (!c) return;
      manager.markDisconnected(c.code, c.playerId);
      broadcast(c.code);

      // Start auto-remove timer (30s grace period)
      const room = store.get(c.code);
      if (!room) return;
      if (!room.disconnectTimers) room.disconnectTimers = new Map();
      const existing = room.disconnectTimers.get(c.playerId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        const currentRoom = store.get(c.code);
        if (!currentRoom) return;
        const seat = currentRoom.seats.get(c.playerId);
        if (seat && !seat.socketId) {
          const r = manager.leave(c.code, c.playerId);
          if (r.ok && !r.roomDeleted) orchestrate(c.code);
          else if (r.ok && r.roomDeleted) clearTurnTimer(c.code);
          if (r.ok) broadcastRooms();
        }
        currentRoom.disconnectTimers?.delete(c.playerId);
      }, cfg.disconnectGraceMs);
      room.disconnectTimers.set(c.playerId, timer);
    });
```

- [ ] **Step 8: Revert markDisconnected changes in roomManager.ts**

`markDisconnected` in roomManager.ts stays as original (no timer). The timer is in socketServer.

But we already changed it in Task 2. Let me undo that and put it back to original in the plan. Actually, let me just update Task 2 to NOT change markDisconnected.

OK let me finalize the plan approach:

**Task 2 (roomManager) changes:**
- `kickPlayer()` method — NEW
- `cancelDisconnectTimer()` — NEW (clears timer from room.disconnectTimers)
- `voteReplay()` — NEW
- `returnToLobby()` — add `room.replayVotes = undefined`
- `resume()` — add call to `cancelDisconnectTimer` before returning
- `markDisconnected` — STAYS AS IS (just sets socketId = undefined)

**Task 3 (socketServer) changes:**
- Disconnect handler — adds auto-remove timer
- Resume handler — after successful resume, cancel disconnect timer
- Kick handler — emits kicked event, cancels disconnect timer for target
- Chat handler — sends/receives messages
- Replay handler — votes and checks allReady
- snapshotFor — adds replayVotes

This is cleaner. Let me revise the plan accordingly.

Actually, given the complexity, let me just write the plan with the final, clean approach and not show the intermediate revisions. The agent executing the plan just needs the final code.

Let me re-write the plan document completely.<｜end▁of▁thinking｜>The plan is complex due to the auto-disconnect timer coordination between server modules. Let me rewrite it cleanly with the final approach.

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="write">
<｜｜DSML｜｜parameter name="content" string="true"># Vobo Bingo Quality Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 improvements: host kick, double-click prevention, auto-remove disconnected players, in-game chat, all-players vote-to-replay, back button, room cleanup when only bots remain.

**Architecture:** Server gets a ChatManager + new RoomManager methods (kick, voteReplay) + socket handlers for kick/chat/replay + disconnect timer in socketServer. Frontend gets ChatPanel component, kick button in Lobby, replay vote UI in ResultOverlay, back button in RoomView, loading guard on landing page.

**Tech Stack:** TypeScript, React 19 + Next.js 15 + Tailwind CSS 3, Socket.IO 4.8

**Design Doc:** `docs/superpowers/specs/2026-07-15-vobo-quality-improvements-design.md`

## Global Constraints

- Must not break existing room create/join/play flow
- Follow existing Vietnamese-language UI conventions
- Use same Socket.IO ack pattern
- No new npm dependencies
- Backward compatible

---

### Task 1: Server Types & Config

**Files:**
- Modify: `apps/server/src/types.ts` (lines 1-99)
- Modify: `apps/server/src/config.ts` (lines 1-18)

**Produces:** New types for ChatMessage, updated Room/RoomSnapshot, new event definitions, disconnectGraceMs config

- [ ] **Step 1: Add `disconnectGraceMs` to config**

In `apps/server/src/config.ts`, line 6, add `disconnectGraceMs`:

```ts
export interface RoomConfig {
  maxPlayers: number;
  minPlayers: number;
  turnMs: number;
  botDelayMs: number;
  revealMs: number;
  disconnectGraceMs: number;
}

export const DEFAULT_CONFIG: RoomConfig = {
  maxPlayers: 6,
  minPlayers: 2,
  turnMs: 20_000,
  botDelayMs: 1_200,
  revealMs: 1_500,
  disconnectGraceMs: 30_000,
};
```

- [ ] **Step 2: Add ChatMessage interface + update Room**

In `apps/server/src/types.ts`, after line 6 (after the `Seat` interface), add:

```ts
export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}
```

After line 24 (after `winRecorded?: boolean;`), add:

```ts
  disconnectTimers?: Map<string, ReturnType<typeof setTimeout>>;
  replayVotes?: Set<string>;
```

- [ ] **Step 3: Add `replayVotes` to RoomSnapshot**

In `apps/server/src/types.ts`, after line 61 (after `rolling: boolean;`), add:

```ts
  replayVotes: string[];
```

- [ ] **Step 4: Add new event types**

In `ClientToServerEvents`, after line 91 (`rooms:unsubscribe`), add:

```ts
  'room:kick': (p: { targetPlayerId: string }, ack: (r: Ack<OkAck>) => void) => void;
  'room:readyToReplay': (ack: (r: Ack<OkAck>) => void) => void;
  'chat:send': (p: { text: string }, ack: (r: Ack<OkAck>) => void) => void;
```

In `ServerToClientEvents`, after line 98 (`rooms:list`), add:

```ts
  'kicked': (p: { reason: string }) => void;
  'chat:message': (msg: ChatMessage) => void;
```

- [ ] **Step 5: Verify types compile**

```bash
cd apps/server; npx tsc --noEmit
```

Expected: No type errors.

---

### Task 2: Server RoomManager — kickPlayer, voteReplay, cancelDisconnectTimer

**Files:**
- Modify: `apps/server/src/roomManager.ts` (lines 1-245)

**Produces:** `kickPlayer()`, `voteReplay()`, `cancelDisconnectTimer()`, updated `returnToLobby()`, updated `resume()`

- [ ] **Step 1: Add kickPlayer method**

After `addBot` (line 67), add:

```ts
  kickPlayer(code: string, hostId: string, targetPlayerId: string): OpResult {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (room.hostId !== hostId) return fail('not_host', 'Chỉ chủ phòng mới có quyền đá');
    if (room.state) return fail('already_started', 'Không thể đá khi ván đã bắt đầu');
    if (hostId === targetPlayerId) return fail('cannot_kick_self', 'Không thể tự đá chính mình');
    const target = room.roster.find((p) => p.id === targetPlayerId);
    if (!target) return fail('no_player', 'Người chơi không tồn tại');
    if (target.isBot) return fail('no_player', 'Không thể đá bot');
    room.roster = room.roster.filter((p) => p.id !== targetPlayerId);
    room.seats.delete(targetPlayerId);
    return { ok: true };
  }
```

- [ ] **Step 2: Add cancelDisconnectTimer method**

After `attachSocket` (line 147), add:

```ts
  cancelDisconnectTimer(code: string, playerId: string): void {
    const room = this.store.get(code);
    if (!room?.disconnectTimers) return;
    const t = room.disconnectTimers.get(playerId);
    if (t) { clearTimeout(t); room.disconnectTimers.delete(playerId); }
  }
```

- [ ] **Step 3: Update resume to cancel disconnect timer**

In `resume` (line 154), change the return line inside the loop (line 158) from:
```ts
      if (seat.token === token) return { ok: true, playerId };
```
to:
```ts
      if (seat.token === token) {
        this.cancelDisconnectTimer(code, playerId);
        return { ok: true, playerId };
      }
```

- [ ] **Step 4: Add voteReplay method**

After `returnToLobby` (line 237), add:

```ts
  voteReplay(code: string, playerId: string): OpResult<{ allReady: boolean }> {
    const room = this.store.get(code);
    if (!room) return fail('no_room', 'Không tìm thấy phòng');
    if (!room.state || room.state.phase !== 'finished') {
      return fail('not_finished', 'Ván chưa kết thúc');
    }
    if (!room.seats.has(playerId)) return fail('not_player', 'Bạn không ở trong phòng');
    if (!room.replayVotes) room.replayVotes = new Set();
    if (room.replayVotes.has(playerId)) return { ok: true, allReady: false };
    room.replayVotes.add(playerId);
    const allReady = room.replayVotes.size >= room.seats.size;
    if (allReady) {
      room.replayVotes = undefined;
      this.returnToLobby(code, playerId);
    }
    return { ok: true, allReady };
  }
```

- [ ] **Step 5: Update returnToLobby to clear replayVotes**

In `returnToLobby` (line 220), after setting `room.state = undefined;` (line 233), add:
```ts
    room.replayVotes = undefined;
```

- [ ] **Step 6: Verify types compile**

```bash
cd apps/server; npx tsc --noEmit
```

Expected: No type errors.

---

### Task 3: Server ChatManager (new file)

**Files:**
- Create: `apps/server/src/chatManager.ts`

**Produces:** `ChatManager` class with `addMessage()` + `getMessages()`

- [ ] **Step 1: Create the file**

```ts
import type { ChatMessage } from './types';

export class ChatManager {
  private store = new Map<string, ChatMessage[]>();
  private nextId = 0;

  getMessages(_code: string): ChatMessage[] {
    return [];
  }

  addMessage(code: string, playerId: string, playerName: string, text: string): ChatMessage {
    const msg: ChatMessage = {
      id: `msg_${++this.nextId}`,
      playerId,
      playerName,
      text: text.slice(0, 500),
      timestamp: Date.now(),
    };
    let list = this.store.get(code);
    if (!list) {
      list = [];
      this.store.set(code, list);
    }
    list.push(msg);
    if (list.length > 100) list.splice(0, list.length - 100);
    return msg;
  }
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd apps/server; npx tsc --noEmit
```

Expected: No type errors.

---

### Task 4: Server SocketServer — Wire kick, chat, replay, disconnect timer

**Files:**
- Modify: `apps/server/src/socketServer.ts` (lines 1-259)
- Modify: `apps/server/src/index.ts` (lines 1-63)

**Produces:** Updated socket event handlers, ChatManager integration, disconnect auto-remove timer, replayVotes in snapshots

- [ ] **Step 1: Update imports and function signature**

At top of `socketServer.ts`, add import:
```ts
import { ChatManager } from './chatManager';
```

Change function signature (line 17) from:
```ts
export function attachSocketServer(io: Io, manager: RoomManager, store: RoomStore, cfg: RoomConfig): void {
```
to:
```ts
export function attachSocketServer(io: Io, manager: RoomManager, store: RoomStore, cfg: RoomConfig, chat: ChatManager): void {
```

- [ ] **Step 2: Add replayVotes to snapshotFor**

In `snapshotFor` return (line 43), after `rolling: room.state?.phase === 'playing' ? (room.rolling ?? false) : false,`, add:
```ts
      replayVotes: room.replayVotes ? [...room.replayVotes] : [],
```

- [ ] **Step 3: Update disconnect handler with auto-remove timer**

Replace the disconnect handler (lines 250-257) with:

```ts
    socket.on('disconnect', () => {
      const c = requireConn();
      if (!c) return;
      manager.markDisconnected(c.code, c.playerId);
      broadcast(c.code);

      const room = store.get(c.code);
      if (!room) return;
      if (!room.disconnectTimers) room.disconnectTimers = new Map();
      const existing = room.disconnectTimers.get(c.playerId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        const currentRoom = store.get(c.code);
        if (!currentRoom) return;
        const seat = currentRoom.seats.get(c.playerId);
        if (seat && !seat.socketId) {
          const r = manager.leave(c.code, c.playerId);
          if (r.ok && !r.roomDeleted) orchestrate(c.code);
          else if (r.ok && r.roomDeleted) clearTurnTimer(c.code);
          if (r.ok) broadcastRooms();
        }
        currentRoom.disconnectTimers?.delete(c.playerId);
      }, cfg.disconnectGraceMs);
      room.disconnectTimers.set(c.playerId, timer);
    });
```

- [ ] **Step 4: Cancel disconnect timer on resume**

In the `room:resume` handler (line 164), after `manager.attachSocket(code, r.playerId, socket.id);` (line 169), add:
```ts
      manager.cancelDisconnectTimer(code, r.playerId);
```

- [ ] **Step 5: Add room:kick handler**

After `room:leave` handler (line 227), add:

```ts
    socket.on('room:kick', ({ targetPlayerId }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const room = store.get(c.code);
      const targetSocketId = room?.seats.get(targetPlayerId)?.socketId;
      // Cancel any disconnect timer for the target
      manager.cancelDisconnectTimer(c.code, targetPlayerId);
      const r = manager.kickPlayer(c.code, c.playerId, targetPlayerId);
      ack(r.ok ? { ok: true } : { ok: false, code: r.code, message: r.message } as Ack<OkAck>);
      if (r.ok) {
        if (targetSocketId) {
          io.to(targetSocketId).emit('kicked', { reason: 'Bạn đã bị đá khỏi phòng' });
        }
        broadcast(c.code);
        broadcastRooms();
      }
    });
```

- [ ] **Step 6: Add room:readyToReplay handler**

After `room:newGame` handler (line 238), add:

```ts
    socket.on('room:readyToReplay', (ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      const r = manager.voteReplay(c.code, c.playerId);
      ack(r.ok ? { ok: true } : { ok: false, code: r.code, message: r.message } as Ack<OkAck>);
      if (r.ok) {
        if (r.allReady) {
          orchestrate(c.code);
          broadcastRooms();
        } else {
          broadcast(c.code);
        }
      }
    });
```

- [ ] **Step 7: Add chat:send handler**

After `room:readyToReplay` handler, add:

```ts
    socket.on('chat:send', ({ text }, ack) => {
      const c = requireConn();
      if (!c) return ack({ ok: false, code: 'no_conn', message: 'Chưa vào phòng' });
      if (!text || !text.trim()) {
        return ack({ ok: false, code: 'empty_text', message: 'Tin nhắn trống' });
      }
      const room = store.get(c.code);
      const player = room?.roster.find((p) => p.id === c.playerId)
        ?? room?.state?.players.find((p: { id: string }) => p.id === c.playerId);
      const name = player?.name ?? '?';
      const msg = chat.addMessage(c.code, c.playerId, name, text.trim());
      io.to(c.code).emit('chat:message', msg);
      ack({ ok: true });
    });
```

- [ ] **Step 8: Update index.ts to create ChatManager**

In `apps/server/src/index.ts`, add import (line 4 area):
```ts
import { ChatManager } from './chatManager';
```

After `const manager = new RoomManager(store, DEFAULT_CONFIG);` (line 41), add:
```ts
  const chat = new ChatManager();
```

Change `attachSocketServer(io, manager, store, DEFAULT_CONFIG);` to:
```ts
  attachSocketServer(io, manager, store, DEFAULT_CONFIG, chat);
```

- [ ] **Step 9: Verify types compile**

```bash
cd apps/server; npx tsc --noEmit
```

Expected: No type errors.

---

### Task 5: Frontend Types + Socket Provider — Add new actions + loading states

**Files:**
- Modify: `apps/web/lib/types.ts` (lines 1-56)
- Modify: `apps/web/lib/socket.tsx` (lines 1-123)

**Produces:** Updated client types with ChatMessage/replayVotes/kicked, new socket actions (kick, readyToReplay, sendChat), loading states for create/join

- [ ] **Step 1: Add new types to client types**

In `apps/web/lib/types.ts`, add after imports:

```ts
export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}
```

Add `replayVotes` to `RoomSnapshot` (after `rolling: boolean;`):

```ts
  replayVotes: string[];
```

- [ ] **Step 2: Add new actions + loading states to SocketProvider**

In `apps/web/lib/socket.tsx`, add new actions to `SocketContextValue` interface (after `newGame`):

```ts
  kickPlayer: (targetPlayerId: string) => Promise<Ok>;
  readyToReplay: () => Promise<Ok>;
  sendChat: (text: string) => Promise<Ok>;
  messages: ChatMessage[];
  joining: boolean;
```

Add import: `import type { ChatMessage } from './types';` (update existing import line).

Add `const [joining, setJoining] = useState(false);` and `const [messages, setMessages] = useState<ChatMessage[]>([]);` state variables.

Add socket listener in useEffect:
```ts
    socket.on('chat:message', (msg: ChatMessage) => {
      setMessages((prev) => [...prev.slice(-99), msg]);
    });
    socket.on('kicked', () => {
      setSnapshot(null);
      window.location.href = '/';
    });
```

Update `createRoom` action:
```ts
    createRoom: async (name, turnMs) => {
      setJoining(true);
      const r = await emit<Ack<{ code: string; playerId: string; token: string }>>('room:create', { name, turnMs });
      setJoining(false);
      if (r.ok) saveToken(r.code, r.token);
      return r;
    },
```

Update `joinRoom` action:
```ts
    joinRoom: async (code, name) => {
      setJoining(true);
      const r = await emit<Ack<{ playerId: string; token: string }>>('room:join', { code, name });
      setJoining(false);
      if (r.ok) saveToken(code, r.token);
      return r;
    },
```

Add new actions in value object:
```ts
    kickPlayer: (targetPlayerId) => emit('room:kick', { targetPlayerId }),
    readyToReplay: () => emit('room:readyToReplay'),
    sendChat: (text) => emit('chat:send', { text }),
    messages,
    setMessages,
```

Add `clearMessages` or handle in `clearSnapshot`: also clear messages when clearing snapshot.

Update `clearSnapshot`:
```ts
    clearSnapshot: () => { setSnapshot(null); setMessages([]); },
```

- [ ] **Step 3: Verify build compiles**

```bash
cd apps/web; npx next build 2>&1 | tail -20
```

Expected: Build succeeds (may have pre-existing issues, but no new ones).

---

### Task 6: Frontend Landing Page — Loading guard for join/create

**Files:**
- Modify: `apps/web/app/page.tsx` (lines 1-95)

**Produces:** Disabled buttons + loading text when joining/creating

- [ ] **Step 1: Add joining state to page**

In `apps/web/app/page.tsx`, import destructure `joining` from `useSocket()`:
```ts
  const { createRoom, joinRoom, connected, openRooms, subscribeRooms, unsubscribeRooms, joining } = useSocket();
```

- [ ] **Step 2: Disable buttons when joining**

Change the "Tạo phòng" button (line 66-72):
```tsx
      <button
        onClick={onCreate}
        disabled={!connected || joining}
        className="mb-4 w-full rounded bg-emerald-600 py-2 font-medium text-white disabled:opacity-40"
      >
        {joining ? 'Đang xử lý…' : 'Tạo phòng'}
      </button>
```

Change the "Vào" button (line 80-86):
```tsx
        <button
          onClick={() => joinCode(code)}
          disabled={!connected || joining}
          className="rounded bg-sky-600 px-4 font-medium text-white disabled:opacity-40"
        >
          Vào
        </button>
```

Also disable RoomList join buttons when joining. Update RoomList props to accept `disabled` (see line 92):
```tsx
      <RoomList rooms={openRooms} onJoin={(c) => joinCode(c)} disabled={!name.trim() || joining} />
```

- [ ] **Step 3: Verify build compiles**

```bash
cd apps/web; npx next build 2>&1 | tail -20
```

Expected: Build succeeds.

---

### Task 7: Frontend Lobby — Kick button

**Files:**
- Modify: `apps/web/components/Lobby.tsx` (lines 1-67)
- Modify: `apps/web/lib/socket.tsx` (add `kickPlayer` to RoomActions if needed)

**Produces:** Kick button next to each non-host player (host-only)

- [ ] **Step 1: Update Lobby props to include kick action**

In `apps/web/components/Lobby.tsx`, update props:

```ts
export function Lobby({
  snapshot,
  isHost,
  onAddBot,
  onStart,
  onKick,
}: {
  snapshot: RoomSnapshot;
  isHost: boolean;
  onAddBot: (d: Difficulty) => void;
  onStart: () => void;
  onKick: (playerId: string) => void;
}) {
```

- [ ] **Step 2: Add kick button in player list**

In the roster map (line 26-33), add a kick button for non-host humans when current user is host:

```tsx
        {snapshot.roster.map((p) => (
          <li key={p.id} className="flex items-center gap-2 px-3 py-2">
            <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span>{p.name}</span>
            {p.isBot && <span className="text-xs text-slate-400">bot</span>}
            {p.id === snapshot.hostId && (
              <span className={`text-xs text-amber-600 ${p.isBot ? '' : 'ml-auto'}`}>chủ phòng</span>
            )}
            {isHost && !p.isBot && p.id !== snapshot.youId && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Đá ${p.name} khỏi phòng?`)) onKick(p.id);
                }}
                className="ml-auto rounded bg-rose-500 px-2 py-0.5 text-xs text-white hover:bg-rose-600"
              >
                Đá
              </button>
            )}
          </li>
        ))}
```

- [ ] **Step 3: Update RoomPage to pass onKick**

In `apps/web/app/room/[code]/page.tsx`, add `kickPlayer: s.kickPlayer` to actions:
```ts
  const actions: RoomActions = {
    addBot: s.addBot,
    start: s.start,
    fillCard: s.fillCard,
    ready: s.ready,
    call: s.call,
    newGame: s.newGame,
    kickPlayer: s.kickPlayer, // ADD
    // ... leave stays
  };
```

- [ ] **Step 4: Update RoomView to pass onKick**

In `apps/web/components/RoomView.tsx`, update `RoomActions` interface:
```ts
export interface RoomActions {
  addBot: (d: Difficulty) => Promise<unknown>;
  start: () => Promise<unknown>;
  fillCard: (card: number[]) => Promise<unknown>;
  ready: () => Promise<unknown>;
  call: (n: number) => Promise<unknown>;
  leave: () => Promise<unknown>;
  newGame: () => Promise<unknown>;
  kickPlayer: (targetPlayerId: string) => Promise<unknown>; // ADD
}
```

Update Lobby render (line 25) to pass onKick:
```tsx
    return <Lobby snapshot={snapshot} isHost={isHost} onAddBot={actions.addBot} onStart={actions.start} onKick={actions.kickPlayer} />;
```

- [ ] **Step 5: Verify build compiles**

```bash
cd apps/web; npx next build 2>&1 | tail -20
```

Expected: Build succeeds.

---

### Task 8: Frontend ChatPanel — New component

**Files:**
- Create: `apps/web/components/ChatPanel.tsx`

**Produces:** Chat panel component with toggle, message list, input

- [ ] **Step 1: Create ChatPanel component**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';

export function ChatPanel({
  messages,
  onSend,
  youId,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  youId: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function handleSend() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed right-3 top-3 z-50 rounded-full bg-slate-800 p-2 text-white shadow"
      >
        💬
      </button>

      {open && (
        <div className="fixed right-0 top-0 z-40 flex h-full w-72 flex-col border-l bg-white shadow-lg transition-transform">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="font-semibold">Chat</span>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-500">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            {messages.length === 0 && (
              <p className="text-center text-xs text-slate-400">Chưa có tin nhắn</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="mb-1">
                <span className={`text-xs font-medium ${m.playerId === youId ? 'text-emerald-600' : 'text-sky-600'}`}>
                  {m.playerName}
                </span>
                <span className="ml-1 text-sm">{m.text}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex border-t p-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nhập tin nhắn..."
              maxLength={500}
              className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
            />
            <button
              type="submit"
              className="ml-1 rounded bg-emerald-600 px-3 py-1 text-sm text-white"
            >
              Gửi
            </button>
          </form>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify build compiles**

```bash
cd apps/web; npx next build 2>&1 | tail -20
```

Expected: Build succeeds.

---

### Task 9: Frontend RoomView — Integrate ChatPanel + Back button

**Files:**
- Modify: `apps/web/components/RoomView.tsx` (lines 1-80)
- Modify: `apps/web/app/room/[code]/page.tsx` (lines 1-57)

**Produces:** ChatPanel in RoomView layout, back button

- [ ] **Step 1: Add ChatPanel + back button to RoomView**

In `apps/web/components/RoomView.tsx`, add import:
```tsx
import { ChatPanel } from './ChatPanel';
```

Update `RoomActions` interface to add:
```ts
  readyToReplay: () => Promise<unknown>; // ADD
  sendChat: (text: string) => Promise<unknown>; // ADD
```

Add `messages` prop to RoomView:
```tsx
export function RoomView({
  snapshot,
  actions,
  messages,
}: {
  snapshot: RoomSnapshot;
  actions: RoomActions;
  messages: { id: string; playerId: string; playerName: string; text: string; timestamp: number }[];
}) {
```

Add back button at the top of the main container. Wrap content in a fragment and add:

```tsx
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            if (confirm('Bạn có chắc muốn rời phòng?')) await actions.leave();
          }}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Quay lại
        </button>
        <div className="ml-auto text-xs text-slate-400">{snapshot.code}</div>
      </div>
```

Update the lobby return (line 25) to include ChatPanel:
```tsx
    return (
      <>
        <BackBar />
        <Lobby ... />
        <ChatPanel messages={messages} onSend={actions.sendChat} youId={snapshot.youId} />
      </>
    );
```

Actually, let me keep it simpler. Add ChatPanel once at the root level and the back button once at the top. The RoomView already has different renders per phase — wrap everything:

```tsx
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            if (confirm('Bạn có chắc muốn rời phòng?')) await actions.leave();
          }}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Quay lại
        </button>
        <div className="ml-auto text-xs text-slate-400">{snapshot.code}</div>
      </div>
      {lobbyRender || setupRender || finishedRender || playingRender}
      <ChatPanel messages={messages} onSend={actions.sendChat} youId={snapshot.youId} />
    </>
  );
```

Actually let me keep the phase-based returns as they are but add ChatPanel and back button at the top level. I'll restructure RoomView:

The cleanest approach: just add a wrapper `<div>` with the back button at the top, and add `<ChatPanel />` at the end of each return (or at the top level).

Let me write the full approach:

Replace the entire RoomView function body with:

```tsx
export function RoomView({
  snapshot,
  actions,
  messages,
}: {
  snapshot: RoomSnapshot;
  actions: RoomActions;
  messages: { id: string; playerId: string; playerName: string; text: string; timestamp: number }[];
}) {
  const isHost = snapshot.hostId === snapshot.youId;

  const backButton = (
    <div className="mb-3 flex items-center gap-2">
      <button
        type="button"
        onClick={async () => {
          if (confirm('Bạn có chắc muốn rời phòng?')) await actions.leave();
        }}
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← Quay lại
      </button>
      <div className="ml-auto text-xs text-slate-400">{snapshot.code}</div>
    </div>
  );

  const chat = <ChatPanel messages={messages} onSend={actions.sendChat} youId={snapshot.youId} />;

  if (snapshot.status === 'lobby') {
    return (
      <>
        {backButton}
        <Lobby snapshot={snapshot} isHost={isHost} onAddBot={actions.addBot} onStart={actions.start} onKick={actions.kickPlayer} />
        {chat}
      </>
    );
  }

  const view = snapshot.view;
  if (!view) return <p className="text-center text-slate-500">Đang tải…</p>;

  if (snapshot.status === 'setup') {
    if (view.you.ready) {
      return (
        <>
          {backButton}
          <p className="text-center text-slate-500">Chờ người khác điền vé…</p>
          {chat}
        </>
      );
    }
    return (
      <>
        {backButton}
        <CardEditor
          onSubmit={async (card) => {
            const r = (await actions.fillCard(card)) as { ok?: boolean } | undefined;
            if (r?.ok !== false) await actions.ready();
          }}
        />
        {chat}
      </>
    );
  }

  if (snapshot.status === 'finished') {
    return (
      <>
        {backButton}
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
          <ResultOverlay snapshot={snapshot} onPlayAgain={actions.readyToReplay} onLeave={actions.leave} />
        </div>
        {chat}
      </>
    );
  }

  // playing
  return (
    <>
      {backButton}
      {snapshot.rolling ? (
        <TurnReveal players={snapshot.roster} firstPlayerId={view.currentPlayerId} />
      ) : (
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <PlayerCarousel
            players={snapshot.roster}
            currentPlayerId={view.currentPlayerId}
            youId={snapshot.youId}
            turnStartedAt={snapshot.turnStartedAt}
            turnEndsAt={snapshot.turnEndsAt}
          />
          <GameBoard view={view} isYourTurn={view.currentPlayerId === snapshot.youId} onCall={actions.call} />
        </div>
      )}
      {chat}
    </>
  );
}
```

- [ ] **Step 2: Update RoomPage to pass messages and new actions**

In `apps/web/app/room/[code]/page.tsx`, update:

```tsx
  const actions: RoomActions = {
    addBot: s.addBot,
    start: s.start,
    fillCard: s.fillCard,
    ready: s.ready,
    call: s.call,
    newGame: s.newGame,
    kickPlayer: s.kickPlayer,
    readyToReplay: s.readyToReplay,
    sendChat: s.sendChat,
    leave: async () => {
      const r = await s.leave();
      s.clearSnapshot();
      router.push('/');
      return r;
    },
  };
```

Update the RoomView render:
```tsx
      <RoomView snapshot={s.snapshot} actions={actions} messages={s.messages} />
```

- [ ] **Step 3: Verify build compiles**

```bash
cd apps/web; npx next build 2>&1 | tail -20
```

Expected: Build succeeds.

---

### Task 10: Frontend ResultOverlay — Replay vote UI

**Files:**
- Modify: `apps/web/components/ResultOverlay.tsx` (lines 1-122)

**Produces:** Show "Chơi lại" for all players, track votes, show ready count

- [ ] **Step 1: Update ResultOverlay props**

Change `onPlayAgain` usage and add replayVotes prop:

```tsx
export function ResultOverlay({
  snapshot,
  onPlayAgain,
  onLeave,
}: {
  snapshot: RoomSnapshot;
  onPlayAgain: () => void;
  onLeave: () => void;
}) {
```

- [ ] **Step 2: Add vote tracking state and conditionally render button**

After `const winnerName = ...` (line 26), add:

```ts
  const youVoted = snapshot.replayVotes?.includes(snapshot.youId) ?? false;
  const votedCount = snapshot.replayVotes?.length ?? 0;
  const totalHumans = snapshot.roster.filter((r) => !r.isBot).length;
```

Replace the "Chơi lại" button section (lines 102-119) with:

```tsx
      <div className="mt-2 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onPlayAgain}
          disabled={youVoted}
          className={`rounded px-4 py-2 font-medium ${
            youVoted
              ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {youVoted ? 'Đã sẵn sàng ✓' : 'Chơi lại'}
        </button>
        <p className="text-xs text-slate-500">
          {votedCount}/{totalHumans} người đã sẵn sàng
        </p>
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
```

Remove the old `justify` line with the flex gap around buttons — replace it with the above.

- [ ] **Step 3: Show who has voted**

Add below the counter text:

```tsx
        <div className="flex flex-wrap justify-center gap-1">
          {snapshot.roster.filter((r) => !r.isBot).map((r) => (
            <span
              key={r.id}
              className={`rounded px-1.5 py-0.5 text-xs ${
                snapshot.replayVotes?.includes(r.id)
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {r.name} {snapshot.replayVotes?.includes(r.id) ? '✓' : '…'}
            </span>
          ))}
        </div>
```

- [ ] **Step 4: Verify build compiles**

```bash
cd apps/web; npx next build 2>&1 | tail -20
```

Expected: Build succeeds.

---

### Task 11: Final Verification — Test all features

**Files:** None (verification only)

- [ ] **Step 1: Verify server compiles and runs**

```bash
cd apps/server; npx tsc --noEmit
cd apps/server; npx tsx src/index.ts &
Start-Sleep -Seconds 3
Invoke-WebRequest -Uri http://localhost:3001/healthz
```

Expected: "vobo-server ok"

- [ ] **Step 2: Verify frontend builds**

```bash
cd apps/web; npx next build
```

Expected: Build succeeds.

- [ ] **Step 3: Kill test server**

```bash
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
```
