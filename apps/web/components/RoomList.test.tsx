import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoomList } from './RoomList';
import type { OpenRoom } from '@/lib/types';

const rooms: OpenRoom[] = [{ code: 'K7QX9P', hostName: 'An', playerCount: 2, maxPlayers: 6 }];

describe('RoomList', () => {
  it('renders each open room and joins on click', async () => {
    const onJoin = vi.fn();
    const user = userEvent.setup();
    render(<RoomList rooms={rooms} onJoin={onJoin} />);
    expect(screen.getByText(/An/)).toBeInTheDocument();
    expect(screen.getByText('2/6')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vào' }));
    expect(onJoin).toHaveBeenCalledWith('K7QX9P');
  });

  it('shows an empty message when there are no rooms', () => {
    render(<RoomList rooms={[]} onJoin={() => {}} />);
    expect(screen.getByText(/Chưa có phòng nào/)).toBeInTheDocument();
  });
});
