'use client';

import type { RoomSnapshot } from '@/lib/types';

export function ResultOverlay({
  snapshot,
  onPlayAgain,
  onLeave,
}: {
  snapshot: RoomSnapshot;
  onPlayAgain: () => void;
  onLeave: () => void;
}) {
  const youWon = snapshot.view?.winners[0] === snapshot.youId;
  const youVoted = snapshot.replayVotes?.includes(snapshot.youId) ?? false;
  const votedCount = snapshot.replayVotes?.length ?? 0;
  const totalHumans = snapshot.roster.filter((r) => !r.isBot).length;

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl p-4">
      <button
        type="button"
        onClick={onPlayAgain}
        disabled={youVoted}
        className={`rounded px-4 py-2 font-medium ${
          youVoted
            ? 'cursor-not-allowed bg-emerald-100 text-emerald-700'
            : 'bg-emerald-600 text-white hover:bg-emerald-700'
        }`}
      >
        {youVoted ? 'Đã sẵn sàng ✓' : 'Chơi lại'}
      </button>
      <p className="text-xs text-slate-400">
        {votedCount}/{totalHumans} người đã sẵn sàng
      </p>
      <div className="flex flex-wrap justify-center gap-1">
        {snapshot.roster.filter((r) => !r.isBot).map((r) => (
          <span
            key={r.id}
            className={`rounded px-1.5 py-0.5 text-xs ${
              snapshot.replayVotes?.includes(r.id)
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-600'
            }`}
          >
            {r.name} {snapshot.replayVotes?.includes(r.id) ? '✓' : 'Chưa sẵn sàng'}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onLeave}
        className="rounded bg-slate-700 px-4 py-2 font-medium text-slate-100"
      >
        Thoát phòng
      </button>
    </div>
  );
}
