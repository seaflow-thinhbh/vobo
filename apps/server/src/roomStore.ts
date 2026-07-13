import type { Room } from './types';

/** Storage boundary for rooms. Swap for a Redis-backed impl later without touching game logic. */
export interface RoomStore {
  create(room: Room): void;
  get(code: string): Room | undefined;
  has(code: string): boolean;
  delete(code: string): void;
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();

  create(room: Room): void {
    this.rooms.set(room.code, room);
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  delete(code: string): void {
    this.rooms.delete(code);
  }
}
