import type { PlayerSeat, Rng, Result, Difficulty } from './types';

export interface GameEnd {
  finished: boolean;
  winners: string[];
}

/**
 * Game-agnostic module. S = full server state, M = move, V = per-player view.
 * All methods are pure; randomness comes only from the injected Rng.
 */
export interface GameModule<S, M, V> {
  id: string;
  createInitialState(players: PlayerSeat[], rng: Rng, opts?: { firstPlayerId?: string; gridSize?: number }): S;
  validateMove(state: S, playerId: string, move: M): Result;
  applyMove(state: S, playerId: string, move: M): S;
  checkGameEnd(state: S): GameEnd;
  botMove(view: V, difficulty: Difficulty, rng: Rng): M;
  projectStateFor(state: S, playerId: string): V;
}
