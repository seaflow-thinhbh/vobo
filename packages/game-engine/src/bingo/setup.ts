import type { Rng } from '../types';
import type { GridSize } from './types';

export function isValidCard(card: number[], gridSize: GridSize = 5): boolean {
  const total = gridSize * gridSize;
  if (card.length !== total) return false;
  const seen = new Set<number>();
  for (const n of card) {
    if (!Number.isInteger(n) || n < 1 || n > total) return false;
    if (seen.has(n)) return false;
    seen.add(n);
  }
  return true;
}

/** Fisher–Yates shuffle of 1..(gridSize*gridSize) using the injected RNG. */
export function randomCard(rng: Rng, gridSize: GridSize = 5): number[] {
  const total = gridSize * gridSize;
  const card = Array.from({ length: total }, (_, i) => i + 1);
  for (let i = card.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = card[i]!;
    card[i] = card[j]!;
    card[j] = tmp;
  }
  return card;
}
