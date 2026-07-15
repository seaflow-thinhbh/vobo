import type { Difficulty } from '../types';

export type GamePhase = 'setup' | 'playing' | 'finished';
export type GridSize = 5 | 6 | 7;

export interface BingoPlayer {
  id: string;
  name: string;
  isBot: boolean;
  botDifficulty?: Difficulty;
  card: number[]; // length gridSize*gridSize once filled; [] before filling
  ready: boolean;
  completedLines: number; // 0..gridSize
  connected: boolean;
  bombNumber: number | null; // number with bomb trap (only visible to owner)
}

export interface BingoState {
  gridSize: GridSize;
  phase: GamePhase;
  players: BingoPlayer[];
  turnOrder: string[]; // player ids, calling order
  currentTurn: number; // index into turnOrder
  calledNumbers: number[]; // in call order
  winners: string[]; // exactly one id when finished
  skipNext: boolean; // when true, next player is skipped (bomb penalty)
  bombPenalties: Record<string, number[]>; // playerId -> called numbers that are NOT marked for them
}

export type BingoMove =
  | { type: 'FillCard'; card: number[] }
  | { type: 'SetReady' }
  | { type: 'CallNumber'; n: number }
  | { type: 'PlaceBomb'; n: number };

export interface BingoView {
  gridSize: GridSize;
  phase: GamePhase;
  you: {
    id: string;
    card: number[];
    marked: boolean[]; // length gridSize*gridSize, aligned with card
    completedLines: number;
    ready: boolean;
    bombNumber: number | null;
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
