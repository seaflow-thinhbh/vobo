'use client';

import { useEffect, useState } from 'react';
import { ringColor } from '@/lib/carousel';

/** An SVG border around its parent that depletes from full to empty over the turn. */
export function TurnRing({ startedAt, endsAt }: { startedAt: number; endsAt: number }) {
  const [now, setNow] = useState(startedAt); // start deterministic (avoids hydration mismatch)

  useEffect(() => {
    if (typeof requestAnimationFrame === 'undefined') return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const total = Math.max(1, endsAt - startedAt);
  const fraction = Math.min(1, Math.max(0, (endsAt - now) / total));
  const stroke = ringColor(fraction) === 'green' ? '#10b981' : '#f59e0b';

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="1.5"
        width="97"
        height="97"
        rx="8"
        pathLength={100}
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeDasharray={`${fraction * 100} 100`}
        strokeLinecap="round"
      />
    </svg>
  );
}
