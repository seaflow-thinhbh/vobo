'use client';

import { useEffect, useRef, useState } from 'react';
import type { InteractionEvent } from '@/lib/types';
import { INTERACTIONS, playInteractionSound } from '@/lib/interactions';
import { registerGsap, gsap } from '@/lib/motion';

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

  useEffect(() => {
    playInteractionSound(def?.sound ?? 'pop');
    const el = ref.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      if (isTarget) {
        // Effect on target: pop in + shake
        gsap.fromTo(el, { scale: 0, opacity: 0 }, {
          scale: 1.2, opacity: 1, duration: 0.2, ease: 'back.out(2)',
          onComplete: () => {
            gsap.to(el, { scale: 1, duration: 0.1 });
            gsap.to(el, { x: -4, duration: 0.05, repeat: 3, yoyo: true, ease: 'power1.inOut' });
          },
        });
      } else {
        // Fly from somewhere
        gsap.fromTo(el, { scale: 0.5, opacity: 0, y: -20 }, {
          scale: 1, opacity: 1, y: 0, duration: 0.3, ease: 'power2.out',
        });
      }
    }, ref);

    const timer = setTimeout(() => {
      gsap.to(el, { opacity: 0, scale: 0.5, y: -30, duration: 0.3, onComplete: () => setVisible(false) });
    }, 1800);

    return () => {
      clearTimeout(timer);
      ctx.revert();
    };
  }, [event, isTarget, def]);

  if (!visible || !def) return null;

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-[90] flex flex-col items-center gap-0.5"
      style={{ top: '40%', left: '50%', transform: 'translate(-50%, -50%)' }}
    >
      <span className="text-3xl">{def.icon}</span>
      {def.isText && def.text && (
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-yellow-400">
          {def.text}
        </span>
      )}
      {!isTarget && (
        <span className="text-xs text-slate-400">
          từ {event.fromName}
          {event.targetId === '*' ? ' -> tất cả' : ''}
        </span>
      )}
    </div>
  );
}
