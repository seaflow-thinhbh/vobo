import { describe, it, expect } from 'vitest';
import {
  BINGO_LETTERS,
  lettersEarned,
  cardRows,
  isValidArrangement,
  randomArrangement,
  completedLineCells,
  duplicateCells,
} from './bingo';

describe('bingo helpers', () => {
  it('BINGO_LETTERS is B I N G O', () => {
    expect([...BINGO_LETTERS]).toEqual(['B', 'I', 'N', 'G', 'O']);
  });

  it('lettersEarned reflects completed line count', () => {
    expect(lettersEarned(0)).toEqual([false, false, false, false, false]);
    expect(lettersEarned(3)).toEqual([true, true, true, false, false]);
    expect(lettersEarned(5)).toEqual([true, true, true, true, true]);
  });

  it('cardRows splits 25 cells into 5 rows of 5', () => {
    const card = Array.from({ length: 25 }, (_, i) => i + 1);
    const rows = cardRows(card);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual([1, 2, 3, 4, 5]);
    expect(rows[4]).toEqual([21, 22, 23, 24, 25]);
  });

  it('isValidArrangement requires a full 1..25 permutation', () => {
    const ok = Array.from({ length: 25 }, (_, i) => i + 1);
    expect(isValidArrangement(ok)).toBe(true);
    expect(isValidArrangement([1, 2, 3])).toBe(false);
    const withNull: (number | null)[] = [...ok];
    withNull[0] = null;
    expect(isValidArrangement(withNull)).toBe(false);
  });

  it('randomArrangement produces a valid arrangement', () => {
    expect(isValidArrangement(randomArrangement())).toBe(true);
  });
});

describe('completedLineCells', () => {
  it('is empty when no line is fully marked', () => {
    expect(completedLineCells(Array(25).fill(false)).size).toBe(0);
  });

  it('returns the cells of a completed row', () => {
    const marked = Array<boolean>(25).fill(false);
    for (const i of [0, 1, 2, 3, 4]) marked[i] = true;
    expect([...completedLineCells(marked)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('unions cells across several completed lines (shared corner counted once)', () => {
    const marked = Array<boolean>(25).fill(false);
    // top row (0-4) + left column (0,5,10,15,20) both complete
    for (const i of [0, 1, 2, 3, 4, 5, 10, 15, 20]) marked[i] = true;
    const cells = completedLineCells(marked);
    expect(cells.has(0)).toBe(true); // shared corner
    expect(cells.has(20)).toBe(true);
    expect(cells.has(6)).toBe(false); // on neither completed line
  });
});

describe('duplicateCells', () => {
  it('flags every cell whose value repeats', () => {
    expect(duplicateCells([1, 2, 2, null, 3])).toEqual([false, true, true, false, false]);
  });

  it('flags nothing when values are unique or empty', () => {
    expect(duplicateCells([1, 2, null, 3])).toEqual([false, false, false, false]);
  });
});
