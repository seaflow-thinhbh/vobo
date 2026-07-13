import type { Rng, Difficulty } from '../types';
import type { BingoView, BingoMove } from './types';
import { LINES } from './lines';

export function botMove(view: BingoView, difficulty: Difficulty, rng: Rng): BingoMove {
  const uncalled = uncalledNumbers(view.calledNumbers);
  if (uncalled.length === 0) throw new Error('no numbers left to call');

  if (difficulty === 'easy') {
    return { type: 'CallNumber', n: uncalled[rng.int(uncalled.length)]! };
  }
  return { type: 'CallNumber', n: greedyPick(view.you.card, view.calledNumbers, uncalled, difficulty) };
}

function uncalledNumbers(called: number[]): number[] {
  const set = new Set(called);
  const out: number[] = [];
  for (let n = 1; n <= 25; n++) if (!set.has(n)) out.push(n);
  return out;
}

function greedyPick(card: number[], called: number[], uncalled: number[], difficulty: Difficulty): number {
  const marked = card.map((v) => called.includes(v));
  let best = uncalled[0]!;
  let bestKey: [number, number, number] = [-1, -1, -1];

  for (const n of uncalled) {
    const cell = card.indexOf(n); // the one cell this call would mark on the bot's card
    let completed = 0;
    let progress = 0;
    for (const line of LINES) {
      if (!line.includes(cell)) continue;
      const alreadyMarked = line.filter((c) => c !== cell && marked[c]).length;
      if (alreadyMarked === 4) completed++; // marking `cell` completes this line
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
