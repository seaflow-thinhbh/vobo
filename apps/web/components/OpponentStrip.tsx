'use client';

import type { OpponentView } from '@/lib/types';
import { lettersEarned, BINGO_LETTERS } from '@/lib/bingo';

export function OpponentStrip({
  opponents,
  currentPlayerId,
}: {
  opponents: OpponentView[];
  currentPlayerId: string | null;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {opponents.map((o) => {
        const letters = lettersEarned(o.completedLines);
        const isCurrent = o.id === currentPlayerId;
        return (
          <div
            key={o.id}
            data-current={isCurrent ? 'true' : 'false'}
            className={`min-w-[76px] shrink-0 rounded p-2 text-center text-xs ${
              isCurrent ? 'ring-2 ring-emerald-500' : 'bg-slate-100'
            }`}
          >
            <div className="flex items-center justify-center gap-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${o.connected ? 'bg-emerald-500' : 'bg-slate-300'}`}
              />
              <span className="max-w-[52px] truncate">{o.name}</span>
            </div>
            <div className="mt-1 font-mono">
              {BINGO_LETTERS.map((L, i) => (
                <span key={L} className={letters[i] ? 'text-emerald-600' : 'text-slate-300'}>
                  {L}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
