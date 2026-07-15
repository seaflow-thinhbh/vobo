# Vobo Phase 2 — Interaction, Bomb, Timeout, Modes

> Date: 2026-07-15

## Changes

### 1. Interaction Bar (Bottom Emoji Bar)
- Fixed horizontal bar at bottom of screen during gameplay
- All emoji icons (incl. 💩) in scrollable row
- Click emoji -> popup: player list + "Gửi tất cả" button
- Remove old right-click/long-press InteractionMenu on PlayerCarousel

### 2. Interaction Animations (GSAP + Three.js + Canvas-Confetti)
- Three.js particle overlay (full screen, avoid bingo board area)
- GSAP for DOM text/icon animations
- canvas-confetti for quick bursts
- Effects: splat (tomato), petals (flower), shake (brick), smoke (smoke bomb), text popups
- Add 💩 (shit) interaction type

### 3. Turn Timeout = Skip Turn
- Server: replace autoCall with skipTurn (advance currentTurn, no number called)
- Client: "Hết giờ! Mất lượt" notification

### 4. Bomb Mechanic
- Bomb placed during gameplay on unmarked cell
- Draggable 💣 icon next to game board -> drag onto cell to place
- Only visible to the bomb owner
- When a called number matches a bomb -> caller's next turn skipped (currentTurn +2)
- 1 bomb per player, cannot change
- Engine: BingoPlayer.bombNumber, PlaceBomb move type

### 5. Fun / Casual Mode
- Room creation: grid size + mode (Fun | Casual)
- Fun: bombs always enabled
- Casual: checkbox "Bật bomb" (default off)
- Room stores gameMode, bombsEnabled
- Room list shows mode

### 6. Card Editor Fix
- Remove swap popup (revert to old behavior)
- Show duplicates in red (old behavior)
- Enhanced validation message: "Vé chưa hợp lệ: trùng số X, Y. Thiếu số Z, W."
