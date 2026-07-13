# Vobo — Nền tảng game dân gian online (Game #1: Bingo 5×5)

- **Ngày:** 2026-07-13
- **Trạng thái:** Design đã duyệt, chờ review trước khi lập kế hoạch triển khai
- **Phạm vi bản này:** Nền tảng game-agnostic + game đầu tiên là Bingo 5×5 tự điền, hô theo lượt

---

## 1. Tổng quan & mục tiêu

Web chơi các trò board game / dân gian, hỗ trợ **multiplayer realtime online** hoặc **đấu với bot**. Nền tảng được thiết kế **game-agnostic** để thêm trò mới (Lô Tô 90 số, Bingo 75 số…) về sau chỉ bằng cách viết thêm một module engine.

**Game đầu tiên — Bingo 5×5 (kiểu chơi với bạn bè):**
- Mỗi người có vé 5×5, **tự điền số 1–25** (mỗi số đúng 1 lần), sắp xếp tùy ý.
- Người chơi **lần lượt hô 1 số chưa ai hô**. Số đó được đánh dấu trên vé của **tất cả** mọi người.
- Mỗi hàng / cột / đường chéo hoàn thành = 1 chữ trong B-I-N-G-O. Đủ **5 đường** thì thắng.
- **Ai đủ 5 đường trước thì thắng** (luật xử hoà: xem §3).

### Quyết định sản phẩm đã chốt
| Chủ đề | Quyết định |
|---|---|
| Mô hình chơi | Realtime online, nhiều thiết bị vào chung phòng qua mã |
| Người chơi / phòng | 2–6 ghế; chủ phòng thêm bot lấp chỗ hoặc chơi solo với bot |
| Tài khoản | **Khách + mã phòng**, không đăng nhập (ephemeral) |
| Loại game đầu | Bingo 5×5 tự điền, hô theo lượt (loại duy nhất mà "đấu bot" có ý nghĩa vì có quyết định) |
| Công nghệ | TypeScript toàn bộ; web dùng Next.js |
| Kiến trúc | Monorepo: engine thuần tách riêng + Next.js + server Socket.IO (hướng A) |

### Vì sao là Bingo 5×5 mà không phải Lô Tô/Bingo 75 trước
Trong bingo sòng bài / Lô Tô, một máy/người hô số ngẫu nhiên, người chơi chỉ dò — **không có quyết định**, thuần may rủi, nên "đấu với bot" vô nghĩa. Bingo 5×5 tự điền có bước **chọn số để hô mỗi lượt** → là quyết định chiến thuật → bot mới có ý nghĩa và có thể phân mức độ khó. Nền tảng vẫn game-agnostic để thêm Lô Tô sau.

---

## 2. Kiến trúc tổng thể

Monorepo dùng **pnpm workspaces + Turborepo**.

```
vobo/
├─ packages/
│  └─ game-engine/        # TS thuần, KHÔNG import framework/socket
│     ├─ src/
│     │  ├─ types.ts        # GameState, PlayerState, Move, PlayerView, Result
│     │  ├─ engine.ts       # interface GameModule chung (game-agnostic)
│     │  └─ bingo/
│     │     ├─ rules.ts     # validateMove, applyMove, checkGameEnd, đếm đường
│     │     ├─ setup.ts     # tạo/validate vé 1–25, "xếp ngẫu nhiên"
│     │     ├─ bot.ts       # botMove: easy / medium / hard
│     │     └─ project.ts   # projectStateFor: lọc view theo người chơi
│     └─ __tests__/
├─ apps/
│  ├─ web/                # Next.js (App Router) — UI, sảnh, phòng
│  └─ server/             # Node + Socket.IO — trọng tài, giữ state phòng (RAM)
├─ package.json
├─ pnpm-workspace.yaml
└─ turbo.json
```

### Ba đơn vị — trách nhiệm & ranh giới
| Đơn vị | Làm gì | Phụ thuộc | Test |
|---|---|---|---|
| `game-engine` | Luật game + bot, hàm thuần deterministic. (state, move) → state mới. | Không (TS thuần) | Unit, không cần server |
| `server` | Giữ phòng trong RAM, nhận sự kiện socket, gọi engine, phát view cho client, chạy bot theo lượt, quản timer. **Nguồn chân lý duy nhất.** | game-engine, socket.io | Integration |
| `web` | Giao diện: nhập tên, tạo/vào phòng, điền vé, hô số, xem bảng. Chỉ **vẽ view** + gửi ý định move. | socket.io-client | Component / (e2e sau) |

