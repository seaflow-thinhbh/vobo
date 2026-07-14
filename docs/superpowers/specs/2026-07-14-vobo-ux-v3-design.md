# Vobo — Gameplay & UX Tweaks (v3)

- **Ngày:** 2026-07-14
- **Trạng thái:** Design đã duyệt, chờ review trước khi lập kế hoạch
- **Phạm vi:** 3 tweak trên nền v2. Lần này **có chạm `packages/game-engine`** (thứ tự lượt), cùng `apps/server` và `apps/web`.
- **Nền:** làm trên `main` (đã có v2 + fix clock-skew của TurnRing).

---

## 1. Tổng quan & quyết định đã chốt

| # | Tweak | Chạm tới |
|---|---|---|
| 1 | Đặt thời gian mỗi lượt khi tạo phòng | server + web |
| 2 | Thứ tự lượt: ván 1 random (đổ xúc xắc), ván 2+ người thắng đi đầu; có pha "rolling" công bằng | engine + server + web |
| 3 | Box người chơi dạng pill bo tròn; đồng hồ = track xám + cung xanh/vàng (còn lại) | web |

**Quyết định đã chốt:**
- **#1:** chọn từ mức sẵn **{15, 20, 30, 45, 60}s**, mặc định **20s**.
- **#2:** đổ xúc xắc **có animation**; **công bằng tuyệt đối** — server thêm pha `rolling` ~1.5s, đồng hồ lượt CHƯA chạy trong lúc quay. Ván 1 random hết; ván 2+ người thắng ván trước đứng đầu, phần còn lại random; người thắng đã rời phòng → random.
- **#3:** giữ cung **xanh→vàng = thời gian còn lại** (vơi dần), thêm **track xám full viền** cho phần đã đếm; box **pill** (bo tròn hẳn).

---

## 2. Engine (`packages/game-engine`)

### 2.1 `createInitialState` nhận thứ tự người đi đầu
Đổi chữ ký (thêm `opts` tùy chọn) trong interface `GameModule` (`src/engine.ts`) và bingo (`src/bingo/state.ts`):
```ts
createInitialState(players: PlayerSeat[], rng: Rng, opts?: { firstPlayerId?: string }): S;
```
`createInitialState` tính `turnOrder` **ngay khi tạo state** (thay vì để trống tới `setReady`):
- `ids = shuffle(players.map(p => p.id), rng)` (Fisher–Yates với rng có seed).
- Nếu `opts.firstPlayerId` **có mặt** trong ids → bỏ khỏi vị trí hiện tại và `unshift` lên đầu.
- Gán `turnOrder = ids`, `currentTurn = 0`. Các field khác giữ nguyên (phase `setup`, players…).

### 2.2 `setReady` không gán lại turnOrder
Trong `src/bingo/apply.ts`, ở nhánh chuyển sang `playing` khi mọi người ready: **bỏ** dòng `turnOrder: players.map((p) => p.id)` — chỉ flip `phase: 'playing'` (turnOrder + currentTurn đã set từ `createInitialState`).

### 2.3 Test
- turnOrder là hoán vị của mọi id (không mất/không thừa); deterministic với cùng seed.
- `firstPlayerId` có mặt → nằm ở `turnOrder[0]`; không có (id lạ) → dùng shuffle bình thường (không lỗi).
- Full-game integration test cũ vẫn chạy (createInitialState 2 tham số vẫn hợp lệ vì `opts` optional).

---

## 3. Server (`apps/server`)

### 3.1 Kiểu & config (`src/types.ts`, `src/config.ts`)
- `Room` thêm: `turnMs: number`, `lastWinnerId?: string`, `rolling?: boolean`, `revealDone?: boolean`.
- `RoomSnapshot` thêm: `turnMs: number`, `rolling: boolean`.
- `CreatePayload` thêm: `turnMs?: number`.
- `config.ts`: `TURN_PRESETS_MS = [15000, 20000, 30000, 45000, 60000]`, `REVEAL_MS = 1500`. `DEFAULT_CONFIG.turnMs` giữ 20000 làm mặc định.

### 3.2 RoomManager (`src/roomManager.ts`)
- **`createRoom(name: string, turnMs?: number)`**: `room.turnMs = TURN_PRESETS_MS.includes(turnMs) ? turnMs : this.cfg.turnMs`. (Validate; sai/thiếu → mặc định.)
- **`startGame`**: trước khi tạo state, reset `room.rolling = false; room.revealDone = false`; gọi `bingoModule.createInitialState(room.roster, room.rng, { firstPlayerId: room.lastWinnerId })`.
- **`returnToLobby`**: giữ `room.lastWinnerId` (không xoá — để ván sau người thắng đi đầu); vẫn xoá `turn*`, reset rolling/revealDone.

