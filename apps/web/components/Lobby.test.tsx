import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Lobby } from './Lobby';
import type { RoomSnapshot } from '@/lib/types';

function lobbySnap(rosterLen: number): RoomSnapshot {
  return {
    code: 'K7QX9P',
    status: 'lobby',
    hostId: 'you',
    youId: 'you',
    roster: Array.from({ length: rosterLen }, (_, i) => ({
      id: i === 0 ? 'you' : `p${i}`,
      name: i === 0 ? 'An' : `P${i}`,
      isBot: false,
      connected: true,
    })),
    view: null,
    turnStartedAt: null,
    turnEndsAt: null,
    turnMs: 20000,
    rolling: false,
  };
}

describe('Lobby', () => {
  it('shows the room code and roster, and lets the host start with >= 2 players', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Lobby snapshot={lobbySnap(2)} isHost onAddBot={() => {}} onStart={onStart} />);
    expect(screen.getByText('K7QX9P')).toBeInTheDocument();
    // scope to the roster list — the name also appears in the leaderboard below
    expect(within(container.querySelector('ul')!).getByText('An')).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'Bắt đầu' });
    expect(start).toBeEnabled();
    await user.click(start);
    expect(onStart).toHaveBeenCalled();
  });

  it('disables start with fewer than 2 players', () => {
    render(<Lobby snapshot={lobbySnap(1)} isHost onAddBot={() => {}} onStart={() => {}} />);
    expect(screen.getByRole('button', { name: 'Bắt đầu' })).toBeDisabled();
  });

  it('shows a win leaderboard ranked by wins', () => {
    const snap = lobbySnap(2);
    snap.roster[0]!.wins = 1;
    snap.roster[1]!.wins = 4;
    const { container } = render(<Lobby snapshot={snap} isHost onAddBot={() => {}} onStart={() => {}} />);
    const board = container.querySelector('[data-leaderboard]');
    expect(board).toBeTruthy();
    const rows = [...container.querySelectorAll('[data-leaderboard] [data-player]')];
    expect(rows[0]!.getAttribute('data-player')).toBe(snap.roster[1]!.id); // 4 wins first
  });
});
