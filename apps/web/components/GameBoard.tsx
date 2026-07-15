'use client';

import { useRef } from 'react';
import type { BingoView } from '@/lib/types';
import { lettersEarned, getBingoLetters, completedLineCells } from '@/lib/bingo';
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
  const gs = view.gridSize || 5;
  const letters = lettersEarned(view.you.completedLines, gs);
  const bingoLetters = getBingoLetters(gs);
  const completed = completedLineCells(view.you.marked, gs);
  const container = useRef<HTMLDivElement>(null);

  const prevMarked = usePrevious(view.you.marked);
  const prevCompleted = usePrevious(completed);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const root = container.current;
      if (!root) return;

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

  const gridColsClass = gs === 5 ? 'grid-cols-5' : gs === 6 ? 'grid-cols-6' : 'grid-cols-7';

  return (
    <div ref={container} className="mx-auto w-full max-w-md">
      <div className="mb-2 flex justify-center gap-2 text-lg md:text-xl">
        {bingoLetters.map((L, i) => (
          <span key={`${L}-${i}`} className={letters[i] ? 'font-bold text-emerald-500' : 'text-slate-600'}>
            {L}
          </span>
        ))}
      </div>
      <div className={`grid gap-1 ${gridColsClass}`}>
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
              className={`flex aspect-square items-center justify-center rounded border font-medium ${
                gs >= 6 ? 'text-base' : 'text-lg'
              } ${
                inLine
                  ? 'border-emerald-500 bg-emerald-500 font-bold text-white'
                  : marked
                    ? 'border-amber-300 bg-amber-300 font-bold text-slate-900'
                    : callable
                    ? 'border-sky-500 text-sky-300'
                    : 'border-slate-600 text-slate-300'
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
