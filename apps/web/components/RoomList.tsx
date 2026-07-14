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
    return <p className="text-center text-sm text-slate-400">Chưa có phòng nào đang chờ</p>;
  }
  return (
    <ul className="divide-y rounded border">
      {rooms.map((r) => (
        <li key={r.code} className="flex items-center gap-2 px-3 py-2 text-sm">
          <span className="flex-1 truncate">
            Phòng của <b>{r.hostName}</b>
          </span>
          <span className="text-slate-500">
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
