# Vobo — Gameplay & UX Tweaks (v2)

- **Ngày:** 2026-07-14
- **Trạng thái:** Design đã duyệt, chờ review trước khi lập kế hoạch
- **Phạm vi:** 6 tweak cho bản chơi được hiện tại. `packages/game-engine` **KHÔNG đổi** — mọi thay đổi ở `apps/server` (tầng RoomManager/socket) và `apps/web`.

---

## 1. Tổng quan & quyết định đã chốt

Sáu tinh chỉnh gameplay/UX:

| # | Tweak | Chạm tới |
|---|---|---|
| 1 | Bấm trực tiếp trên ô để hô số (bỏ bàn phím số) | web |
| 1b | Bàn bingo 5×5 co giãn theo chiều rộng container | web |
| 2 | Kết thúc ván → chủ phòng bấm "Ván mới" đưa cả phòng về sảnh | web + server |
| 3 | Trang chủ hiển thị danh sách phòng đang chờ | web + server |
| 4 | Đồng hồ đếm giờ lượt chơi (chính xác, server gửi hạn chót) | web + server |
| 5 | Bỏ chữ B-I-N-G-O ở đối thủ; dải người chơi thành carousel, người đang tới lượt vào giữa với viền đếm giờ | web + server |

**Quyết định đã chốt:**
- **#1:** thay hẳn bàn phím số — chỉ bấm trên ô (ô chưa đánh dấu = số chưa hô).
- **#2:** chỉ **chủ phòng** bấm "Ván mới"; giữ lại **bot**; người rời giữa ván **không** đưa về sảnh.
- **#3:** hiển thị **tất cả** phòng đang ở sảnh (chưa bắt đầu, chưa đầy); vào bằng mã vẫn còn.
- **#4:** **chính xác** — server gửi mốc thời gian; đồng hồ hiện dạng **viền chạy** (không phải số).
- **#5:** carousel gồm **tất cả người chơi kể cả bạn**; ≥3 người → hiện 3 ô, người đang tới lượt ở giữa; viền **xanh lá >50% thời gian còn lại, vàng khi ≤50%**; viền cũng hiện cho lượt bot (vơi nhanh ~1.2s).

---

## 2. Thay đổi server (`apps/server`)

### 2.1 Kiểu dữ liệu (`src/types.ts`)

`RoomSnapshot` thêm 2 trường thời gian lượt (epoch ms, `null` ngoài phase `playing`):
```ts
export interface RoomSnapshot {
  code: string;
  status: RoomStatus;
  hostId: string;
  youId: string;
  roster: RosterEntry[];
  view: BingoView | null;
  turnStartedAt: number | null; // MỚI
  turnEndsAt: number | null;    // MỚI
}
```

Kiểu mới cho danh sách phòng:
```ts
export interface OpenRoom {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
}
```

`Room` thêm mốc lượt (tầng socket ghi, không phải engine):
```ts
export interface Room {
  /* ...hiện có... */
  turnStartedAt?: number;
  turnEndsAt?: number;
}
```

Bổ sung event map:
```ts
export interface ClientToServerEvents {
  /* ...hiện có... */
  'rooms:subscribe': (ack: (rooms: OpenRoom[]) => void) => void;
  'rooms:unsubscribe': (ack: (r: OkAck) => void) => void;
  'room:newGame': (ack: (r: Ack<OkAck>) => void) => void;
}
export interface ServerToClientEvents {
  /* ...hiện có... */
  'rooms:list': (rooms: OpenRoom[]) => void;
}
```

### 2.2 RoomStore (`src/roomStore.ts`)
Thêm để liệt kê phòng:
```ts
export interface RoomStore {
  /* ...hiện có... */
  values(): Room[];
}
// InMemoryRoomStore: return [...this.rooms.values()];
```

### 2.3 RoomManager (`src/roomManager.ts`)

**`returnToLobby(code, hostId): OpResult`** — chỉ chủ phòng, chỉ khi `state.phase === 'finished'`:
- Dựng lại `room.roster` từ những người **còn ở phòng**: giữ nếu `seats.has(id)` (người còn kết nối) **hoặc** `id` bắt đầu bằng `bot_` (bot thật). Bỏ người `p_...` đã rời (không còn seat). Map về `PlayerSeat[] {id, name, isBot, botDifficulty?}`.
- `room.state = undefined` (về `lobby`); xoá `room.turnStartedAt/turnEndsAt`.
- Lỗi: `no_room`, `not_host` ("Chỉ chủ phòng mới mở ván mới"), `not_finished` ("Ván chưa kết thúc").

