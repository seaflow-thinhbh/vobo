import { describe, it, expect } from 'vitest';
import { LINES } from './lines';

describe('LINES', () => {
  it('has 12 lines (5 rows + 5 cols + 2 diagonals)', () => {
    expect(LINES).toHaveLength(12);
  });

  it('each line has 5 cell indices in range 0..24', () => {
    for (const line of LINES) {
      expect(line).toHaveLength(5);
      for (const i of line) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThanOrEqual(24);
      }
    }
  });

  it('includes the top row, left column, and main diagonal', () => {
    const asStrings = LINES.map((l) => l.join(','));
    expect(asStrings).toContain('0,1,2,3,4'); // top row
    expect(asStrings).toContain('0,5,10,15,20'); // left column
    expect(asStrings).toContain('0,6,12,18,24'); // main diagonal
  });
});
