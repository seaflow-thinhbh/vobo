'use client';

import type { RoomSnapshot } from '@/lib/types';

export function FinishedPanel({
  snapshot,
  isHost = false,
  onNewGame = () => {},
  onLeave,
}: {
  snapshot: RoomSnapshot;
  isHost?: boolean;
  onNewGame?: () => void;
  onLeave: () => void;
}) {
  const winnerId = snapshot.view?.winners[0];
  const youWon = winnerId === snapshot.youId;
  const name = snapshot.roster.find((r) => r.id === winnerId)?.name ?? '?';
  return (
    <div className="mx-auto max-w-sm text-center">
      <h2 className="text-2xl font-bold">{youWon ? '🎉 Bạn thắng!' : `${name} thắng!`}</h2>
      <div className="mt-4 flex flex-col items-center gap-2">
        {isHost ? (
          <button
            type="button"
            onClick={onNewGame}
            className="rounded bg-emerald-600 px-4 py-2 font-medium text-white"
          >
            Ván mới
          </button>
        ) : (
          <p className="text-sm text-slate-500">Chờ chủ phòng mở ván mới…</p>
        )}
        <button type="button" onClick={onLeave} className="rounded bg-slate-800 px-4 py-2 text-white">
          Về sảnh chính
        </button>
      </div>
    </div>
  );
}
