export type Difficulty = 'easy' | 'medium' | 'hard';
export type RoomStatus = 'lobby' | 'setup' | 'playing' | 'finished';

export interface RosterEntry {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  wins?: number; // games won this room session (server always sends it)
}

export interface OpponentView {
  id: string;
  name: string;
  isBot: boolean;
  completedLines: number;
  connected: boolean;
  ready: boolean;
}

export interface BingoView {
  phase: 'setup' | 'playing' | 'finished';
  you: {
    id: string;
    card: number[];
    marked: boolean[];
    completedLines: number;
    ready: boolean;
  };
  opponents: OpponentView[];
  calledNumbers: number[];
  currentPlayerId: string | null;
  winners: string[];
}

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
}

export interface OpenRoom {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
}

export type Ack<T> = ({ ok: true } & T) | { ok: false; code: string; message: string };
