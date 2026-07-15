export interface RoomConfig {
  maxPlayers: number;
  minPlayers: number;
  turnMs: number; // default per-turn timeout when a room doesn't pick one
  botDelayMs: number; // delay before a bot plays its turn (feels human)
  revealMs: number; // "rolling" dice-reveal window before the first turn of a game
  disconnectGraceMs: number; // thời gian chờ kết nối lại trước khi xóa khỏi phòng
}

export const DEFAULT_CONFIG: RoomConfig = {
  maxPlayers: 6,
  minPlayers: 2,
  turnMs: 20_000,
  botDelayMs: 1_200,
  revealMs: 1_500,
  disconnectGraceMs: 30_000,
};

/** Turn-time choices offered when creating a room (ms). */
export const TURN_PRESETS_MS = [15_000, 20_000, 30_000, 45_000, 60_000];
