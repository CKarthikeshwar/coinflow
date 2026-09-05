/**
 * FILE PURPOSE
 * ------------
 * Backs the custom on-screen numeric keypad used for amount entry in the Add/Confirm sheet
 * (`src/ui/numeric-keypad.tsx` for the buttons, `src/ui/amount-input.tsx` for the display).
 * Tracks what's been typed as a raw text buffer (e.g. `"12.5"`) and keeps the paise-integer
 * value (`amountMinor`, e.g. `1250`) in sync with it on every keypress.
 *
 * WHERE IT FITS
 * -------------
 * `mode` distinguishes whether the keypad is shown full-height (actively entering an amount) or
 * collapsed into a summary bar (amount already entered, other fields being filled in) —
 * `transaction-sheet.tsx` reads this to decide which layout to render.
 *
 * IMPORTANT
 * ---------
 * `buffer` (the text the user has typed) and `amountMinor` (the resulting paise integer) are
 * two different representations of the same value, kept in sync by this store rather than
 * computed from each other on every render. This matters because the raw text buffer can hold
 * states an integer can't cleanly represent mid-typing — e.g. `"12."` with a trailing decimal
 * point and no digits after it yet — so the text buffer is the source of truth while typing,
 * and `amountMinor` (via `bufferToMinor`) is derived from it after every keypress.
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
