import type { BingoState, BingoView, PlayerSeat, Rng, Difficulty } from '@vobo/game-engine';

export interface Seat {
  token: string;
  socketId?: string; // present while connected
}

export interface Room {
  code: string;
  hostId: string;
  gameId: 'bingo';
  roster: PlayerSeat[]; // lobby roster; frozen into `state` when the game starts
  state?: BingoState; // engine state, created on start
  seats: Map<string, Seat>; // playerId -> auth/connection (HUMANS only; bots have no seat)
  rng: Rng; // engine RNG (card generation)
  botRng: Rng; // bot decision RNG
  turnStartedAt?: number; // epoch ms when the current turn began (playing only)
  turnEndsAt?: number; // epoch ms deadline for the current turn (playing only)
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
}

/** A joinable room shown in the landing-page room list. */
export interface OpenRoom {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
}

/** Per-player snapshot pushed to a client after any change. */
export interface RoomSnapshot {
  code: string;
  status: RoomStatus;
  hostId: string;
  youId: string;
  roster: RosterEntry[];
  view: BingoView | null; // null during lobby; player-specific once started
}

// ---- Socket payloads & acks ----
export type Ack<T> = T | { ok: false; code: string; message: string };

export interface CreatePayload { name: string; }
export interface JoinPayload { code: string; name: string; }
export interface ResumePayload { code: string; token: string; }
export interface AddBotPayload { difficulty: Difficulty; }
export interface FillCardPayload { card: number[]; }
export interface CallPayload { n: number; }

export interface CreateAck { ok: true; code: string; playerId: string; token: string; }
export interface JoinAck { ok: true; playerId: string; token: string; }
export interface ResumeAck { ok: true; playerId: string; }
export interface OkAck { ok: true; }

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
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshot) => void;
  'game:finished': (p: { winnerId: string }) => void;
  'error': (p: { code: string; message: string }) => void;
  'rooms:list': (rooms: OpenRoom[]) => void;
}
