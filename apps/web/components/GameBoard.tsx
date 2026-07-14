'use client';

import type { BingoView } from '@/lib/types';
import { lettersEarned, BINGO_LETTERS } from '@/lib/bingo';

export function GameBoard({
  view,
  isYourTurn = false,
  onCall = () => {},
}: {
  view: BingoView;
  isYourTurn?: boolean;
  onCall?: (n: number) => void;
}) {
  const letters = lettersEarned(view.you.completedLines);

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-2 flex justify-center gap-3 text-xl">
        {BINGO_LETTERS.map((L, i) => (
          <span key={L} className={letters[i] ? 'font-bold text-emerald-600' : 'text-slate-300'}>
            {L}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {view.you.card.map((n, idx) => {
          const marked = view.you.marked[idx] === true;
          const callable = isYourTurn && !marked;
          return (
            <button
              key={idx}
              type="button"
              data-marked={marked ? 'true' : 'false'}
              disabled={!callable}
              onClick={() => callable && onCall(n)}
              className={`flex aspect-square items-center justify-center rounded border text-lg font-medium ${
                marked
                  ? 'border-amber-300 bg-amber-300 font-bold text-slate-900'
                  : callable
                    ? 'border-sky-500 text-sky-700'
                    : 'border-slate-300 text-slate-700'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
