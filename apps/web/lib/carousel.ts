/** Indices of the (up to 3) player tiles to show, centered on the current player. */
export function visibleWindow(count: number, currentIndex: number): number[] {
  if (count <= 3) return Array.from({ length: count }, (_, i) => i);
  let start = currentIndex - 1;
  if (start < 0) start = 0;
  if (start > count - 3) start = count - 3;
  return [start, start + 1, start + 2];
}

/** Turn-timer border colour: green while >50% time remains, amber at/below 50%. */
export function ringColor(fractionRemaining: number): 'green' | 'amber' {
  return fractionRemaining > 0.5 ? 'green' : 'amber';
}
