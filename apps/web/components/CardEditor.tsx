'use client';

import { useState } from 'react';
import { isValidArrangement, randomArrangement, duplicateCells } from '@/lib/bingo';

export function CardEditor({
  onSubmit,
  disabled = false,
}: {
  onSubmit: (card: number[]) => void;
  disabled?: boolean;
}) {
  const [cells, setCells] = useState<(number | null)[]>(() => Array(25).fill(null));
  const valid = isValidArrangement(cells);
  const dups = duplicateCells(cells);

  function setCell(i: number, raw: string): void {
    const n = raw === '' ? null : Number(raw);
    setCells((prev) => prev.map((c, idx) => (idx === i ? (n === null || Number.isNaN(n) ? null : n) : c)));
  }

  return (
    <div className="mx-auto max-w-sm">
      <p className="mb-2 text-sm text-slate-300">
        Điền số 1–25 vào 25 ô (mỗi số một lần), hoặc bấm “Xếp ngẫu nhiên”.
      </p>
      <div className="grid grid-cols-5 gap-1">
        {cells.map((c, i) => (
          <input
            key={i}
            aria-label={`Ô ${i + 1}`}
            data-duplicate={dups[i] ? 'true' : 'false'}
            type="number"
            min={1}
            max={25}
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
          onClick={() => setCells(randomArrangement())}
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
      {!valid && (
        <p className="mt-2 text-xs text-rose-600">Vé chưa hợp lệ: cần đủ số 1–25, không trùng.</p>
      )}
    </div>
  );
}
