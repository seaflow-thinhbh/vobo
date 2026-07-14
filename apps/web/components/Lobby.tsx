'use client';

import type { RoomSnapshot, Difficulty } from '@/lib/types';
import { Leaderboard } from './Leaderboard';

export function Lobby({
  snapshot,
  isHost,
  onAddBot,
  onStart,
  onKick,
}: {
  snapshot: RoomSnapshot;
  isHost: boolean;
  onAddBot: (d: Difficulty) => void;
  onStart: () => void;
  onKick: (playerId: string) => void;
}) {
  const canStart = snapshot.roster.length >= 2;
  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-3 text-center">
        <div className="text-xs text-slate-500">Mã phòng</div>
        <div className="text-3xl font-bold tracking-widest">{snapshot.code}</div>
      </div>
      <ul data-roster className="mb-3 divide-y rounded border">
        {snapshot.roster.map((p) => (
          <li key={p.id} className="flex items-center gap-2 px-3 py-2">
            <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span>{p.name}</span>
            {p.isBot && <span className="ml-auto text-xs text-slate-400">bot</span>}
            {p.id === snapshot.hostId && (
              <span className={`text-xs text-amber-600 ${p.isBot ? '' : 'ml-auto'}`}>chủ phòng</span>
            )}
            {isHost && !p.isBot && p.id !== snapshot.youId && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Đá ${p.name} khỏi phòng?`)) onKick(p.id);
                }}
                className="ml-auto rounded bg-rose-500 px-2 py-0.5 text-xs text-white hover:bg-rose-600"
              >
                Đá
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mb-3">
        <Leaderboard roster={snapshot.roster} />
      </div>
      {isHost ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onAddBot(d)}
                className="flex-1 rounded bg-slate-200 py-2 text-sm"
              >
                + Bot {d}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="rounded bg-emerald-600 py-2 font-medium text-white disabled:opacity-40"
          >
            Bắt đầu
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500">Chờ chủ phòng bắt đầu…</p>
      )}
    </div>
  );
}
