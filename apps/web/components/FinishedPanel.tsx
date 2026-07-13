'use client';

import type { RoomSnapshot } from '@/lib/types';

export function FinishedPanel({
  snapshot,
  onLeave,
}: {
  snapshot: RoomSnapshot;
  onLeave: () => void;
}) {
  const winnerId = snapshot.view?.winners[0];
  const youWon = winnerId === snapshot.youId;
  const name = snapshot.roster.find((r) => r.id === winnerId)?.name ?? '?';
  return (
    <div className="mx-auto max-w-sm text-center">
      <h2 className="text-2xl font-bold">{youWon ? '🎉 Bạn thắng!' : `${name} thắng!`}</h2>
      <button type="button" onClick={onLeave} className="mt-4 rounded bg-slate-800 px-4 py-2 text-white">
        Về sảnh
      </button>
    </div>
  );
}
