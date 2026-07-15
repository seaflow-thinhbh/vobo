import type { BingoState, BingoView, PlayerSeat, Rng, Difficulty, GridSize } from '@vobo/game-engine';

export interface Seat {
  token: string;
  socketId?: string; // present while connected
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export interface Room {
  code: string;
  hostId: string;
  gameId: 'bingo';
  gridSize: GridSize; // room's grid mode (5, 6, or 7)
  roster: PlayerSeat[]; // lobby roster; frozen into `state` when the game starts
  state?: BingoState; // engine state, created on start
  seats: Map<string, Seat>; // playerId -> auth/connection (HUMANS only; bots have no seat)
  rng: Rng; // engine RNG (card generation)
  botRng: Rng; // bot decision RNG
  turnStartedAt?: number; // epoch ms when the current turn began (playing only)
  turnEndsAt?: number; // epoch ms deadline for the current turn (playing only)
  turnMs: number; // this room's per-turn time
  lastWinnerId?: string; // winner of the previous game (goes first next game)
  rolling?: boolean; // true during the dice-reveal window at game start
  revealDone?: boolean; // whether the reveal already ran for the current game
  wins: Record<string, number>; // playerId -> games won this room session
  winRecorded?: boolean; // guard: the current finished game's win was already counted
  disconnectTimers?: Map<string, ReturnType<typeof setTimeout>>; // bộ đếm ngắt kết nối cho mỗi người chơi
  replayVotes?: Set<string>; // tập hợp người chơi đã bình chọn chơi lại
}

export type RoomStatus = 'lobby' | 'setup' | 'playing' | 'finished';

/** Discriminated result for RoomManager operations. */
export type OpResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

export interface RosterEntry {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  wins: number; // games won this room session
}

/** A joinable room shown in the landing-page room list. */
export interface OpenRoom {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  gridSize: number; // e.g. 5, 6, 7
}

/** Per-player snapshot pushed to a client after any change. */
export interface RoomSnapshot {
  code: string;
  status: RoomStatus;
  hostId: string;
  youId: string;
  roster: RosterEntry[];
  view: BingoView | null; // null during lobby; player-specific once started
  turnStartedAt: number | null; // epoch ms; set only while playing
  turnEndsAt: number | null; // epoch ms; set only while playing
  turnMs: number; // this room's per-turn time
  rolling: boolean; // true during the dice-reveal window
  replayVotes: string[]; // danh sách người chơi đã bình chọn chơi lại
  gridSize: number; // room's grid mode
}

// ---- Socket payloads & acks ----
export type Ack<T> = T | { ok: false; code: string; message: string };

export interface CreatePayload { name: string; turnMs?: number; gridSize?: number; }
export interface JoinPayload { code: string; name: string; }
export interface ResumePayload { code: string; token: string; }
export interface AddBotPayload { difficulty: Difficulty; }
export interface FillCardPayload { card: number[]; }
export interface CallPayload { n: number; }

export interface CreateAck { ok: true; code: string; playerId: string; token: string; }
export interface JoinAck { ok: true; playerId: string; token: string; nameChanged?: boolean; newName?: string; }
export interface ResumeAck { ok: true; playerId: string; }
export interface OkAck { ok: true; }

export type InteractionType = 'tomato' | 'flower' | 'brick' | 'smoke' | 'chicken' | 'hurry' | 'young' | 'fire' | 'heart' | 'laugh' | 'angry' | 'like' | 'clap';

export interface InteractionPayload { targetPlayerId: string; type: InteractionType; }
export interface InteractionEvent { fromId: string; fromName: string; targetId: string; type: InteractionType; }

export interface ClientToServerEvents {
  'room:create': (p: CreatePayload, ack: (r: Ack<CreateAck>) => void) => void;
  'room:join': (p: JoinPayload, ack: (r: Ack<JoinAck>) => void) => void;
  'room:resume': (p: ResumePayload, ack: (r: Ack<ResumeAck>) => void) => void;
  'room:addBot': (p: AddBotPayload, ack: (r: Ack<OkAck>) => void) => void;
  'player:fillCard': (p: FillCardPayload, ack: (r: Ack<OkAck>) => void) => void;
  'player:ready': (ack: (r: Ack<OkAck>) => void) => void;
  'room:start': (ack: (r: Ack<OkAck>) => void) => void;
  'game:call': (p: CallPayload, ack: (r: Ack<OkAck>) => void) => void;
  'room:leave': (ack: (r: Ack<OkAck>) => void) => void;
  'room:newGame': (ack: (r: Ack<OkAck>) => void) => void;
  'rooms:subscribe': (ack: (rooms: OpenRoom[]) => void) => void;
  'rooms:unsubscribe': (ack: (r: OkAck) => void) => void;
  'room:kick': (p: { targetPlayerId: string }, ack: (r: Ack<OkAck>) => void) => void;
  'room:readyToReplay': (ack: (r: Ack<OkAck>) => void) => void;
  'chat:send': (p: { text: string }, ack: (r: Ack<OkAck>) => void) => void;
  'interaction:send': (p: InteractionPayload, ack: (r: Ack<OkAck>) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  'game:finished': (p: { winnerId: string }) => void;
  'error': (p: { code: string; message: string }) => void;
  'rooms:list': (rooms: OpenRoom[]) => void;
  'kicked': (p: { reason: string }) => void;
  'chat:message': (msg: ChatMessage) => void;
  'interaction:receive': (ev: InteractionEvent) => void;
}
