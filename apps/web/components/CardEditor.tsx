'use client';

import { useState, useMemo } from 'react';
import { isValidArrangement, randomArrangement, duplicateCells } from '@/lib/bingo';

export function CardEditor({
  onSubmit,
  disabled = false,
  gridSize = 5,
}: {
  onSubmit: (card: number[]) => void;
  disabled?: boolean;
  gridSize?: number;
}) {
  const total = gridSize * gridSize;
  const [cells, setCells] = useState<(number | null)[]>(() => Array(total).fill(null));
  const valid = isValidArrangement(cells, gridSize);
  const dups = duplicateCells(cells);

  const validationDetail = useMemo(() => {
    if (valid) return null;
    const dupNums: number[] = [];
    const seen = new Set<number>();
    const dupSet = new Set<number>();
    for (const c of cells) {
      if (c == null) continue;
      if (seen.has(c)) dupSet.add(c);
      seen.add(c);
    }
    for (const n of dupSet) dupNums.push(n);
    const present = new Set(cells.filter((c): c is number => c != null));
    const missing: number[] = [];
    for (let n = 1; n <= total; n++) {
      if (!present.has(n)) missing.push(n);
    }
    const parts: string[] = [];
    if (dupNums.length > 0) parts.push(`trùng số ${dupNums.sort((a, b) => a - b).join(', ')}`);
    if (missing.length > 0) parts.push(`thiếu số ${missing.sort((a, b) => a - b).join(', ')}`);
    return parts.length > 0 ? parts.join('. ') + '.' : null;
  }, [cells, valid, total]);

  function setCell(i: number, raw: string): void {
    const n = raw === '' ? null : Number(raw);
    setCells((prev) => prev.map((c, idx) => (idx === i ? (n === null || Number.isNaN(n) || n < 1 || n > total ? null : n) : c)));
  }

  return (
    <div className="mx-auto max-w-sm">
      <p className="mb-2 text-sm text-slate-300">
        Điền số 1–{total} vào {total} ô (mỗi số một lần), hoặc bấm &quot;Xếp ngẫu nhiên&quot;.
      </p>
      <div className={`grid gap-1 ${gridSize === 5 ? 'grid-cols-5' : gridSize === 6 ? 'grid-cols-6' : 'grid-cols-7'}`}>
        {cells.map((c, i) => (
          <input
            key={i}
            aria-label={`Ô ${i + 1}`}
            type="number"
            min={1}
            max={total}
            value={c ?? ''}
            onChange={(e) => setCell(i, e.target.value)}
            disabled={disabled}
            className={`h-12 w-full rounded border text-center text-lg ${
              dups[i] ? 'border-red-500 bg-red-900/50 text-red-300' : 'border-slate-600 bg-slate-800 text-slate-100'
            }`}
          />
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setCells(randomArrangement(gridSize))}
          disabled={disabled}
          className="flex-1 rounded bg-slate-700 py-2 font-medium text-slate-200"
        >
          Xếp ngẫu nhiên
        </button>
        <button
          type="button"
          onClick={() => valid && onSubmit(cells as number[])}
          disabled={disabled || !valid}
          className="flex-1 rounded bg-emerald-600 py-2 font-medium text-white disabled:opacity-40"
        >
          Sẵn sàng
        </button>
      </div>
      {!valid && validationDetail && (
        <p className="mt-2 text-xs text-rose-400">Vé chưa hợp lệ: {validationDetail}</p>
      )}
    </div>
  );
}
