import type { Difficulty } from '../types';

export type GamePhase = 'setup' | 'playing' | 'finished';

export interface BingoPlayer {
  id: string;
  name: string;
  isBot: boolean;
  botDifficulty?: Difficulty;
  card: number[]; // length 25 once filled; [] before filling
  ready: boolean;
  completedLines: number; // 0..5
  connected: boolean;
}

export interface BingoState {
  phase: GamePhase;
  players: BingoPlayer[];
  turnOrder: string[]; // player ids, calling order
  currentTurn: number; // index into turnOrder
  calledNumbers: number[]; // in call order
  winners: string[]; // exactly one id when finished
}

export type BingoMove =
  | { type: 'FillCard'; card: number[] }
  | { type: 'SetReady' }
  | { type: 'CallNumber'; n: number };

export interface BingoView {
  phase: GamePhase;
  you: {
    id: string;
    card: number[];
    marked: boolean[]; // length 25, aligned with card
    completedLines: number;
    ready: boolean;
  };
  opponents: Array<{
    id: string;
    name: string;
    isBot: boolean;
    completedLines: number;
    connected: boolean;
    ready: boolean;
  }>;
  calledNumbers: number[];
  currentPlayerId: string | null; // whose turn (playing phase), else null
  winners: string[];
}