### Nguyên tắc then chốt — server là trọng tài
Client không tự quyết luật. Client gửi **ý định** ("muốn hô số 14"); server dùng `game-engine` kiểm tra hợp lệ (đúng lượt? số chưa hô?) → cập nhật state → phát lại view cho cả phòng. Chống gian lận, và bot chạy chính engine đó ở server.

---

## 3. Game engine & mô hình state

Engine **TS thuần, deterministic**: cùng (state, move) luôn ra cùng kết quả. Không thời gian thực, không random ẩn (RNG **tiêm vào**), không I/O → test từng nước đi không cần server.

### Interface game-agnostic
```ts
interface GameModule<S, M> {
  id: string;                                              // "bingo"
  createInitialState(players: PlayerSeat[], cfg, rng): S;  // rng tiêm vào
  validateMove(state: S, playerId: string, move: M): Result;
  applyMove(state: S, playerId: string, move: M): S;       // THUẦN
  checkGameEnd(state: S): { finished: boolean; winners: string[] };
  botMove(view: PlayerView, difficulty: Difficulty): M;    // bot chỉ thấy view của nó
  projectStateFor(state: S, playerId: string): PlayerView; // lọc thông tin
}
```

### State của Bingo
```ts
type Phase = 'lobby' | 'setup' | 'playing' | 'finished';
type Difficulty = 'easy' | 'medium' | 'hard';

interface BingoState {
  phase: Phase;
  players: BingoPlayer[];
  turnOrder: string[];        // thứ tự hô (playerId)
  currentTurn: number;        // index trong turnOrder
  calledNumbers: number[];    // các số đã hô, theo thứ tự
  winners: string[];          // đúng 1 phần tử khi finished (xem luật hoà)
}

interface BingoPlayer {
  id: string; name: string;
  isBot: boolean; botDifficulty?: Difficulty;
  card: number[];             // 25 số 1–25, index 0..24 = vị trí ô (5×5)
  ready: boolean;             // đã điền xong vé ở phase setup
  completedLines: number;     // 0..5 = số chữ B-I-N-G-O đã có
  connected: boolean;
}
```

### Move (ý định client gửi lên)
- `FillCard { card: number[] }` — nộp cách sắp 25 số (phase setup)
- `SetReady {}` — báo đã điền xong
- `CallNumber { n: number }` — hô 1 số (chỉ người đang tới lượt, phase playing)

### Luật cốt lõi (`bingo/rules.ts`)
- **Đánh dấu = suy ra**, không lưu riêng: ô được đánh dấu ⟺ số của ô ∈ `calledNumbers`. Tránh lệch state.
- **12 đường** khả dĩ: 5 hàng + 5 cột + 2 chéo. Đường "xong" = cả 5 ô được đánh dấu. `completedLines = min(số đường xong, 5)`.
- **Thắng:** đạt `completedLines >= 5`.
- **Vé hợp lệ:** đúng 25 phần tử, là hoán vị của 1..25 (mỗi số đúng 1 lần).

### Luật xử hoà — ưu tiên người hô (ĐÃ CHỐT)
Khi một lần hô làm **≥1 người** đạt `completedLines >= 5`:
1. Nếu **người vừa hô** nằm trong nhóm đó → người hô thắng.
2. Nếu người hô không đạt mà người khác đạt → thắng là **người đầu tiên theo thứ tự lượt** (`turnOrder`) tính từ người hô trở đi.

Luôn ra **đúng 1 người thắng**, deterministic. `winners` có đúng 1 phần tử.

### Quyền riêng tư & chống gian lận — `projectStateFor`
Server giữ full state, nhưng mỗi client chỉ nhận `PlayerView`:
- **Vé của chính mình:** đầy đủ (số + ô đã đánh dấu).
- **Đối thủ:** chỉ tên + `completedLines` (số chữ BINGO) + trạng thái connected. **KHÔNG lộ cách xếp số.**
- Thông tin chung: `calledNumbers`, tới lượt ai, phase, đồng hồ lượt.

