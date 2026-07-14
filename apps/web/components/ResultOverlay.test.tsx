import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import confetti from 'canvas-confetti';
import { ResultOverlay } from './ResultOverlay';
import type { RoomSnapshot } from '@/lib/types';

function snapshot(winnerId: string, youId: string): RoomSnapshot {
  return {
    code: 'ABCD',
    youId,
    hostId: 'you',
    status: 'finished',
    roster: [
      { id: 'you', name: 'Tôi', isBot: false, connected: true, wins: 2 },
      { id: 'p2', name: 'Lan', isBot: false, connected: true, wins: 1 },
    ],
    turnMs: 20000,
    rolling: false,
    view: {
      phase: 'finished',
      you: { id: youId, card: [], marked: [], completedLines: 5, ready: true },
      opponents: [],
      calledNumbers: [],
      currentPlayerId: youId,
      winners: [winnerId],
    },
  } as unknown as RoomSnapshot;
}

describe('ResultOverlay', () => {
  beforeEach(() => vi.mocked(confetti).mockClear());

  function withMotionAllowed(fn: () => void): void {
    const original = window.matchMedia;
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
    try {
      fn();
    } finally {
      window.matchMedia = original;
    }
  }

  it('winner branch: celebrates and fires confetti when motion is allowed', () => {
    withMotionAllowed(() => {
      render(<ResultOverlay snapshot={snapshot('you', 'you')} onPlayAgain={() => {}} onLeave={() => {}} />);
      expect(document.querySelector('[data-result="win"]')).toBeTruthy();
      expect(screen.getByText('🎉 Bạn thắng!')).toBeInTheDocument();
      expect(vi.mocked(confetti)).toHaveBeenCalled();
    });
  });

  it('loser branch: shows the winner name and fires no confetti (even with motion on)', () => {
    // Assert on the motion-enabled path: a regression that moved confetti out of the
    // winner-only branch would fire here, so reduced motion must not mask it.
    withMotionAllowed(() => {
      render(<ResultOverlay snapshot={snapshot('p2', 'you')} onPlayAgain={() => {}} onLeave={() => {}} />);
      expect(document.querySelector('[data-result="lose"]')).toBeTruthy();
      expect(screen.getByText('Lan thắng!')).toBeInTheDocument();
      expect(vi.mocked(confetti)).not.toHaveBeenCalled();
    });
  });

  it('shows Chơi lại + Thoát phòng for everyone and wires the callbacks', async () => {
    const onPlayAgain = vi.fn();
    const onLeave = vi.fn();
    const user = userEvent.setup();
    render(<ResultOverlay snapshot={snapshot('p2', 'you')} onPlayAgain={onPlayAgain} onLeave={onLeave} />);
    await user.click(screen.getByRole('button', { name: 'Chơi lại' }));
    await user.click(screen.getByRole('button', { name: 'Thoát phòng' }));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('shows the win leaderboard', () => {
    const { container } = render(
      <ResultOverlay snapshot={snapshot('you', 'you')} onPlayAgain={() => {}} onLeave={() => {}} />,
    );
    const rows = [...container.querySelectorAll('[data-leaderboard] [data-player]')];
    expect(rows.map((r) => r.getAttribute('data-player'))).toEqual(['you', 'p2']); // 2 then 1
  });
});
