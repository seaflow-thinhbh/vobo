export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

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
  gridSize: number;
  phase: 'setup' | 'playing' | 'finished';
  you: {
    id: string;
    card: number[];
    marked: boolean[];
    completedLines: number;
    ready: boolean;
    bombNumber: number | null;
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
  replayVotes: string[];
  gridSize: number;
  gameMode?: string;
}

export interface OpenRoom {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  gridSize: number;
}

export type Ack<T> = ({ ok: true } & T) | { ok: false; code: string; message: string };

export type InteractionType = 'tomato' | 'flower' | 'brick' | 'smoke' | 'shit' | 'chicken' | 'hurry' | 'young' | 'fire' | 'heart' | 'laugh' | 'angry' | 'like' | 'clap';

export interface InteractionEvent {
  fromId: string;
  fromName: string;
  targetId: string;
  type: InteractionType;
}
