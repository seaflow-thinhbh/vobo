import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Leaderboard } from './Leaderboard';
import type { RosterEntry } from '@/lib/types';

describe('Leaderboard', () => {
  it('ranks players by wins descending and shows counts', () => {
    const roster: RosterEntry[] = [
      { id: 'a', name: 'An', isBot: false, connected: true, wins: 1 },
      { id: 'b', name: 'Bình', isBot: false, connected: true, wins: 3 },
      { id: 'c', name: 'Cường', isBot: false, connected: true, wins: 0 },
    ];
    const { container } = render(<Leaderboard roster={roster} />);
    const rows = [...container.querySelectorAll('[data-leaderboard] [data-player]')];
    expect(rows.map((r) => r.getAttribute('data-player'))).toEqual(['b', 'a', 'c']);
    expect(rows[0]!.textContent).toContain('Bình');
    expect(rows[0]!.textContent).toContain('3');
  });

  it('treats a missing wins value as 0', () => {
    const roster: RosterEntry[] = [
      { id: 'a', name: 'An', isBot: false, connected: true }, // no wins
      { id: 'b', name: 'Bình', isBot: false, connected: true, wins: 2 },
    ];
    const { container } = render(<Leaderboard roster={roster} />);
    const rows = [...container.querySelectorAll('[data-leaderboard] [data-player]')];
    expect(rows.map((r) => r.getAttribute('data-player'))).toEqual(['b', 'a']);
  });
});
