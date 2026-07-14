'use client';

import type { RosterEntry } from '@/lib/types';
import { visibleWindow } from '@/lib/carousel';
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
  const currentIndex = currentPlayerId ? players.findIndex((p) => p.id === currentPlayerId) : -1;
  const idxs = visibleWindow(players.length, currentIndex >= 0 ? currentIndex : 0);

  return (
    <div className="flex items-center justify-center gap-2">
      {idxs.map((i) => {
        const p = players[i];
        if (!p) return null;
        const isCurrent = p.id === currentPlayerId;
        return (
          <div
            key={p.id}
            data-player={p.id}
            data-current={isCurrent ? 'true' : 'false'}
            className={`relative min-w-[84px] rounded-lg p-3 text-center text-sm font-semibold ${
              isCurrent ? 'bg-slate-50' : 'scale-90 bg-slate-100 opacity-60'
            }`}
          >
            {isCurrent && turnStartedAt != null && turnEndsAt != null && (
              <TurnRing startedAt={turnStartedAt} endsAt={turnEndsAt} />
            )}
            <div className="flex items-center justify-center gap-1">
              <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className="max-w-[72px] truncate">
                {p.name}
                {p.id === youId ? ' (bạn)' : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
