import { LINES } from './lines';

/** boolean[25] aligned with the card: true where the cell's number was called. */
export function markedMask(card: number[], called: ReadonlySet<number>): boolean[] {
  return card.map((n) => called.has(n));
}

/** Number of fully-marked winning lines, capped at 5 (the B-I-N-G-O letters). */
export function countCompletedLines(card: number[], called: ReadonlySet<number>): number {
  const marked = markedMask(card, called);
  let count = 0;
  for (const line of LINES) {
    if (line.every((i) => marked[i])) count++;
  }
  return Math.min(count, 5);
}
