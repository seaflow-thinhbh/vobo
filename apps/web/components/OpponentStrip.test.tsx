import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OpponentStrip } from './OpponentStrip';
import { TurnIndicator } from './TurnIndicator';
import type { OpponentView } from '@/lib/types';

const opponents: OpponentView[] = [
  { id: 'b', name: 'Bình', isBot: false, completedLines: 3, connected: true, ready: true },
  { id: 'c', name: 'Bot 1', isBot: true, completedLines: 1, connected: true, ready: true },
];

describe('OpponentStrip', () => {
  it('shows each opponent name and progress but no card numbers', () => {
    render(<OpponentStrip opponents={opponents} currentPlayerId="b" />);
    expect(screen.getByText('Bình')).toBeInTheDocument();
    expect(screen.getByText('Bot 1')).toBeInTheDocument();
    expect(screen.getByText('Bình').closest('[data-current]')!.getAttribute('data-current')).toBe('true');
  });
});

describe('TurnIndicator', () => {
  it('says it is your turn when you are current', () => {
    render(<TurnIndicator currentPlayerId="you" youId="you" roster={[{ id: 'you', name: 'An' }]} />);
    expect(screen.getByText('Lượt của bạn')).toBeInTheDocument();
  });

  it('names the current opponent otherwise', () => {
    render(<TurnIndicator currentPlayerId="b" youId="you" roster={[{ id: 'b', name: 'Bình' }]} />);
    expect(screen.getByText('Lượt của Bình')).toBeInTheDocument();
  });
});