### Bot công bằng (`bingo/bot.ts`)
`botMove` chỉ nhận `PlayerView` của chính bot — **không nhìn lén vé đối thủ**, cùng lượng thông tin một người ngồi ghế đó có.
- **easy:** hô một số ngẫu nhiên chưa ai hô (RNG có seed).
- **medium:** greedy — hô số giúp **vé bot** tiến gần hoàn thành đường nhất.
- **hard:** greedy mạnh hơn, ưu tiên số hoàn thành được đường ngay. Không "chặn" đối thủ được vì không thấy vé họ (giữ công bằng) → khó = tối ưu vé mình tốt nhất.

---

## 4. Server realtime, giao thức & vòng đời phòng

`apps/server` = Node + Socket.IO. Trách nhiệm: giữ state phòng (RAM), xác thực mọi move qua engine, phát `PlayerView` cho từng client, chạy bot theo lượt, quản timer.

### RoomStore (cửa thoát để scale sau)
```ts
interface RoomStore {
  create(room: Room): void;
  get(code: string): Room | undefined;
  update(code: string, fn: (r: Room) => void): void;
  delete(code: string): void;
}
// Bản đầu: InMemoryRoomStore (Map<code, Room>).
// Đổi Redis sau = viết bản mới của interface, không sờ chỗ khác.

interface Room {
  code: string;
  hostId: string;
  gameId: string;            // "bingo"
  state: BingoState;         // do game-engine quản
  seats: Map<string, { token: string; socketId?: string }>;  // định danh + reconnect
  timers: { turn?: NodeJS.Timeout; idle?: NodeJS.Timeout };
}
```

**Vì sao giữ state trong RAM:** dữ liệu phòng nhỏ nhưng đọc/ghi rất nhiều lần/giây khi hô số (RAM = micro-giây); phòng vốn ephemeral (khách + mã phòng, chơi xong là tan, không gì đáng lưu); tiến trình Node đằng nào cũng chạy liên tục để giữ socket. Đánh đổi: mất phòng khi server restart/crash (chấp nhận được với game vui), chỉ chạy 1 instance (một máy nhỏ cân hàng nghìn phòng nhẹ). Khi cần scale ngang/bền vững → thêm **Redis adapter cho Socket.IO** + implementation Redis của `RoomStore`; code game gần như không đổi.

### Vòng đời phòng
`lobby` → `setup` (điền vé, thêm bot, sẵn sàng) → `playing` (hô theo lượt) → `finished` → dọn phòng.

### Giao thức Socket.IO
Client là "câm" — chỉ gửi ý định, nhận view.

**Client → Server:** `room:create` · `room:join` · `room:addBot` (host) · `player:fillCard` · `player:ready` · `room:start` (host) · `game:call {n}` · `room:resume {code, token}` · `room:leave`

**Server → Client:** `room:state` (PlayerView riêng từng người, đẩy sau **mỗi** thay đổi) · `game:numberCalled {n, by}` · `game:finished {winnerId}` · `error {code, msg}`

Mỗi move: `validateMove` → `applyMove` → `checkGameEnd` → phát `projectStateFor` cho **từng** socket (view khác nhau nên gửi riêng).

### Định danh & reconnect
Lúc create/join, server cấp `playerId` + `token` bí mật; client lưu `localStorage`. Rớt mạng → ghế `connected:false`; `room:resume {code, token}` để vào lại đúng ghế và nhận lại state.

### Timer (ĐÃ CHỐT)
- **Lượt: 20 giây.** Hết giờ mà chưa hô → server **tự hô ngẫu nhiên 1 số hợp lệ** thay người đó, ván chạy tiếp.
- **Ân hạn reconnect: 20 giây.** Quá thì bot tự chơi thay ghế đó; nếu người chơi vào lại kịp (ván chưa xong) thì **giành lại ghế**, bot ngừng.
- **Nhịp bot:** khi tới lượt bot, server chờ **~1–1.5s** rồi mới `botMove` và áp dụng — cho cảm giác như người thật.

### Mã phòng
6 ký tự IN HOA, bỏ ký tự dễ nhầm (0/O, 1/I/L).

---

## 5. Frontend (Next.js)

App Router. Frontend **chỉ vẽ** `PlayerView` server đẩy về + giữ chút UI cục bộ (số đang định hô). **Không** chứa luật game. **Tailwind CSS, mobile-first.**

### Bố cục màn hình chơi — Phương án A (mobile-first, ĐÃ CHỐT)
Đối thủ thành dải ngang trên cùng (chỉ tên + tiến độ BINGO), vé bạn ở giữa, khu hô số + đồng hồ 20s ở dưới. Co giãn tốt trên điện thoại.

