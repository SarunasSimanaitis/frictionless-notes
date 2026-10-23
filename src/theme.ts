import type { NoteBackground, NoteMargin } from './types';

export const palette = {
  background: '#F7F6F1',
  surface: '#FFFFFF',
  ink: '#242923',
  muted: '#74796F',
  faint: '#9A9D95',
  line: '#E7E7DF',
  accent: '#366A52',
  accentSoft: '#E8F0E9',
  checked: '#7C8479',
  danger: '#A0443A',
} as const;

export const noteBackgroundColors: Record<NoteBackground, string> = {
  warmWhite: '#F7F6F1',
  white: '#FFFFFF',
  cream: '#FBF3E2',
  pink: '#FFF1F4',
  green: '#EEF5EA',
  blue: '#EDF4FC',
};

export const noteBackgroundLabels: Record<NoteBackground, string> = {
  warmWhite: 'Warm white',
  white: 'Pure white',
  cream: 'Cream',
  pink: 'Soft pink',
  green: 'Pale green',
  blue: 'Light blue',
};

export const noteMarginValues: Record<NoteMargin, number> = {
  narrow: 12,
  comfortable: 22,
  wide: 34,
};
