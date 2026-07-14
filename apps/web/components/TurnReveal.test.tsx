import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TurnReveal } from './TurnReveal';
import type { RosterEntry } from '@/lib/types';

const players: RosterEntry[] = [
  { id: 'a', name: 'An', isBot: false, connected: true },
  { id: 'b', name: 'Bình', isBot: false, connected: true },
];

describe('TurnReveal', () => {
  it('shows all players and announces who goes first', () => {
    render(<TurnReveal players={players} firstPlayerId="b" />);
    expect(screen.getByText('An')).toBeInTheDocument();
    expect(screen.getByText(/Đi đầu:/)).toBeInTheDocument();
    expect(screen.getByText('Bình')).toBeInTheDocument();
  });
});