**`listOpenRooms(): OpenRoom[]`** — từ `store.values()`, lọc `!room.state` (đang sảnh) và `roster.length < maxPlayers`, map:
```ts
{ code, hostName: <tên của hostId trong roster>, playerCount: roster.length, maxPlayers: cfg.maxPlayers }
```

### 2.4 socketServer (`src/socketServer.ts`)

**Mốc thời gian lượt trong `orchestrate`:** ngay trước khi đặt turn-timer cho người đang tới lượt:
```ts
room.turnStartedAt = Date.now();
room.turnEndsAt = Date.now() + (cur.isBot ? cfg.botDelayMs : cfg.turnMs);
```
Khi `finished` hoặc rời `playing`: đặt `room.turnStartedAt/turnEndsAt = undefined`.

**`snapshotFor`** thêm:
```ts
turnStartedAt: room.state?.phase === 'playing' ? (room.turnStartedAt ?? null) : null,
turnEndsAt:    room.state?.phase === 'playing' ? (room.turnEndsAt ?? null) : null,
```

**Nhóm "@lobby" cho danh sách phòng:**
- `broadcastRooms()`: `io.to('@lobby').emit('rooms:list', manager.listOpenRooms())`.
- Handler `rooms:subscribe`: `socket.join('@lobby')`, ack trả `manager.listOpenRooms()`.
- Handler `rooms:unsubscribe`: `socket.leave('@lobby')`, ack ok.
- Gọi `broadcastRooms()` sau mỗi thay đổi ảnh hưởng danh sách: `room:create`, `room:join`, `room:leave`, `room:start`, `room:newGame`, và khi xoá phòng.

**Handler `room:newGame`:** yêu cầu đang trong phòng → `manager.returnToLobby(code, playerId)` → nếu ok: `orchestrate(code)` (phát snapshot lobby cho cả phòng) + `broadcastRooms()`.

---

## 3. Thay đổi web (`apps/web`)

### 3.1 Kiểu & socket
- `lib/types.ts`: `RoomSnapshot` thêm `turnStartedAt/turnEndsAt: number | null`; thêm `OpenRoom`.
- `lib/socket.tsx`:
  - State `openRooms: OpenRoom[]`; lắng nghe `rooms:list` → `setOpenRooms`.
  - Actions mới: `subscribeRooms(): Promise<OpenRoom[]>` (emit `rooms:subscribe`, cũng set state), `unsubscribeRooms(): Promise<void>`, `newGame(): Promise<Ok>`.

### 3.2 GameBoard (`components/GameBoard.tsx`) — #1 + #1b
- Props thêm: `isYourTurn: boolean`, `onCall: (n: number) => void`.
- **Responsive:** lưới `grid grid-cols-5 w-full` trong khung `max-w-*`, mỗi ô `aspect-square` (vuông, rộng bằng nhau, co theo container); cỡ chữ co theo. Bỏ ô cố định 48px.
- Mỗi ô: nếu **chưa đánh dấu và `isYourTurn`** → `<button onClick={() => onCall(n)}>`; nếu đã đánh dấu hoặc ngoài lượt → tĩnh (không bấm). Giữ `data-marked` cho test.

### 3.3 PlayerCarousel + TurnRing (mới) — thay `OpponentStrip` + `TurnIndicator` (#4 + #5)
- **Xoá** `OpponentStrip.tsx`/`OpponentStrip.test.tsx` và `TurnIndicator.tsx`.
- **`components/carousel.ts` (helper thuần, test được):**
  - `visibleWindow(count: number, currentIndex: number): number[]` → chỉ số các ô hiện: nếu `count <= 3` trả tất cả; nếu `>3` trả 3 ô [current-1, current, current+1] (kẹp trong biên, luôn 3 ô), current ở giữa khi có thể.
  - `ringColor(fractionRemaining: number): 'green' | 'amber'` → `>0.5 ? 'green' : 'amber'`.
- **`components/TurnRing.tsx`:** props `{ startedAt: number; endsAt: number }`. Dùng `requestAnimationFrame` tính `fraction = clamp((endsAt-now)/(endsAt-startedAt), 0, 1)`; vẽ SVG `<rect stroke-dasharray>` quanh ô, màu theo `ringColor`. Dọn rAF khi unmount.
- **`components/PlayerCarousel.tsx`:** props `{ players: RosterEntry[]; currentPlayerId: string | null; youId: string; turnStartedAt: number | null; turnEndsAt: number | null }`.
  - `players` lấy từ `snapshot.roster` (thứ tự = turnOrder khi playing). Mỗi ô: tên (+"(bạn)" nếu là mình) + chấm kết nối. **Không** hiện chữ BINGO.
  - `<3` người: hàng ngang thường. `≥3`: chỉ render `visibleWindow`, ô giữa to/rõ, hai bên mờ + thu nhỏ.
  - Ô của `currentPlayerId`: bọc `TurnRing` (nếu có `turnEndsAt`).

