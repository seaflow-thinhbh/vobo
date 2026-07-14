import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomView, type RoomActions } from './RoomView';
import type { RoomSnapshot } from '@/lib/types';

const noop = async () => {};
const actions: RoomActions = {
  addBot: noop,
  start: noop,
  fillCard: noop,
  ready: noop,
  call: noop,
  leave: noop,
};

const ordered = Array.from({ length: 25 }, (_, i) => i + 1);

describe('RoomView', () => {
  it('renders the Lobby in lobby status', () => {
    const snap: RoomSnapshot = {
      code: 'K7QX9P',
      status: 'lobby',
      hostId: 'you',
      youId: 'you',
      roster: [{ id: 'you', name: 'An', isBot: false, connected: true }],
      view: null,
      turnStartedAt: null,
      turnEndsAt: null,
    };
    render(<RoomView snapshot={snap} actions={actions} />);
    expect(screen.getByText('K7QX9P')).toBeInTheDocument();
  });

  it('renders the game board and call panel while playing', () => {
    const snap: RoomSnapshot = {
      code: 'K7QX9P',
      status: 'playing',
      hostId: 'you',
      youId: 'you',
      roster: [
        { id: 'you', name: 'An', isBot: false, connected: true },
        { id: 'b', name: 'Bình', isBot: false, connected: true },
      ],
      view: {
        phase: 'playing',
        you: { id: 'you', card: ordered, marked: ordered.map(() => false), completedLines: 0, ready: true },
        opponents: [{ id: 'b', name: 'Bình', isBot: false, completedLines: 0, connected: true, ready: true }],
        calledNumbers: [],
        currentPlayerId: 'you',
        winners: [],
      },
      turnStartedAt: null,
      turnEndsAt: null,
    };
    render(<RoomView snapshot={snap} actions={actions} />);
    expect(screen.getByText('Lượt của bạn')).toBeInTheDocument();
    expect(screen.getByText('Chọn số để hô:')).toBeInTheDocument();
    expect(screen.getByText('Bình')).toBeInTheDocument();
  });
});
