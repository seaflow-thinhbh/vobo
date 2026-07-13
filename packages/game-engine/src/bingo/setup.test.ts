import { describe, it, expect } from 'vitest';
import { isValidCard, randomCard } from './setup';
import { createRng } from '../rng';

describe('isValidCard', () => {
  it('accepts a permutation of 1..25', () => {
    const card = Array.from({ length: 25 }, (_, i) => i + 1);
    expect(isValidCard(card)).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidCard([1, 2, 3])).toBe(false);
  });

  it('rejects duplicates', () => {
    const card = Array.from({ length: 25 }, (_, i) => i + 1);
    card[24] = card[0]!; // duplicate
    expect(isValidCard(card)).toBe(false);
  });

  it('rejects out-of-range numbers', () => {
    const card = Array.from({ length: 25 }, (_, i) => i + 1);
    card[0] = 26;
    expect(isValidCard(card)).toBe(false);
  });
});

describe('randomCard', () => {
  it('produces a valid card', () => {
    expect(isValidCard(randomCard(createRng(1)))).toBe(true);
  });

  it('is deterministic per seed', () => {
    expect(randomCard(createRng(9))).toEqual(randomCard(createRng(9)));
  });
});
