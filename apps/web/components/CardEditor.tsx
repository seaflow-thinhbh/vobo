'use client';

import { useState } from 'react';
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
  const [swapPopup, setSwapPopup] = useState<{ inputValue: number; duplicateIndex: number; currentIndex: number } | null>(null);
  const valid = isValidArrangement(cells, gridSize);
  const dups = duplicateCells(cells);

  function setCell(i: number, raw: string): void {
    const n = raw === '' ? null : Number(raw);
    if (n !== null && !Number.isNaN(n) && n >= 1 && n <= total) {
      const dupIdx = cells.findIndex((c, idx) => idx !== i && c === n);
      if (dupIdx !== -1) {
        setSwapPopup({ inputValue: n, duplicateIndex: dupIdx, currentIndex: i });
        return;
      }
    }
    applyCell(i, raw);
  }

  function applyCell(i: number, raw: string): void {
    const n = raw === '' ? null : Number(raw);
    setCells((prev) => prev.map((c, idx) => (idx === i ? (n === null || Number.isNaN(n) ? null : n) : c)));
  }

  function handleSwap(): void {
    if (!swapPopup) return;
    const { inputValue, duplicateIndex, currentIndex } = swapPopup;
    setCells((prev) => {
      const next = [...prev];
      next[currentIndex] = inputValue;
      next[duplicateIndex] = null;
      return next;
    });
    setSwapPopup(null);
  }

  return (
    <div className="mx-auto max-w-sm">
      <p className="mb-2 text-sm text-slate-300">
        Điền số 1–{total} vào {total} ô (mỗi số một lần), hoặc bấm "Xếp ngẫu nhiên".
      </p>
      <div className={`grid gap-1 ${gridSize === 5 ? 'grid-cols-5' : gridSize === 6 ? 'grid-cols-6' : 'grid-cols-7'}`}>
        {cells.map((c, i) => (
          <input
            key={i}
            aria-label={`Ô ${i + 1}`}
            data-duplicate={dups[i] ? 'true' : 'false'}
            type="number"
            min={1}
            max={total}
            value={c ?? ''}
            onChange={(e) => setCell(i, e.target.value)}
            disabled={disabled || swapPopup !== null}
            className={`h-12 w-full rounded border text-center text-lg ${
              dups[i] ? 'border-red-500 bg-red-900/50 text-red-300' : 'border-slate-600 bg-slate-800 text-slate-100'
            }`}
          />
        ))}
      </div>

      {/* Swap popup */}
      {swapPopup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60">
          <div className="mx-4 rounded-xl bg-slate-800 p-5 text-center shadow-2xl border border-slate-600">
            <p className="text-slate-100 font-semibold">
              Số <span className="text-amber-400">{swapPopup.inputValue}</span> đã có ở vị trí khác!
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Bạn có muốn đổi chỗ 2 ô này không?
            </p>
            <div className="mt-4 flex gap-2 justify-center">
              <button
                type="button"
                onClick={handleSwap}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
              >
                Đổi chỗ
              </button>
              <button
                type="button"
                onClick={() => setSwapPopup(null)}
                className="rounded bg-slate-600 px-4 py-2 text-sm font-medium text-white"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

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
      {!valid && (
        <p className="mt-2 text-xs text-rose-600">Vé chưa hợp lệ: cần đủ số 1–{total}, không trùng.</p>
      )}
    </div>
  );
}
