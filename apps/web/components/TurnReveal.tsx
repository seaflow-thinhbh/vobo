'use client';

import { useEffect, useState } from 'react';
import type { RosterEntry } from '@/lib/types';

/** Dice-reveal shown during the server's "rolling" window: a highlight cycles the
 *  players and the first player (already decided server-side) is announced. */
export function TurnReveal({
  players,
  firstPlayerId,
}: {
  players: RosterEntry[];
  firstPlayerId: string | null;
}) {
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (typeof setInterval === 'undefined') return;
    const id = setInterval(() => {
      setHighlight((h) => (h + 1) % Math.max(1, players.length));
    }, 120);
    return () => clearInterval(id);
  }, [players.length]);

  const first = players.find((p) => p.id === firstPlayerId);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-8">
      <p className="text-lg font-semibold">🎲 Chọn lượt đi đầu…</p>
      <div className="flex flex-wrap justify-center gap-2">
        {players.map((p, i) => (
          <div
            key={p.id}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              i === highlight ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {p.name}
          </div>
        ))}
      </div>
      {first && (
        <p className="text-sm text-slate-600">
          Đi đầu: {first.name}
        </p>
      )}
    </div>
  );
}
