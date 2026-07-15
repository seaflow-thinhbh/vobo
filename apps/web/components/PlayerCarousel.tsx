'use client';

import type { RosterEntry } from '@/lib/types';
import { TurnRing } from './TurnRing';

export function PlayerCarousel({
  players,
  currentPlayerId,
  youId,
  turnStartedAt,
  turnEndsAt,
}: {
  players: RosterEntry[];
  currentPlayerId: string | null;
  youId: string;
  turnStartedAt: number | null;
  turnEndsAt: number | null;
}) {
  const idx = players.findIndex((p) => p.id === currentPlayerId);
  const currentIndex = idx >= 0 ? idx : 0;
  const n = Math.max(1, players.length);

  const trackWidthPct = (n / 3) * 100;
  const tileWidthPct = 100 / n;
  const shiftPct = ((1 - currentIndex) / n) * 100;

  return (
    <div className="w-full overflow-hidden">
      <div
        className="flex transition-transform duration-300 ease-out"
        style={{ width: `${trackWidthPct}%`, transform: `translateX(${shiftPct}%)` }}
      >
        {players.map((p) => {
          const isCurrent = p.id === currentPlayerId;
          return (
            <div key={p.id} className="shrink-0 px-1" style={{ width: `${tileWidthPct}%` }}>
              <div
                data-player={p.id}
                data-current={isCurrent ? 'true' : 'false'}
                className={`relative px-2 py-3 text-center text-sm font-semibold transition-transform duration-300 ${
                  isCurrent ? 'bg-slate-800' : 'scale-90 border border-slate-600 bg-slate-700 opacity-60'
                }`}
              >
                {isCurrent && turnStartedAt != null && turnEndsAt != null && (
                  <TurnRing startedAt={turnStartedAt} endsAt={turnEndsAt} />
                )}
                <div className="flex items-center justify-center gap-1">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? 'bg-emerald-500' : 'bg-slate-600'}`}
                  />
                  <span className="truncate">
                    {p.name}
                    {p.id === youId ? ' (bạn)' : ''}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
