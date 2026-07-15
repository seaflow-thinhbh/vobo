import { getWinningLines } from './lines';
import type { GridSize } from './types';

/** boolean[] aligned with the card: true where the cell's number was called. */
export function markedMask(card: number[], called: ReadonlySet<number>): boolean[] {
  return card.map((n) => called.has(n));
}

/** Number of fully-marked winning lines, capped at gridSize. */
export function countCompletedLines(card: number[], called: ReadonlySet<number>, gridSize: GridSize = 5): number {
  const marked = markedMask(card, called);
  const lines = getWinningLines(gridSize);
  let count = 0;
  for (const line of lines) {
    if (line.every((i) => marked[i])) count++;
  }
  return Math.min(count, gridSize);
}
