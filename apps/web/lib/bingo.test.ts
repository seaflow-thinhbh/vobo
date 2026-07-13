import { describe, it, expect } from 'vitest';
import { BINGO_LETTERS, lettersEarned, cardRows, isValidArrangement, randomArrangement } from './bingo';

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
