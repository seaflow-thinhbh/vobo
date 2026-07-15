'use client';

import { useState } from 'react';
import { INTERACTIONS } from '@/lib/interactions';
import type { InteractionType, RosterEntry } from '@/lib/types';

export function InteractionBar({
  players,
  youId,
  onSend,
}: {
  players: RosterEntry[];
  youId: string;
  onSend: (targetId: string, type: InteractionType) => void;
}) {
  const [selectedType, setSelectedType] = useState<InteractionType | null>(null);

  function handleEmojiClick(type: InteractionType) {
    setSelectedType(type);
  }

  function handleTarget(targetId: string) {
    if (selectedType) {
      onSend(targetId, selectedType);
      setSelectedType(null);
    }
  }

  const others = players.filter((p) => p.id !== youId);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-700 bg-slate-800/95 backdrop-blur px-2 py-1.5">
        <div className="flex gap-1 overflow-x-auto pb-1 justify-center">
          {INTERACTIONS.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => handleEmojiClick(item.type)}
              className={`shrink-0 rounded p-1.5 text-xl transition hover:scale-125 hover:bg-slate-700 ${
                selectedType === item.type ? 'scale-125 bg-sky-700 ring-2 ring-sky-400' : ''
              }`}
              title={item.label}
            >
              {item.icon}
            </button>
          ))}
        </div>
      </div>

      {selectedType && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSelectedType(null)} />
          <div className="fixed bottom-16 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-slate-600 bg-slate-800 p-3 shadow-2xl">
            <p className="mb-2 text-center text-sm text-slate-300">
              Gửi {INTERACTIONS.find((d) => d.type === selectedType)?.icon} đến:
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={() => handleTarget('*')}
                className="rounded-full bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white"
              >
                Tất cả
              </button>
              {others.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleTarget(p.id)}
                  className="rounded-full bg-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
