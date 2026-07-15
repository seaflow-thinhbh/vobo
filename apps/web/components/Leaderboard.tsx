import type { RosterEntry } from '@/lib/types';

/** Per-room win leaderboard: players ranked by wins (desc). Presentational only. */
export function Leaderboard({ roster }: { roster: RosterEntry[] }) {
  const ranked = [...roster].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0));
  return (
    <div data-leaderboard className="rounded border border-slate-600/60 text-sm">
      <div className="border-b border-slate-600/60 px-3 py-1 text-xs font-semibold opacity-70">
        🏆 Bảng xếp hạng
      </div>
      <ul className="divide-y divide-slate-600/40">
        {ranked.map((p, i) => (
          <li key={p.id} data-player={p.id} className="flex items-center gap-2 px-3 py-1.5">
            <span className="w-5 opacity-60">#{i + 1}</span>
            <span>{p.name}</span>
            {p.isBot && <span className="text-xs opacity-50">bot</span>}
            <span className="ml-auto font-semibold">🏆 {p.wins ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
