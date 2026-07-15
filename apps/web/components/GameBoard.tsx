'use client';

import { useRef, useState } from 'react';
import type { BingoView } from '@/lib/types';
import { lettersEarned, getBingoLetters, completedLineCells } from '@/lib/bingo';
import { usePrevious } from '@/lib/usePrevious';
import { registerGsap, prefersReducedMotion, gsap, useGSAP } from '@/lib/motion';

registerGsap();

export function GameBoard({
  view,
  isYourTurn = false,
  onCall = () => {},
  onPlaceBomb = () => {},
  bombExploding = false,
}: {
  view: BingoView;
  isYourTurn?: boolean;
  onCall?: (n: number) => void;
  onPlaceBomb?: (n: number) => void;
  bombExploding?: boolean;
}) {
  const gs = view.gridSize || 5;
  const letters = lettersEarned(view.you.completedLines, gs);
  const bingoLetters = getBingoLetters(gs);
  const completed = completedLineCells(view.you.marked, gs);
  const container = useRef<HTMLDivElement>(null);
  const [placingBomb, setPlacingBomb] = useState(false);

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
  const hasBomb = view.you.bombNumber !== null;

  return (
    <div ref={container} className="mx-auto w-full max-w-md">
      <div className="mb-2 flex justify-center gap-2 text-lg md:text-xl">
        {bingoLetters.map((L, i) => (
          <span key={`${L}-${i}`} className={letters[i] ? 'font-bold text-emerald-500' : 'text-slate-600'}>
            {L}
          </span>
        ))}
      </div>

      {/* Bomb button row - outside grid to preserve layout */}
      {!hasBomb && !bombExploding && (
        <div className="mb-1 flex justify-end">
          <button
            type="button"
            onClick={() => setPlacingBomb(!placingBomb)}
            onDragStart={(e) => { e.dataTransfer.setData('text/plain', 'bomb'); }}
            draggable
            className={`rounded border px-2 py-1 text-lg transition ${
              placingBomb
                ? 'border-yellow-400 bg-yellow-400/20 scale-110'
                : 'border-slate-600 bg-slate-800 hover:border-slate-500'
            }`}
            title={placingBomb ? 'Bấm vào ô để đặt bomb' : 'Bấm để đặt bomb (hoặc kéo thả)'}
          >
            💣 {placingBomb ? 'Chọn ô...' : 'Đặt bomb'}
          </button>
        </div>
      )}

      <div className={`grid gap-1 ${gridColsClass}`}>
        {view.you.card.map((n, idx) => {
          const marked = view.you.marked[idx] === true;
          const inLine = completed.has(idx);
          const callable = isYourTurn && !marked && !bombExploding;
          const isBombCell = view.you.bombNumber === n;
          const canPlaceBomb = placingBomb && !marked && !hasBomb;

          return (
            <button
              key={idx}
              type="button"
              data-idx={idx}
              data-marked={marked ? 'true' : 'false'}
              data-line={inLine ? 'true' : 'false'}
              disabled={!callable && !canPlaceBomb}
              onClick={() => {
                if (canPlaceBomb && onPlaceBomb) {
                  onPlaceBomb(n);
                  setPlacingBomb(false);
                } else if (callable) {
                  onCall(n);
                }
              }}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (!hasBomb && !marked) { onPlaceBomb(n); setPlacingBomb(false); }
              }}
              className={`flex aspect-square items-center justify-center rounded border font-medium relative ${
                gs >= 6 ? 'text-base' : 'text-lg'
              } ${
                canPlaceBomb
                  ? 'border-yellow-400 bg-yellow-400/10 text-yellow-300 cursor-pointer ring-1 ring-yellow-400'
                  : inLine
                    ? 'border-emerald-500 bg-emerald-500 font-bold text-white'
                    : marked
                      ? 'border-amber-300 bg-amber-300 font-bold text-slate-900'
                      : callable
                      ? 'border-sky-500 text-sky-300'
                      : 'border-slate-600 text-slate-300'
              }`}
            >
              {n}
              {isBombCell && (
                <span className="absolute -right-1 -top-1 text-xs">💣</span>
              )}
            </button>
          );
        })}
      </div>
      {placingBomb && (
        <p className="mt-1 text-center text-xs text-yellow-400">Bấm vào ô chưa gọi để đặt bomb</p>
      )}
    </div>
  );
}
