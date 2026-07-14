'use client';

import { useRef } from 'react';
import confetti from 'canvas-confetti';
import type { RoomSnapshot } from '@/lib/types';
import { registerGsap, prefersReducedMotion, gsap, useGSAP } from '@/lib/motion';
import { Leaderboard } from './Leaderboard';

registerGsap();

const CELEBRATION = ['B', 'I', 'N', 'G', 'O'] as const;

/** Overlay shown over the dimmed finished board: a winner celebration or a loser
 *  effect, plus "Chơi lại" / "Thoát phòng" buttons available to every player. */
export function ResultOverlay({
  snapshot,
  onPlayAgain,
  onLeave,
}: {
  snapshot: RoomSnapshot;
  onPlayAgain: () => void;
  onLeave: () => void;
}) {
  const winnerId = snapshot.view?.winners[0];
  const youWon = winnerId === snapshot.youId;
  const winnerName = snapshot.roster.find((r) => r.id === winnerId)?.name ?? '?';
  const youVoted = snapshot.replayVotes?.includes(snapshot.youId) ?? false;
  const votedCount = snapshot.replayVotes?.length ?? 0;
  const totalHumans = snapshot.roster.filter((r) => !r.isBot).length;
  const container = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (youWon) {
        const tl = gsap.timeline();
        tl.from('[data-celebrate="letter"]', {
          y: -16,
          scale: 0.4,
          opacity: 0,
          stagger: 0.08,
          duration: 0.4,
          ease: 'back.out(2)',
        });
        tl.from(
          '[data-celebrate="banner"]',
          { y: 20, scale: 0.8, opacity: 0, duration: 0.5, ease: 'back.out(1.7)' },
          '-=0.2',
        );
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.3 } });
        gsap.delayedCall(0.25, () =>
          confetti({ particleCount: 50, spread: 100, origin: { y: 0.35 } }),
        );
      } else {
        const tl = gsap.timeline();
        tl.from('[data-lose="icon"]', { y: -40, opacity: 0, duration: 0.45, ease: 'bounce.out' });
        tl.to('[data-lose="icon"]', {
          x: -6,
          duration: 0.06,
          repeat: 5,
          yoyo: true,
          ease: 'power1.inOut',
        });
        tl.from('[data-lose="text"]', { opacity: 0, y: 10, duration: 0.3 }, '-=0.1');
      }
    },
    { scope: container },
  );

  return (
    <div
      ref={container}
      data-result={youWon ? 'win' : 'lose'}
      className={`absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl text-center ${
        youWon ? 'bg-white/85' : 'bg-slate-800/85 text-white'
      }`}
    >
      {youWon ? (
        <>
          <div className="flex justify-center gap-2 text-3xl font-extrabold text-emerald-500">
            {CELEBRATION.map((L) => (
              <span key={L} data-celebrate="letter">
                {L}
              </span>
            ))}
          </div>
          <h2 data-celebrate="banner" className="text-2xl font-bold">
            🎉 Bạn thắng!
          </h2>
        </>
      ) : (
        <>
          <div data-lose="icon" className="text-5xl">
            😔
          </div>
          <div data-lose="text">
            <h2 className="text-2xl font-bold">{winnerName} thắng!</h2>
            <p className="mt-1 text-sm text-slate-300">Chúc may mắn lần sau</p>
          </div>
        </>
      )}
      <div className="w-56 max-w-full">
        <Leaderboard roster={snapshot.roster} />
      </div>
      <div className="mt-2 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onPlayAgain}
          disabled={youVoted}
          className={`rounded px-4 py-2 font-medium ${
            youVoted
              ? 'cursor-not-allowed bg-emerald-100 text-emerald-700'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {youVoted ? 'Đã sẵn sàng ✓' : 'Chơi lại'}
        </button>
        <p className="text-xs text-slate-500">
          {votedCount}/{totalHumans} người đã sẵn sàng
        </p>
        <div className="flex flex-wrap justify-center gap-1">
          {snapshot.roster.filter((r) => !r.isBot).map((r) => (
            <span
              key={r.id}
              className={`rounded px-1.5 py-0.5 text-xs ${
                snapshot.replayVotes?.includes(r.id)
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {r.name} {snapshot.replayVotes?.includes(r.id) ? '✓' : '…'}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={onLeave}
          className={`rounded px-4 py-2 font-medium ${
            youWon ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-900'
          }`}
        >
          Thoát phòng
        </button>
      </div>
    </div>
  );
}