### 3.4 RoomView (`components/RoomView.tsx`)
- `RoomActions` thêm `newGame: () => Promise<unknown>`.
- Nhánh `playing`: `<PlayerCarousel .../>` + `<GameBoard view isYourTurn={view.currentPlayerId === youId} onCall={actions.call} />`. Bỏ `CallPanel`, `OpponentStrip`, `TurnIndicator`.
- Nhánh `finished`: `<FinishedPanel snapshot isHost={hostId===youId} onNewGame={actions.newGame} onLeave={actions.leave} />`.

### 3.5 FinishedPanel (`components/FinishedPanel.tsx`) — #2
- Props thêm `isHost: boolean`, `onNewGame: () => void`.
- Hiện người thắng + : chủ phòng → nút **"Ván mới"** (`onNewGame`); người khác → "Chờ chủ phòng mở ván mới…". Luôn có nút **"Về sảnh chính"** (`onLeave`, rời phòng).

### 3.6 CallPanel — xoá
- **Xoá** `CallPanel.tsx` + `CallPanel.test.tsx` (thay bằng tap-trên-ô).

### 3.7 RoomList + Landing (`components/RoomList.tsx`, `app/page.tsx`) — #3
- **`components/RoomList.tsx` (thuần):** props `{ rooms: OpenRoom[]; onJoin: (code: string) => void; disabled?: boolean }`. Mỗi dòng: `Phòng của <hostName>` · `X/Y` · nút **Vào** (`onJoin(code)`). Rỗng → "Chưa có phòng nào đang chờ".
- **Landing `app/page.tsx`:** `useEffect` khi kết nối → `subscribeRooms()`; unmount → `unsubscribeRooms()`. Render form tên + tạo/nhập-mã như cũ, thêm `<RoomList rooms={openRooms} onJoin={...} disabled={!name.trim()} />`. Bấm Vào = `joinRoom(code, name)` rồi `router.push('/room/'+code)` (giống nút "Vào").

---

## 4. Testing (TDD)

- **Server (unit/integration):**
  - `RoomStore.values()` liệt kê đúng.
  - `returnToLobby`: chỉ host; reset `state=undefined`; roster giữ bot + người còn kết nối, bỏ người đã rời; lỗi khi chưa finished / không phải host.
  - `listOpenRooms`: chỉ phòng lobby chưa đầy; `hostName`/`playerCount` đúng.
  - Integration socket: snapshot có `turnStartedAt/turnEndsAt` (number) khi `playing`, `null` khi lobby/finished; `rooms:subscribe` trả danh sách + nhận `rooms:list` khi có phòng mới/đổi; `room:newGame` đưa phòng về lobby.
- **Web (component + build):**
  - `GameBoard`: tới lượt → bấm ô chưa đánh dấu gọi `onCall(số)`; ô đã đánh dấu / ngoài lượt không bấm; render lưới responsive (5×5, 25 ô).
  - Helper `visibleWindow` (đúng cửa sổ 3 ô, current ở giữa) + `ringColor` (ngưỡng 0.5).
  - `PlayerCarousel`: <3 hiện tất cả; ≥3 hiện 3 ô + đánh dấu ô giữa là current; ô current có ring.
  - `RoomList`: render danh sách + nút Vào gọi `onJoin`.
  - `FinishedPanel`: host thấy "Ván mới" gọi `onNewGame`; non-host thấy thông báo chờ.
  - Phần animation viền + trượt carousel + landing subscribe: kiểm qua `next build` + tay (không unit-test thời gian thực).

---

## 5. Ngoài phạm vi
- Bỏ bot khỏi sảnh khi "Ván mới" (đang giữ bot). Xoá bot thủ công (`removeBot`) chưa có.
- Public/Private cho phòng (đang để tất cả public).
- Đồng hồ dạng số; hoạt ảnh trượt carousel phức tạp; spectate phòng đang chơi.
- Redis/scale nhiều instance (nhóm `@lobby` hiện chỉ đúng trong 1 instance — khớp thiết kế hiện tại).
