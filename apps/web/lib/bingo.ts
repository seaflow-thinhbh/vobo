export const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'] as const;

/** Which of the five B-I-N-G-O letters are earned for a given completed-line count. */
export function lettersEarned(completedLines: number): boolean[] {
  return BINGO_LETTERS.map((_, i) => i < completedLines);
}

/** The 12 winning lines as index arrays into a 25-cell (5x5, row-major) card. */
export const LINES: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

/** Cell indices belonging to at least one fully-marked winning line. */
export function completedLineCells(marked: boolean[]): Set<number> {
  const out = new Set<number>();
  for (const line of LINES) {
    if (line.every((i) => marked[i])) {
      for (const i of line) out.add(i);
    }
  }
  return out;
}

/** Split a 25-cell row-major card into 5 rows of 5. */
export function cardRows(card: number[]): number[][] {
  const rows: number[][] = [];
  for (let r = 0; r < 5; r++) rows.push(card.slice(r * 5, r * 5 + 5));
  return rows;
}

/** True when cells is a full permutation of 1..25 (no nulls, no dupes). */
export function isValidArrangement(cells: (number | null)[]): boolean {
  if (cells.length !== 25) return false;
  const seen = new Set<number>();
  for (const c of cells) {
    if (c == null || !Number.isInteger(c) || c < 1 || c > 25 || seen.has(c)) return false;
    seen.add(c);
  }
  return true;
}

/** A random shuffle of 1..25 for the "Xếp ngẫu nhiên" button (client-side, cosmetic). */
export function randomArrangement(): number[] {
  const a = Array.from({ length: 25 }, (_, i) => i + 1);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}
