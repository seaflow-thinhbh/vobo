export type Difficulty = 'easy' | 'medium' | 'hard';

export interface PlayerSeat {
  id: string;
  name: string;
  isBot: boolean;
  botDifficulty?: Difficulty;
}

/** Validation result for a proposed move. */
export type Result =
  | { ok: true }
  | { ok: false; code: string; message: string };

/** Injected deterministic RNG. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}
