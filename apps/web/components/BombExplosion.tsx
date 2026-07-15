'use client';

import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { registerGsap, prefersReducedMotion, gsap } from '@/lib/motion';

registerGsap();

export function BombExplosion({
  callerName,
  number,
  onDone,
}: {
  callerName: string;
  number: number;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<'appear' | 'explode' | 'done'>('appear');

  useEffect(() => {
    if (prefersReducedMotion()) {
      setTimeout(() => { setPhase('done'); onDone(); }, 1000);
      return;
    }

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 60; osc.type = 'sawtooth';
      gain.gain.value = 0.15;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
      setTimeout(() => ctx.close(), 600);
    } catch { /* no audio */ }

    const ctx = gsap.context(() => {
      const el = ref.current;
      if (!el) return;

      // Phase 1: bomb appears
      gsap.fromTo(el, { scale: 0, opacity: 0 }, {
        scale: 1.2, opacity: 1, duration: 0.3, ease: 'back.out(2)',
        onComplete: () => {
          setPhase('explode');
          // Phase 2: shake + expand
          gsap.to(el, { scale: 2, opacity: 0.8, duration: 0.15, yoyo: true, repeat: 1 });
          gsap.to(el, { x: -15, duration: 0.05, repeat: 9, yoyo: true, ease: 'power1.inOut',
            onComplete: () => { gsap.set(el, { x: 0, scale: 0 }); } });

          confetti({
            particleCount: 50,
            spread: 100,
            origin: { x: 0.5, y: 0.5 },
            colors: ['#ef4444', '#f97316', '#fbbf24', '#000000'],
            decay: 0.85,
            scalar: 2,
          });

          setTimeout(() => { setPhase('done'); onDone(); }, 1000);
        },
      });
    }, ref);

    return () => ctx.revert();
  }, [onDone]);

  if (phase === 'done') return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center">
      <div
        ref={ref}
        className="flex flex-col items-center gap-2"
      >
        <span className="text-6xl">💣</span>
        <span className="rounded-full bg-red-900/90 px-4 py-1 text-lg font-bold text-yellow-400 shadow-lg">
          {callerName} dính bomb số {number}!
        </span>
      </div>
    </div>
  );
}
