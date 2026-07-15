'use client';

import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import type { InteractionEvent } from '@/lib/types';
import { INTERACTIONS, playInteractionSound } from '@/lib/interactions';
import { registerGsap, prefersReducedMotion, gsap } from '@/lib/motion';

registerGsap();

const CONFETTI_COLORS: Record<string, string[]> = {
  tomato: ['#ef4444', '#dc2626', '#fca5a5', '#fecaca'],
  flower: ['#f472b6', '#ec4899', '#fbbf24', '#fb923c', '#a855f7'],
  brick: ['#78716c', '#57534e', '#a8a29e'],
  smoke: ['#94a3b8', '#cbd5e1', '#64748b'],
  shit: ['#8b6914', '#a16207', '#5c3d06', '#78350f'],
  clap: ['#fbbf24', '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#a855f7'],
};

export function InteractionEffect({
  event,
  youId,
  onDone,
}: {
  event: InteractionEvent;
  youId: string;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const def = INTERACTIONS.find((d) => d.type === event.type);
  const isTarget = event.targetId === youId || event.targetId === '*';
  const isFromSelf = event.fromId === youId;

  useEffect(() => {
    playInteractionSound(def?.sound ?? 'pop');

    if (prefersReducedMotion()) {
      setTimeout(() => { setVisible(false); onDone(); }, 1500);
      return;
    }

    const colors = CONFETTI_COLORS[event.type] || ['#94a3b8'];
    const origin = { x: Math.random() * 0.6 + 0.2, y: Math.random() * 0.4 + 0.2 };

    // Type-specific effects
    switch (event.type) {
      case 'tomato':
        confetti({ particleCount: 40, spread: 50, origin, colors, decay: 0.85, scalar: 2 });
        break;
      case 'brick':
        // Screen shake + crack effect via overlay
        gsap.to(overlayRef.current, {
          opacity: 0.6, duration: 0.1,
          onComplete: () => gsap.to(overlayRef.current, { opacity: 0, duration: 0.4 }),
        });
        confetti({ particleCount: 30, spread: 70, origin, colors, decay: 0.8, scalar: 1.5, shapes: ['square'] });
        break;
      case 'flower':
        confetti({ particleCount: 30, spread: 80, origin, colors, decay: 0.9, scalar: 1.2, shapes: ['circle'] });
        confetti({ particleCount: 30, spread: 80, origin: { ...origin, y: origin.y - 0.1 }, colors, decay: 0.9, scalar: 0.8 });
        break;
      case 'smoke':
        confetti({ particleCount: 25, spread: 60, origin, colors, decay: 0.95, scalar: 3, shapes: ['circle'] });
        break;
      case 'shit':
        confetti({ particleCount: 20, spread: 40, origin, colors, decay: 0.9, scalar: 4, shapes: ['circle'] });
        break;
      case 'clap':
        confetti({ particleCount: 80, spread: 100, origin, colors, decay: 0.85 });
        confetti({ particleCount: 40, spread: 120, origin: { ...origin, y: origin.y + 0.1 }, colors, decay: 0.9 });
        break;
      default:
        confetti({ particleCount: isTarget ? 40 : 15, spread: isTarget ? 70 : 30, origin, colors });
    }

    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      if (isTarget) {
        gsap.fromTo(el, { scale: 0, opacity: 0 }, {
          scale: 1.4, opacity: 1, duration: 0.25, ease: 'back.out(3)',
          onComplete: () => {
            gsap.to(el, { scale: 1, duration: 0.1 });
            gsap.to(el, {
              x: event.type === 'brick' ? -12 : -6, duration: 0.04,
              repeat: event.type === 'brick' ? 11 : 5, yoyo: true, ease: 'power1.inOut',
              onComplete: () => { gsap.set(el, { x: 0 }); },
            });
          },
        });
      } else if (!isFromSelf) {
        gsap.fromTo(el, { scale: 0.4, opacity: 0, y: -30 }, {
          scale: 1, opacity: 0.9, y: 0, duration: 0.4, ease: 'power2.out',
        });
      }
    }, ref);

    const timer = setTimeout(() => {
      gsap.to(el, { opacity: 0, scale: 0.3, y: -40, duration: 0.35, onComplete: () => { setVisible(false); onDone(); } });
    }, 2200);

    return () => {
      clearTimeout(timer);
      ctx.revert();
    };
  }, [event, isTarget, isFromSelf, def, onDone, youId]);

  if (!visible || !def) return null;

  return (
    <>
      {/* Screen crack overlay for brick */}
      <div
        ref={overlayRef}
        className="pointer-events-none fixed inset-0 z-[88]"
        style={{
          background: 'radial-gradient(circle at center, rgba(120,113,108,0.5) 0%, transparent 70%)',
          opacity: 0,
        }}
      />

      <div
        ref={ref}
        className="pointer-events-none fixed z-[90] flex flex-col items-center gap-1"
        style={{
          top: isTarget ? '35%' : '20%',
          left: `${20 + Math.random() * 60}%`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <span className={`${isTarget ? 'text-5xl drop-shadow-lg' : 'text-2xl opacity-70'}`}>
          {def.icon}
        </span>
        {def.isText && def.text && (
          <span className="whitespace-nowrap rounded-full bg-slate-900/90 px-3 py-1 text-sm font-bold text-yellow-400 shadow-lg">
            {def.text}
          </span>
        )}
        {!isFromSelf && !isTarget && (
          <span className="text-xs text-slate-400">
            {event.fromName} {event.targetId === '*' ? '→ all' : ''}
          </span>
        )}
      </div>
    </>
  );
}
