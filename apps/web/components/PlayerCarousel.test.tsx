import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerCarousel } from './PlayerCarousel';
import type { RosterEntry } from '@/lib/types';

function players(n: number): RosterEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    isBot: false,
    connected: true,
  }));
}

describe('PlayerCarousel', () => {
  it('shows all players when there are 3 or fewer', () => {
    render(
      <PlayerCarousel players={players(3)} currentPlayerId="p1" youId="p0" turnStartedAt={null} turnEndsAt={null} />,
    );
    expect(screen.getByText(/P0/)).toBeInTheDocument();
    expect(screen.getByText(/P1/)).toBeInTheDocument();
    expect(screen.getByText(/P2/)).toBeInTheDocument();
  });

  it('renders every player and marks the current one (which the track centres)', () => {
    const { container } = render(
      <PlayerCarousel players={players(5)} currentPlayerId="p2" youId="p0" turnStartedAt={null} turnEndsAt={null} />,
    );
    expect(container.querySelectorAll('[data-player]')).toHaveLength(5);
    const current = container.querySelector('[data-current="true"]')!;
    expect(current.getAttribute('data-player')).toBe('p2');
  });

  it('marks "(bạn)" on your own tile', () => {
    render(
      <PlayerCarousel players={players(2)} currentPlayerId="p0" youId="p0" turnStartedAt={null} turnEndsAt={null} />,
    );
    expect(screen.getByText(/\(bạn\)/)).toBeInTheDocument();
  });
});
