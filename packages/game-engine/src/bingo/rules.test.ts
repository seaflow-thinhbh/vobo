import { describe, it, expect } from 'vitest';
import { markedMask, countCompletedLines } from './rules';

// Card in natural order: cell index i holds number i+1.
const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

describe('markedMask', () => {
  it('marks cells whose number was called', () => {
    const mask = markedMask(ordered, new Set([1, 3]));
    expect(mask[0]).toBe(true); // holds 1
    expect(mask[2]).toBe(true); // holds 3
    expect(mask[1]).toBe(false); // holds 2
  });
});

describe('countCompletedLines', () => {
  it('is 0 when nothing is called', () => {
    expect(countCompletedLines(ordered, new Set())).toBe(0);
  });

  it('counts the top row when 1..5 are called', () => {
    expect(countCompletedLines(ordered, new Set([1, 2, 3, 4, 5]))).toBe(1);
  });

  it('caps at 5 even if more lines complete', () => {
    // all 25 called -> all 12 lines complete -> capped at 5
    const all = new Set(ordered);
    expect(countCompletedLines(ordered, all)).toBe(5);
  });
});
