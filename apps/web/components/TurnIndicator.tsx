'use client';

export function TurnIndicator({
  currentPlayerId,
  youId,
  roster,
}: {
  currentPlayerId: string | null;
  youId: string;
  roster: { id: string; name: string }[];
}) {
  if (!currentPlayerId) return null;
  if (currentPlayerId === youId) {
    return <div className="text-center text-sm font-semibold text-emerald-700">Lượt của bạn</div>;
  }
  const name = roster.find((r) => r.id === currentPlayerId)?.name ?? '';
  return <div className="text-center text-sm text-slate-600">Lượt của {name}</div>;
}
