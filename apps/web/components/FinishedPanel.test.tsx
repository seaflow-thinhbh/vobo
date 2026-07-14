import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import confetti from 'canvas-confetti';
import { FinishedPanel } from './FinishedPanel';
import type { RoomSnapshot } from '@/lib/types';

function snapshot(): RoomSnapshot {
  return {
    code: 'ABCD',
    youId: 'you',
    hostId: 'you',
    status: 'finished',
    roster: [
      { id: 'you', name: 'Tôi', isBot: false, connected: true },
      { id: 'p2', name: 'Lan', isBot: false, connected: true },
    ],
    turnMs: 20000,
    rolling: false,
    view: {
      phase: 'finished',
      you: { id: 'you', card: [], marked: [], completedLines: 5, ready: true },
      opponents: [],
      calledNumbers: [],
      currentPlayerId: 'you',
      winners: ['you'],
    },
  } as unknown as RoomSnapshot;
}

describe('FinishedPanel', () => {
  beforeEach(() => {
    vi.mocked(confetti).mockClear();
  });

  it('announces the winner and renders the B-I-N-G-O celebration letters', () => {
    render(<FinishedPanel snapshot={snapshot()} isHost onLeave={() => {}} />);
    expect(screen.getByText('🎉 Bạn thắng!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ván mới' })).toBeInTheDocument();
    const letters = document.querySelectorAll('[data-celebrate="letter"]');
    expect(letters).toHaveLength(5);
  });

  it('does not fire confetti under reduced motion (jsdom default)', () => {
    render(<FinishedPanel snapshot={snapshot()} isHost onLeave={() => {}} />);
    expect(vi.mocked(confetti)).not.toHaveBeenCalled();
  });

  it('fires confetti when motion is allowed', () => {
    const original = window.matchMedia;
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;

    render(<FinishedPanel snapshot={snapshot()} isHost onLeave={() => {}} />);
    expect(vi.mocked(confetti)).toHaveBeenCalled();

    window.matchMedia = original;
  });
});
