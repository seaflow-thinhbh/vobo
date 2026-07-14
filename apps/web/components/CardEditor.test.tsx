import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardEditor } from './CardEditor';
import { isValidArrangement } from '@/lib/bingo';

describe('CardEditor', () => {
  it('disables "Sẵn sàng" until the card is valid', () => {
    render(<CardEditor onSubmit={() => {}} />);
    expect(screen.getByRole('button', { name: 'Sẵn sàng' })).toBeDisabled();
  });

  it('"Xếp ngẫu nhiên" fills a valid card and enables submit, which reports the card', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CardEditor onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Xếp ngẫu nhiên' }));
    const ready = screen.getByRole('button', { name: 'Sẵn sàng' });
    expect(ready).toBeEnabled();

    await user.click(ready);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const card = onSubmit.mock.calls[0]![0] as number[];
    expect(isValidArrangement(card)).toBe(true);
  });

  it('flags cells that duplicate another cell value', async () => {
    const user = userEvent.setup();
    render(<CardEditor onSubmit={() => {}} />);
    await user.type(screen.getByLabelText('Ô 1'), '5');
    await user.type(screen.getByLabelText('Ô 2'), '5');
    await user.type(screen.getByLabelText('Ô 3'), '7');
    expect(screen.getByLabelText('Ô 1').getAttribute('data-duplicate')).toBe('true');
    expect(screen.getByLabelText('Ô 2').getAttribute('data-duplicate')).toBe('true');
    expect(screen.getByLabelText('Ô 3').getAttribute('data-duplicate')).toBe('false');
  });
});
