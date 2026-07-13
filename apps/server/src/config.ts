export interface RoomConfig {
  maxPlayers: number;
  minPlayers: number;
  turnMs: number; // per-turn timeout; auto-calls a random number when it expires
  botDelayMs: number; // delay before a bot plays its turn (feels human)
}

export const DEFAULT_CONFIG: RoomConfig = {
  maxPlayers: 6,
  minPlayers: 2,
  turnMs: 20_000,
  botDelayMs: 1_200,
};
