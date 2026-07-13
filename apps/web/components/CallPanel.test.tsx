import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallPanel } from './CallPanel';

describe('CallPanel', () => {
  it('calls onCall with the clicked number on your turn', async () => {
    const onCall = vi.fn();
    const user = userEvent.setup();
    render(<CallPanel calledNumbers={[]} isYourTurn onCall={onCall} />);
    await user.click(screen.getByRole('button', { name: '7' }));
    expect(onCall).toHaveBeenCalledWith(7);
  });

  it('disables already-called numbers', () => {
    render(<CallPanel calledNumbers={[7]} isYourTurn onCall={() => {}} />);
    expect(screen.getByRole('button', { name: '7' })).toBeDisabled();
  });

  it('disables all numbers when it is not your turn', () => {
    render(<CallPanel calledNumbers={[]} isYourTurn={false} onCall={() => {}} />);
    expect(screen.getByRole('button', { name: '3' })).toBeDisabled();
  });
});
