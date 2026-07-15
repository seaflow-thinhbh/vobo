'use client';

import type { OpenRoom } from '@/lib/types';

export function RoomList({
  rooms,
  onJoin,
  disabled = false,
}: {
  rooms: OpenRoom[];
  onJoin: (code: string) => void;
  disabled?: boolean;
}) {
  if (rooms.length === 0) {
    return <p className="text-center text-sm text-slate-500">Chưa có phòng nào đang chờ</p>;
  }
  return (
    <ul className="divide-y divide-slate-700 rounded border border-slate-600">
      {rooms.map((r) => (
        <li key={r.code} className="flex items-center gap-2 px-3 py-2 text-sm">
          <span className="flex-1 truncate">
            Phòng của <b>{r.hostName}</b>
          </span>
          <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-300">
            {r.gridSize || 5}x{r.gridSize || 5}
          </span>
          <span className="text-slate-400">
            {r.playerCount}/{r.maxPlayers}
          </span>
          <button
            type="button"
            onClick={() => onJoin(r.code)}
            disabled={disabled}
            className="rounded bg-sky-600 px-3 py-1 font-medium text-white disabled:opacity-40"
          >
            Vào
          </button>
        </li>
      ))}
    </ul>
  );
}
