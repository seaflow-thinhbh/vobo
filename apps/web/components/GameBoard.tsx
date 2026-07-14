'use client';

import { useRef } from 'react';
import type { BingoView } from '@/lib/types';
import { lettersEarned, BINGO_LETTERS, completedLineCells } from '@/lib/bingo';
import { usePrevious } from '@/lib/usePrevious';
import { registerGsap, prefersReducedMotion, gsap, useGSAP } from '@/lib/motion';

registerGsap();

export function GameBoard({
  view,
  isYourTurn = false,
  onCall = () => {},
}: {
  view: BingoView;
  isYourTurn?: boolean;
  onCall?: (n: number) => void;
}) {
  const letters = lettersEarned(view.you.completedLines);
  const completed = completedLineCells(view.you.marked);
  const container = useRef<HTMLDivElement>(null);

  const prevMarked = usePrevious(view.you.marked);
  const prevCompleted = usePrevious(completed);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const root = container.current;
      if (!root) return;

      // Newly-marked cells → scale-bounce.
      if (prevMarked) {
        view.you.marked.forEach((m, i) => {
          if (m && !prevMarked[i]) {
            const el = root.querySelector(`[data-idx="${i}"]`);
            if (el) {
              gsap.fromTo(el, { scale: 0.7 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' });
            }
          }
        });
      }

      // Newly-completed line cells → staggered flash cascade.
      if (prevCompleted) {
        const fresh = [...completed]
          .filter((i) => !prevCompleted.has(i))
          .sort((a, b) => a - b);
        const els = fresh
          .map((i) => root.querySelector(`[data-idx="${i}"]`))
          .filter((e): e is Element => e != null);
        if (els.length > 0) {
          gsap.fromTo(
            els,
            { scale: 0.6 },
            { scale: 1, duration: 0.4, stagger: 0.06, ease: 'back.out(2)' },
          );
        }
      }
    },
    { dependencies: [view.you.marked], scope: container },
  );

  return (
    <div ref={container} className="mx-auto w-full max-w-md">
      <div className="mb-2 flex justify-center gap-3 text-xl">
        {BINGO_LETTERS.map((L, i) => (
          <span key={L} className={letters[i] ? 'font-bold text-emerald-600' : 'text-slate-300'}>
            {L}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {view.you.card.map((n, idx) => {
          const marked = view.you.marked[idx] === true;
          const inLine = completed.has(idx);
          const callable = isYourTurn && !marked;
          return (
            <button
              key={idx}
              type="button"
              data-idx={idx}
              data-marked={marked ? 'true' : 'false'}
              data-line={inLine ? 'true' : 'false'}
              disabled={!callable}
              onClick={() => callable && onCall(n)}
              className={`flex aspect-square items-center justify-center rounded border text-lg font-medium ${
                inLine
                  ? 'border-emerald-500 bg-emerald-500 font-bold text-white'
                  : marked
                    ? 'border-amber-300 bg-amber-300 font-bold text-slate-900'
                    : callable
                      ? 'border-sky-500 text-sky-700'
                      : 'border-slate-300 text-slate-700'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
