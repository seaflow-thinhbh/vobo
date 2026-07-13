'use client';

import type { BingoView } from '@/lib/types';
import { cardRows, lettersEarned, BINGO_LETTERS } from '@/lib/bingo';

export function GameBoard({ view }: { view: BingoView }) {
  const rows = cardRows(view.you.card);
  const letters = lettersEarned(view.you.completedLines);

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-2 flex justify-center gap-2 text-lg">
        {BINGO_LETTERS.map((L, i) => (
          <span key={L} className={letters[i] ? 'font-bold text-emerald-600' : 'text-slate-300'}>
            {L}
          </span>
        ))}
      </div>
      <table className="mx-auto border-collapse">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((n, c) => {
                const idx = r * 5 + c;
                const marked = view.you.marked[idx] === true;
                return (
                  <td
                    key={c}
                    data-marked={marked ? 'true' : 'false'}
                    className={`h-12 w-12 border border-slate-300 text-center ${marked ? 'bg-amber-300 font-bold' : ''}`}
                  >
                    {n}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
