import type { GridSize } from './types';

export function getWinningLines(gridSize: GridSize): number[][] {
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

/** Pre-computed 5x5 lines for backward compatibility and default. */
export const LINES: readonly (readonly number[])[] = getWinningLines(5).map((l) => [...l]);
