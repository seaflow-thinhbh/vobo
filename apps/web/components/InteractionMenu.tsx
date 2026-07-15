'use client';

import { INTERACTIONS } from '@/lib/interactions';
import type { InteractionType } from '@/lib/types';

export function InteractionMenu({
  x,
  y,
  onSelect,
  onClose,
  showAll,
}: {
  x: number;
  y: number;
  onSelect: (type: InteractionType, all: boolean) => void;
  onClose: () => void;
  showAll: boolean;
}) {
  return (
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} />
      <div
        className="fixed z-[101] rounded-lg border border-slate-600 bg-slate-800 p-2 shadow-xl"
        style={{ left: Math.min(x, window.innerWidth - 260), top: Math.min(y, window.innerHeight - 340) }}
      >
        <div className="grid grid-cols-4 gap-1">
          {INTERACTIONS.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => onSelect(item.type, false)}
              className="flex flex-col items-center rounded p-1.5 text-sm hover:bg-slate-700"
              title={item.label}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] text-slate-400">{item.label}</span>
            </button>
          ))}
        </div>
        {showAll && (
          <button
            type="button"
            onClick={() => {
              const first = INTERACTIONS[0]!;
              onSelect(first.type, true);
            }}
            className="mt-1 w-full rounded bg-sky-600 py-1 text-xs text-white"
          >
            Gửi tất cả
          </button>
        )}
      </div>
    </>
  );
}
