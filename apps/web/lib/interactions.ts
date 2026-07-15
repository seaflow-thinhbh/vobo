import type { InteractionType } from './types';

export interface InteractionDef {
  type: InteractionType;
  icon: string;
  label: string;
  sound: string;
  isText: boolean;
  text?: string;
}

export const INTERACTIONS: InteractionDef[] = [
  { type: 'tomato', icon: '🍅', label: 'Ném cà chua', sound: 'splat', isText: false },
  { type: 'flower', icon: '💐', label: 'Tặng hoa', sound: 'chime', isText: false },
  { type: 'brick', icon: '🧱', label: 'Ném gạch', sound: 'thud', isText: false },
  { type: 'smoke', icon: '💨', label: 'Bom mù', sound: 'poof', isText: false },
  { type: 'shit', icon: '💩', label: 'Cục shit', sound: 'splat', isText: false },
  { type: 'chicken', icon: '🐔', label: 'Con gà', sound: 'cluck', isText: true, text: 'Con gà!' },
  { type: 'hurry', icon: '⏩', label: 'Nhanh lên', sound: 'tick', isText: true, text: 'Nhanh mẹ lên!' },
  { type: 'young', icon: '👶', label: 'Tuổi non', sound: 'laugh', isText: true, text: 'Tuổi ***!' },
  { type: 'fire', icon: '🔥', label: 'Gáy', sound: 'burn', isText: true, text: '🔥🔥🔥' },
  { type: 'heart', icon: '❤️', label: 'Thả tim', sound: 'pop', isText: false },
  { type: 'laugh', icon: '😂', label: 'Haha', sound: 'pop', isText: false },
  { type: 'angry', icon: '😡', label: 'Tức', sound: 'pop', isText: false },
  { type: 'like', icon: '👍', label: 'Like', sound: 'pop', isText: false },
  { type: 'clap', icon: '🎉', label: 'Chúc mừng', sound: 'pop', isText: false },
];

export function playInteractionSound(sound: string): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.1;

    switch (sound) {
      case 'splat': osc.frequency.value = 200; osc.type = 'sawtooth'; break;
      case 'chime': osc.frequency.value = 800; osc.type = 'sine'; break;
      case 'thud': osc.frequency.value = 80; osc.type = 'triangle'; break;
      case 'poof': osc.frequency.value = 300; osc.type = 'sine'; break;
      case 'cluck': osc.frequency.value = 400; osc.type = 'square'; break;
      case 'tick': osc.frequency.value = 1000; osc.type = 'sine'; break;
      case 'laugh': osc.frequency.value = 500; osc.type = 'sawtooth'; break;
      case 'burn': osc.frequency.value = 150; osc.type = 'sawtooth'; break;
      default: osc.frequency.value = 600; osc.type = 'sine'; break;
    }

    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 200);
  } catch {
    /* audio not available */
  }
}