### Cấu trúc
```
apps/web/
├─ app/
│  ├─ page.tsx              # Sảnh: nhập tên → [Tạo phòng] / [Vào bằng mã]
│  └─ room/[code]/page.tsx  # 1 trang, đổi UI theo phase (lobby/setup/playing/finished)
├─ components/
│  ├─ CardEditor.tsx        # lưới 5×5 điền 1–25 + nút "Xếp ngẫu nhiên"
│  ├─ GameBoard.tsx         # vé bạn + đánh dấu + tiến độ BINGO
│  ├─ OpponentStrip.tsx     # đối thủ: chỉ tên + số chữ BINGO (ẩn số)
│  ├─ CallPanel.tsx         # tới lượt bạn: chọn số chưa hô
│  ├─ TurnTimer.tsx         # đồng hồ 20s
│  └─ Lobby.tsx             # danh sách người + thêm bot + Sẵn sàng + Bắt đầu(host)
└─ lib/
   └─ socket.tsx            # SocketProvider (context): kết nối, giữ PlayerView, expose actions
```

### Điền vé (CardEditor)
Hỗ trợ **cả hai** (ĐÃ CHỐT): tự gõ/kéo-thả số vào ô, **và** nút **"Xếp ngẫu nhiên"**. Validate real-time: đủ 1–25, không trùng, mới cho `Sẵn sàng`.

---

## 6. Xử lý lỗi & tình huống biên

Nguyên tắc: **server không tin client**. Move sai → `validateMove` từ chối, phát `error {code, msg}`, client hiện toast, state không đổi.

| Tình huống | Xử lý |
|---|---|
| Rớt mạng | Socket.IO tự reconnect; ghế `connected:false`. `room:resume` để vào lại. Quá 20s → bot chơi thay; vào lại kịp thì giành lại ghế. |
| Chủ phòng thoát | Chuyển host cho người kế còn kết nối; không còn ai → dọn phòng. |
| Người chơi thoát giữa ván | Ghế thành bot tự chơi để ván tiếp tục. Ở lobby thì xóa khỏi danh sách. |
| Không đủ người bắt đầu | Cần ≥2 ghế (kể cả bot); thiếu → khóa nút Bắt đầu. |
| Vé không hợp lệ (thiếu/trùng/ngoài 1–25) | Từ chối `FillCard`, chỉ chỗ sai; không cho `ready` tới khi đúng. |
| Hô số sai (không phải lượt / đã hô) | Từ chối, state không đổi. |
| Vào phòng lỗi | Sai mã / phòng đầy / ván đã bắt đầu → mã lỗi tương ứng. |
| Server restart (mất RAM) | Client nhận disconnect → hiện "Server đang cập nhật", về sảnh. |
| Chỉ còn bot | Không còn human kết nối → dừng & dọn phòng sau idle timeout. |
| Hết số để hô | Ván luôn kết thúc bằng người thắng trước khi cạn 25 số; vẫn guard phòng hờ. |

---

## 7. Chiến lược test

Theo **TDD** (viết test trước). Công cụ: **Vitest** toàn monorepo, **Turborepo** chạy song song, TypeScript `strict`, ESLint + Prettier.

- **`game-engine` (trọng tâm, unit):** hàm thuần, RNG có seed → deterministic. Phủ: validate vé, đánh dấu, đếm đường, **thắng + luật ưu tiên người hô**, bot 3 mức, `projectStateFor` **giấu vé đối thủ**.
- **`server` (integration):** bật server thật + `socket.io-client` giả lập; chạy trọn vòng đời create → join → fill → ready → start → call → thắng; test reconnect, timeout 20s, bot lấp chỗ, chuyển host.
- **`web` (component):** React Testing Library cho `CardEditor` (validate) và `GameBoard` (render đánh dấu/tiến độ). **Playwright e2e** cho luồng 2 người chơi — để sau, không bắt buộc bản đầu.

---

## 8. Ngoài phạm vi (bản này)

Tài khoản/đăng nhập, lịch sử ván, xếp hạng, chat trong phòng, các game khác (Lô Tô 90, Bingo 75), scale nhiều instance / Redis, âm thanh "hô số", mobile app native. Kiến trúc đã chừa chỗ (interface `GameModule`, `RoomStore`) để thêm sau mà không viết lại.
