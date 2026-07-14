'use client';

import { useEffect, useState } from 'react';
import { ringColor } from '@/lib/carousel';

/**
 * An SVG border around its parent that depletes over the turn.
 *
 * The countdown runs on a CLIENT-LOCAL clock (elapsed since this turn was
 * received) — NOT the server's absolute timestamps. Comparing the server's
 * `endsAt` against the browser's `Date.now()` breaks whenever the two clocks
 * are skewed: the bar would sit full and start late, and/or still show time
 * left after the server had already auto-called. We use the server timestamps
 * only for the DURATION (`endsAt - startedAt`), which is skew-immune, and count
 * that duration down locally from the moment the turn is shown.
 */
export function TurnRing({ startedAt, endsAt }: { startedAt: number; endsAt: number }) {
  const duration = Math.max(1, endsAt - startedAt);
  const [fraction, setFraction] = useState(1);

  useEffect(() => {
    if (typeof requestAnimationFrame === 'undefined') return;
    const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const localStart = clock();
    let raf = 0;
    const tick = () => {
      const f = Math.min(1, Math.max(0, 1 - (clock() - localStart) / duration));
      setFraction(f);
      if (f > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Re-run (restart the countdown) whenever a new turn arrives.
  }, [startedAt, endsAt, duration]);

  const stroke = ringColor(fraction) === 'green' ? '#10b981' : '#f59e0b';

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {/* gray track = full perimeter (the elapsed part shows through here) */}
      <rect x="2.5" y="2.5" width="95" height="95" fill="none" stroke="#cbd5e1" strokeWidth="5" />
      {/* colored arc = remaining time, depleting */}
      <rect
        x="2.5"
        y="2.5"
        width="95"
        height="95"
        pathLength={100}
        fill="none"
        stroke={stroke}
        strokeWidth="5"
        strokeDasharray={`${fraction * 100} 100`}
        strokeLinecap="butt"
      />
    </svg>
  );
}
