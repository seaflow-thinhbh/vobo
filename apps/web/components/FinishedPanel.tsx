'use client';

import { useRef } from 'react';
import confetti from 'canvas-confetti';
import type { RoomSnapshot } from '@/lib/types';
import { registerGsap, prefersReducedMotion, gsap, useGSAP } from '@/lib/motion';

registerGsap();

const CELEBRATION = ['B', 'I', 'N', 'G', 'O'] as const;

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
  const container = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const tl = gsap.timeline();
      tl.from('[data-celebrate="letter"]', {
        y: -16,
        scale: 0.4,
        opacity: 0,
        stagger: 0.08,
        duration: 0.4,
        ease: 'back.out(2)',
      });
      tl.from(
        '[data-celebrate="banner"]',
        { y: 20, scale: 0.8, opacity: 0, duration: 0.5, ease: 'back.out(1.7)' },
        '-=0.2',
      );
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.3 } });
      gsap.delayedCall(0.25, () =>
        confetti({ particleCount: 50, spread: 100, origin: { y: 0.35 } }),
      );
    },
    { scope: container },
  );

  return (
    <div ref={container} className="mx-auto max-w-sm text-center">
      <div className="mb-3 flex justify-center gap-2 text-3xl font-extrabold text-emerald-500">
        {CELEBRATION.map((L) => (
          <span key={L} data-celebrate="letter">
            {L}
          </span>
        ))}
      </div>
      <h2 data-celebrate="banner" className="text-2xl font-bold">
        {youWon ? '🎉 Bạn thắng!' : `${name} thắng!`}
      </h2>
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
