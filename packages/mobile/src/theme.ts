import { Platform } from 'react-native';

export const colors = {
  // Base surfaces — deep, near-black for a calm, terminal-like feel.
  bg: '#0b0b10',
  panel: '#16161f',
  border: '#23232f',

  // Text
  text: '#ececf1',
  textDim: '#8a8a9e',
  textFaint: '#5c5c70',

  // Unread / presence — soft sage green, subtle by design (never loud).
  unread: '#8fcf7a',
  unreadInk: '#0b0b10',

  // Accents retained for the conversation + config screens.
  bubbleMe: '#7c3aed',
  bubbleThem: '#26263a',
  accent: '#ec4899',
  green: '#22c55e',
};

// Monospace face for the DM list — matches the project's terminal-first aesthetic.
export const fonts = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
};