### 3.3 socketServer (`src/socketServer.ts`)
- **`snapshotFor`**: thêm `turnMs: room.turnMs`, `rolling: room.state?.phase === 'playing' ? (room.rolling ?? false) : false`.
- **`orchestrate`** — pha rolling + đồng hồ per-room:
  1. Nếu `phase === 'finished'`: đặt `room.lastWinnerId = state.winners[0]`; xoá `turn*`; broadcast; emit `game:finished`; return.
  2. Nếu `phase === 'playing'`:
     - Nếu **bắt đầu ván** (`calledNumbers.length === 0 && currentTurn === 0`) và `!room.revealDone` và `!room.rolling` → vào rolling: `room.rolling = true; room.revealDone = true`; xoá `turn*`; broadcast; hẹn `setTimeout(REVEAL_MS)` → `room.rolling = false; orchestrate(code)`; return.
     - Nếu `room.rolling` (đang quay): broadcast; return (không chạy đồng hồ).
     - Ngược lại: bắt đầu lượt như hiện tại nhưng dùng `room.turnMs` cho người (`turnEndsAt = now + (cur.isBot ? cfg.botDelayMs : room.turnMs)`), set `turnStartedAt/turnEndsAt`, broadcast, chạy turn timer.
- **`game:call`**: nếu `room.rolling` → từ chối (`{ ok:false, code:'rolling', message:'Đang chọn lượt đi đầu' }`), không áp move.
- `room:newGame`/`room:start` vẫn gọi `orchestrate` (giờ tự lo pha rolling).

### 3.4 Test
- `createRoom` validate turnMs (mức hợp lệ giữ, sai → mặc định).
- `lastWinnerId` set khi ván xong; `startGame` truyền vào `createInitialState` (verify turnOrder[0] = winner ở ván 2).
- Integration: sau khi start, snapshot có `rolling: true` (turn* null) trong ~REVEAL_MS, rồi `rolling: false` + turn* number; đồng hồ dùng đúng `room.turnMs`; hô số bị chặn khi rolling.

---

## 4. Web (`apps/web`)

### 4.1 Kiểu & socket
- `lib/types.ts`: `RoomSnapshot` thêm `turnMs: number`, `rolling: boolean`.
- `lib/socket.tsx`: `createRoom(name, turnMs)` — emit `room:create { name, turnMs }`.

### 4.2 Tạo phòng — chọn thời gian lượt (`app/page.tsx`)
- Thêm state `turnSec` (mặc định 20) + hàng nút chọn **15/20/30/45/60s** (nút đang chọn nổi bật). `onCreate` gọi `createRoom(name, turnSec * 1000)`.

### 4.3 Đồng hồ pill + track xám (`components/TurnRing.tsx`, `components/PlayerCarousel.tsx`)
- **TurnRing**: vẽ **2 lớp** — `<rect>` track xám (full viền, dasharray đầy) phía sau + `<rect>` cung màu (xanh >50%, vàng ≤50%) với `dasharray = fraction*100` (còn lại, vơi dần — giữ logic đếm cục bộ đã fix skew). Bo góc lớn (pill).
- **PlayerCarousel**: box đổi thành **pill** (`rounded-full`), kiểu viền pill nhạt cho người không tới lượt; người tới lượt bọc TurnRing (track xám + cung màu).

### 4.4 Animation đổ xúc xắc (`components/TurnReveal.tsx` + dùng trong RoomView)
- Khi `snapshot.rolling === true` (phase playing): hiện **overlay reveal** ~REVEAL_MS: ô "đang tới lượt" nhảy nhanh qua các người (cycling) rồi **dừng ở `currentPlayerId`** (người đi đầu đã được engine chốt). Nhãn chung: "🎲 Lượt đầu: <tên>".
- Hết rolling (`rolling=false`, `turnEndsAt` có) → ẩn overlay, vào bàn, đồng hồ chạy đủ giờ.
- Chạy đếm cục bộ (rAF/`performance.now`) cho phần cycling — không phụ thuộc đồng hồ server.

### 4.5 Test
- `createRoom` gửi kèm `turnMs`; selector đổi giá trị.
- TurnRing render 2 lớp (track + fill); PlayerCarousel box pill.
- Reveal + cycling kiểm qua `next build` + tay (không unit-test thời gian thực).

---

## 5. Ngoài phạm vi
- Phân biệt framing "random" (ván 1) vs "thắng ván trước" (ván 2+) trong nhãn reveal — hiện để nhãn chung.
- Nhập thời gian lượt tự do (chỉ mức sẵn).
- Hoạt ảnh xúc xắc 3D/phức tạp (chỉ cycling highlight).
- Redis/scale nhiều instance (pha rolling dùng timer in-process, khớp thiết kế hiện tại).
