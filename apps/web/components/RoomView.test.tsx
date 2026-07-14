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
  newGame: noop,
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
      turnMs: 20000,
      rolling: false,
    };
    render(<RoomView snapshot={snap} actions={actions} />);
    expect(screen.getByText('K7QX9P')).toBeInTheDocument();
  });

  it('renders the player carousel and board while playing', () => {
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
      turnMs: 20000,
      rolling: false,
    };
    render(<RoomView snapshot={snap} actions={actions} />);
    expect(screen.getByText(/Bình/)).toBeInTheDocument(); // carousel tile
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument(); // board cell
  });

  it('renders the result overlay over the board when finished (buttons for non-host too)', () => {
    const snap: RoomSnapshot = {
      code: 'K7QX9P',
      status: 'finished',
      hostId: 'other', // you are NOT the host -> proves no host gating
      youId: 'you',
      roster: [
        { id: 'you', name: 'An', isBot: false, connected: true },
        { id: 'b', name: 'Bình', isBot: false, connected: true },
      ],
      view: {
        phase: 'finished',
        you: { id: 'you', card: ordered, marked: ordered.map(() => false), completedLines: 0, ready: true },
        opponents: [{ id: 'b', name: 'Bình', isBot: false, completedLines: 0, connected: true, ready: true }],
        calledNumbers: [],
        currentPlayerId: 'you',
        winners: ['b'], // Bình won -> you see the loser overlay
      },
      turnStartedAt: null,
      turnEndsAt: null,
      turnMs: 20000,
      rolling: false,
    };
    render(<RoomView snapshot={snap} actions={actions} />);
    expect(document.querySelector('[data-result="lose"]')).toBeTruthy(); // overlay present
    expect(screen.getByRole('button', { name: 'Chơi lại' })).toBeInTheDocument(); // for all, host is 'other'
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument(); // board underneath
  });
});
