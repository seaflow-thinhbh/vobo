import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Lobby } from './Lobby';
import { FinishedPanel } from './FinishedPanel';
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
    render(<Lobby snapshot={lobbySnap(2)} isHost onAddBot={() => {}} onStart={onStart} />);
    expect(screen.getByText('K7QX9P')).toBeInTheDocument();
    expect(screen.getByText('An')).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'Bắt đầu' });
    expect(start).toBeEnabled();
    await user.click(start);
    expect(onStart).toHaveBeenCalled();
  });

  it('disables start with fewer than 2 players', () => {
    render(<Lobby snapshot={lobbySnap(1)} isHost onAddBot={() => {}} onStart={() => {}} />);
    expect(screen.getByRole('button', { name: 'Bắt đầu' })).toBeDisabled();
  });
});

describe('FinishedPanel', () => {
  const snap: RoomSnapshot = {
    code: 'K7QX9P',
    status: 'finished',
    hostId: 'you',
    youId: 'you',
    roster: [{ id: 'you', name: 'An', isBot: false, connected: true }],
    view: {
      phase: 'finished',
      you: { id: 'you', card: [], marked: [], completedLines: 5, ready: true },
      opponents: [],
      calledNumbers: [],
      currentPlayerId: null,
      winners: ['you'],
    },
    turnStartedAt: null,
    turnEndsAt: null,
    turnMs: 20000,
    rolling: false,
  };

  it('announces the winner and lets the host start a new game', async () => {
    const onNewGame = vi.fn();
    const user = userEvent.setup();
    render(<FinishedPanel snapshot={snap} isHost onNewGame={onNewGame} onLeave={() => {}} />);
    expect(screen.getByText('🎉 Bạn thắng!')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ván mới' }));
    expect(onNewGame).toHaveBeenCalled();
  });

  it('non-host sees a waiting message instead of the new-game button', () => {
    render(<FinishedPanel snapshot={snap} isHost={false} onNewGame={() => {}} onLeave={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Ván mới' })).toBeNull();
    expect(screen.getByText(/Chờ chủ phòng/)).toBeInTheDocument();
  });
});
