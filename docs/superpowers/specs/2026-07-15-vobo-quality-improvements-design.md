# Vobo Bingo - Quality Improvements

## Date: 2026-07-15

## Overview

7 improvements to the Vobo Bingo platform: host kick, double-click prevention, auto-remove disconnected players, in-game chat, all-players-agree-to-replay, back button, and room cleanup when only bots remain.

---

## 1. Kick Player (Lobby Only)

**Scope:** Host-only, lobby-only.

### Server Changes

**`roomManager.ts`** - New method:
```ts
kickPlayer(hostId: string, targetPlayerId: string): OpResult<{ kicked: boolean }>
```
- Validate: caller is host (`room.hostId === hostId`).
- Validate: target exists in `roster` and `seats`.
- Validate: room is in lobby (`room.state === undefined`).
- Cannot kick self.
- Remove target from `roster` and `seats`.
- Return `{ ok: true, data: { kicked: true } }`.

**`socketServer.ts`** - New handler:
- Event `room:kick` with payload `{ targetPlayerId }`.
- Call `manager.kickPlayer()`, broadcast room state.
- Emit `kicked` event specifically to the kicked player's socket (if connected).

**`types.ts`** - Add types:
- `ClientToServerEvents.room:kick({ targetPlayerId: string })`
- `ServerToClientEvents.kicked({ reason: string })`

### Frontend Changes

**`Lobby.tsx`:**
- Next to each non-host player row, add a small red "Đá" button (only visible if current player is host).
- On click: confirm dialog ("Đá {name} khỏi phòng?").

**`socket.tsx`:**
- Add `kickPlayer(targetPlayerId)` action.
- Listen for `kicked` event -> redirect to `/` with toast "Bạn đã bị đá khỏi phòng."

---

## 2. Prevent Double-Click on Join/Create Room

**`socket.tsx`:**
- Add `isJoining` state (boolean) to both `joinRoom` and `createRoom` actions.
- Set `isJoining = true` before emit, reset on ack/error.
- If ack returns error, show error message.

**`apps/web/app/page.tsx`:**
- Disable "Tạo phòng" and "Vào" buttons when `isJoining === true`.
- Show loading spinner or "Đang xử lý..." text.

---

## 3. Auto-Remove Disconnected Players

### Current behavior
When a player disconnects, `markDisconnected()` sets `socketId = undefined` but keeps player in room. They show as gray dot in lobby.

### New behavior
30-second grace period. If player doesn't reconnect within 30s, they are removed from the room.

**`roomManager.ts`:**
- Add `disconnectTimers: Map<string, ReturnType<typeof setTimeout>>` on the Room.
- `markDisconnected()`: start a 30s timeout. Store it.
- `resume()`: if a reconnect happens before timeout fires, clear the timeout.
- Timer callback: calls `leaveRoom()` logic (removes player from roster/seats, triggers host transfer if needed, deletes room if empty).

**Config (`config.ts`):**
- Add `DISCONNECT_GRACE_MS = 30_000` (30 seconds).

---

## 4. In-Game Chat

### Server

**`chatManager.ts`** (new file):
```ts
interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

class ChatManager {
  private messages: Map<string, ChatMessage[]>; // roomCode -> messages

  getMessages(code: string): ChatMessage[]
  addMessage(code: string, playerId: string, playerName: string, text: string): ChatMessage
}
```
- Max 100 messages per room (FIFO, drop oldest).
- Add `messages` field to `RoomSnapshot` (last ~50 messages).

**`socketServer.ts`:**
- New event `chat:send` with `{ text: string }`.
- Validate text not empty, max 500 chars.
- Call `chatManager.addMessage()`, broadcast `chat:message` to all in room.

**`types.ts`:**
- `ClientToServerEvents.chat:send({ text: string })`
- `ServerToClientEvents.chat:message(msg: ChatMessage)`

### Frontend

**`ChatPanel.tsx`** (new component):
- Fixed right sidebar, width 280px.
- Toggle button (chat bubble icon) at top-right of screen.
- When open: main content shifts left, panel slides in from right (CSS transition 300ms).
- Inside panel:
  - Header: "Chat" + close button.
  - Message list: scrollable, auto-scroll to bottom on new message.
  - Each message: sender name (colored) + text + time.
  - Input bar at bottom: text input + send button (or Enter key).
- On mobile (< 768px): panel becomes full-width overlay.

**`RoomView.tsx`:**
- Add `<ChatPanel />` as sibling to main content.
- Wrap layout in flex container: `[main content] [chat panel]`.

---

## 5. All Players Must Agree to Replay

### Current behavior
After game finishes, only the host sees "Chơi lại" button. Host alone decides.

### New behavior
All human players see "Chơi lại" button. When clicked, that player is marked as "ready to replay". When ALL human players have clicked, game returns to lobby automatically.

**`roomManager.ts`:**
- Add `replayVotes: Set<string>` to Room (initialized when game finishes).
- New method `readyToReplay(playerId: string)`:
  - Add playerId to `replayVotes`.
  - If `replayVotes.size === connected human count`, call `returnToLobby()`.
  - Otherwise, broadcast updated vote status.

**`RoomSnapshot`:** Add `replayVotes: string[]` field.

**`socketServer.ts`:**
- New event `room:readyToReplay`.
- Call `manager.readyToReplay()`.

**`types.ts`:**
- `ClientToServerEvents.room:readyToReplay`

**`ResultOverlay.tsx`:**
- Show "Chơi lại" button for ALL human players (not just host).
- Once clicked: button changes to "Đã sẵn sàng" (green, disabled).
- Show counter: "{n}/{total} người đã sẵn sàng chơi lại".
- Show list of who has/hasn't voted.

---

## 6. Back Button

**`RoomView.tsx`:**
- Add back arrow button ("< Quay lại") at top-left of the room screen.
- Visible at all phases (lobby, setup, playing, finished).
- On click: confirm dialog "Rời phòng?" -> call `leave()` -> redirect to `/`.
- If in lobby and the player is host, confirm dialog includes warning: "Bạn là chủ phòng, rời đi sẽ chuyển quyền chủ phòng."

---

## 7. Delete Room When Only Bots Remain

**`roomManager.ts`:**
- Already exists: `leave()` checks `room.seats.size === 0` and deletes room.
- Ensure this also triggers after kick, auto-remove timeout, and when all humans leave during lobby.
- No additional code needed - just verify all code paths call the same cleanup.

---

## Architecture Notes

- All changes follow existing patterns (event-driven, Socket.IO ack-based).
- No database changes (stays in-memory).
- No external dependencies added.
- Backward compatible: existing rooms work without changes.
