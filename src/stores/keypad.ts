/**
 * The in-app numeric keypad buffer (SPEC-implementation.md §22.2 / §6.4). Amount entry
 * only. `mode` is the full-height amount vs the collapsed summary bar. The buffer is a
 * string of digits + at most one '.'; `amountMinor` is the paise value it resolves to.
 */

import { create } from 'zustand';

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back';
export type KeypadMode = 'amount' | 'summary';

function bufferToMinor(buffer: string): number {
  if (!buffer || buffer === '.') return 0;
  const [rupees, paise = ''] = buffer.split('.');
  const p = (paise + '00').slice(0, 2);
  return (parseInt(rupees || '0', 10) * 100 + parseInt(p || '0', 10)) | 0;
}

type KeypadStore = {
  buffer: string;
  mode: KeypadMode;
  amountMinor: number;
  press: (key: KeypadKey) => void;
  setMode: (mode: KeypadMode) => void;
  setFromMinor: (minor: number) => void;
  reset: () => void;
};

export const useKeypad = create<KeypadStore>((set) => ({
  buffer: '',
  mode: 'amount',
  amountMinor: 0,
  press: (key) =>
    set((s) => {
      let buffer = s.buffer;
      if (key === 'back') buffer = buffer.slice(0, -1);
      else if (key === '.') buffer = buffer.includes('.') ? buffer : buffer === '' ? '0.' : buffer + '.';
      else {
        const [, paise] = buffer.split('.');
        if (paise !== undefined && paise.length >= 2) return s; // max 2 decimals
        buffer = buffer === '0' ? key : buffer + key;
      }
      return { buffer, amountMinor: bufferToMinor(buffer) };
    }),
  setMode: (mode) => set({ mode }),
  setFromMinor: (minor) => {
    const buffer = minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
    set({ buffer: minor === 0 ? '' : buffer, amountMinor: minor });
  },
  reset: () => set({ buffer: '', mode: 'amount', amountMinor: 0 }),
}));
