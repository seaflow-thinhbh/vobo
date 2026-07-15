import type { Rng, Difficulty } from '../types';
import type { BingoView, BingoMove } from './types';
import { getWinningLines } from './lines';

export function botMove(view: BingoView, difficulty: Difficulty, rng: Rng): BingoMove {
  const uncalled = uncalledNumbers(view.calledNumbers, view.gridSize);
  if (uncalled.length === 0) throw new Error('no numbers left to call');

  if (difficulty === 'easy') {
    return { type: 'CallNumber', n: uncalled[rng.int(uncalled.length)]! };
  }
  return { type: 'CallNumber', n: greedyPick(view.you.card, view.calledNumbers, uncalled, difficulty, view.gridSize) };
}

function uncalledNumbers(called: number[], gridSize: number): number[] {
  const set = new Set(called);
  const out: number[] = [];
  for (let n = 1; n <= gridSize * gridSize; n++) if (!set.has(n)) out.push(n);
  return out;
}

function greedyPick(card: number[], called: number[], uncalled: number[], difficulty: Difficulty, gridSize: number): number {
  const marked = card.map((v) => called.includes(v));
  const lines = getWinningLines(gridSize as 5 | 6 | 7);
  const lineLen = gridSize;
  let best = uncalled[0]!;
  let bestKey: [number, number, number] = [-1, -1, -1];

  for (const n of uncalled) {
    const cell = card.indexOf(n);
    let completed = 0;
    let progress = 0;
    for (const line of lines) {
      if (!line.includes(cell)) continue;
      const alreadyMarked = line.filter((c) => c !== cell && marked[c]).length;
      if (alreadyMarked === lineLen - 1) completed++;
      const weight = alreadyMarked + 1;
      progress += difficulty === 'hard' ? weight * weight : weight;
    }
    const key: [number, number, number] = [completed, progress, -n];
    if (compareKey(key, bestKey) > 0) {
      bestKey = key;
      best = n;
    }
  }
  return best;
}

function compareKey(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
}
