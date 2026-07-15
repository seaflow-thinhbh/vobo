'use client';

import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import type { InteractionEvent } from '@/lib/types';
import { INTERACTIONS, playInteractionSound } from '@/lib/interactions';
import { registerGsap, prefersReducedMotion, gsap } from '@/lib/motion';

registerGsap();

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

    // Explosive confetti burst
    const origin = { x: Math.random() * 0.6 + 0.2, y: Math.random() * 0.4 + 0.3 };
    confetti({
      particleCount: isTarget ? 60 : 20,
      spread: isTarget ? 80 : 40,
      origin,
      colors: isTarget ? ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7'] : ['#94a3b8'],
      decay: 0.9,
    });

    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      if (isTarget) {
        gsap.fromTo(el, { scale: 0, opacity: 0 }, {
          scale: 1.4, opacity: 1, duration: 0.25, ease: 'back.out(3)',
          onComplete: () => {
            gsap.to(el, { scale: 1, duration: 0.1 });
            // Vibrate effect for target
            gsap.to(el, {
              x: -8, duration: 0.04, repeat: 7, yoyo: true, ease: 'power1.inOut',
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
    }, 2000);

    return () => {
      clearTimeout(timer);
      ctx.revert();
    };
  }, [event, isTarget, isFromSelf, def, onDone, youId]);

  if (!visible || !def) return null;

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-[90] flex flex-col items-center gap-1"
      style={{
        top: isTarget ? '30%' : '15%',
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
  );
}
