'use client';

import { useRef, useState } from 'react';
import type { RosterEntry } from '@/lib/types';
import { registerGsap, prefersReducedMotion, gsap, useGSAP } from '@/lib/motion';

registerGsap();

/** Dice-reveal shown during the server's "rolling" window: the highlight spins,
 *  decelerates, and lands on the (already-decided) first player. */
export function TurnReveal({
  players,
  firstPlayerId,
}: {
  players: RosterEntry[];
  firstPlayerId: string | null;
}) {
  const n = Math.max(1, players.length);
  const foundIndex = players.findIndex((p) => p.id === firstPlayerId);
  const landingIndex = foundIndex >= 0 ? foundIndex : 0;
  const [highlight, setHighlight] = useState(0);
  const container = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        setHighlight(landingIndex);
        return;
      }
      const spins = 3;
      const totalSteps = spins * n + landingIndex;
      const proxy = { t: 0 };
      gsap.to(proxy, {
        t: totalSteps,
        duration: 1.2,
        ease: 'power3.out',
        onUpdate: () => setHighlight(Math.floor(proxy.t) % n),
        onComplete: () => {
          setHighlight(landingIndex);
          // Intentional scope escape: this pop is created inside onComplete (async),
          // so useGSAP's context won't auto-revert it. Harmless — it only exists on the
          // happy path after the spin completes and ends the chip at scale(1) regardless.
          const el = container.current?.querySelector(`[data-chip="${landingIndex}"]`);
          if (el) {
            gsap.fromTo(
              el,
              { scale: 1 },
              { scale: 1.25, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' },
            );
          }
        },
      });
    },
    { dependencies: [firstPlayerId, n], scope: container },
  );

  const first = players.find((p) => p.id === firstPlayerId);

  return (
    <div ref={container} className="mx-auto flex max-w-md flex-col items-center gap-3 py-8">
      <p className="text-lg font-semibold">🎲 Chọn lượt đi đầu…</p>
      <div className="flex flex-wrap justify-center gap-2">
        {players.map((p, i) => (
          <div
            key={p.id}
            data-chip={i}
            data-highlight={i === highlight ? 'true' : 'false'}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              i === highlight ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            {p.name}
          </div>
        ))}
      </div>
      {first && <p className="text-sm text-slate-400">Đi đầu: {first.name}</p>}
    </div>
  );
}
