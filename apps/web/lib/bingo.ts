export function getBingoLetters(gridSize: number): string[] {
  const base = ['B', 'I', 'N', 'G', 'O'];
  if (gridSize <= 5) return base;
  return [...base, ...Array(gridSize - 5).fill('O')];
}

export function lettersEarned(completedLines: number, gridSize: number = 5): boolean[] {
  const letters = getBingoLetters(gridSize);
  return letters.map((_, i) => i < completedLines);
}

export function getWinningLines(gridSize: number): number[][] {
  const N = gridSize;
  const lines: number[][] = [];
  for (let r = 0; r < N; r++) {
    const row: number[] = [];
    for (let c = 0; c < N; c++) row.push(r * N + c);
    lines.push(row);
  }
  for (let c = 0; c < N; c++) {
    const col: number[] = [];
    for (let r = 0; r < N; r++) col.push(r * N + c);
    lines.push(col);
  }
  const diag1: number[] = [];
  for (let i = 0; i < N; i++) diag1.push(i * N + i);
  lines.push(diag1);
  const diag2: number[] = [];
  for (let i = 0; i < N; i++) diag2.push(i * N + (N - 1 - i));
  lines.push(diag2);
  return lines;
}

export const LINES: readonly (readonly number[])[] = getWinningLines(5).map((l) => [...l]);

export function completedLineCells(marked: boolean[], gridSize: number = 5): Set<number> {
  const out = new Set<number>();
  const lines = getWinningLines(gridSize);
  for (const line of lines) {
    if (line.every((i) => marked[i])) {
      for (const i of line) out.add(i);
    }
  }
  return out;
}

export function cardRows(card: number[], gridSize: number = 5): number[][] {
  const rows: number[][] = [];
  for (let r = 0; r < gridSize; r++) rows.push(card.slice(r * gridSize, r * gridSize + gridSize));
  return rows;
}

export function isValidArrangement(cells: (number | null)[], gridSize: number = 5): boolean {
  const total = gridSize * gridSize;
  if (cells.length !== total) return false;
  const seen = new Set<number>();
  for (const c of cells) {
    if (c == null || !Number.isInteger(c) || c < 1 || c > total || seen.has(c)) return false;
    seen.add(c);
  }
  return true;
}

export function duplicateCells(cells: (number | null)[]): boolean[] {
  const counts = new Map<number, number>();
  for (const c of cells) {
    if (c != null) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return cells.map((c) => c != null && (counts.get(c) ?? 0) > 1);
}

export function randomArrangement(gridSize: number = 5): number[] {
  const total = gridSize * gridSize;
  const a = Array.from({ length: total }, (_, i) => i + 1);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}
