import type { ChatMessage } from './types';

export class ChatManager {
  private store = new Map<string, ChatMessage[]>();
  private nextId = 0;

  getMessages(_code: string): ChatMessage[] {
    return [];
  }

  addMessage(code: string, playerId: string, playerName: string, text: string): ChatMessage {
    const msg: ChatMessage = {
      id: `msg_${++this.nextId}`,
      playerId,
      playerName,
      text: text.slice(0, 500),
      timestamp: Date.now(),
    };
    let list = this.store.get(code);
    if (!list) {
      list = [];
      this.store.set(code, list);
    }
    list.push(msg);
    if (list.length > 100) list.splice(0, list.length - 100);
    return msg;
  }
}
