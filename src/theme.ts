import type { NoteBackground, NoteMargin } from './types';

export type ThemeMode = 'light' | 'dark';
let currentThemeMode: ThemeMode = 'light';

const lightPalette = {
  background: '#F5F6F8', surface: '#FFFFFF', ink: '#242A35', muted: '#687386',
  faint: '#929BAB', line: '#E3E7EE', accent: '#536F9F', accentSoft: '#E9EEF7',
  checked: '#8993A3', danger: '#B34F4A',
} as const;
const darkPalette = {
  background: '#111722', surface: '#1B2432', ink: '#F0F3F8', muted: '#AAB5C6',
  faint: '#7F8BA0', line: '#303C4F', accent: '#A9BDE5', accentSoft: '#30435F',
  checked: '#929FB4', danger: '#FF9A91',
} as const;

export function setThemeMode(mode: ThemeMode): void { currentThemeMode = mode; }
export function getThemeMode(): ThemeMode { return currentThemeMode; }

export const palette = {
  get background() { return currentThemeMode === 'dark' ? darkPalette.background : lightPalette.background; },
  get surface() { return currentThemeMode === 'dark' ? darkPalette.surface : lightPalette.surface; },
  get ink() { return currentThemeMode === 'dark' ? darkPalette.ink : lightPalette.ink; },
  get muted() { return currentThemeMode === 'dark' ? darkPalette.muted : lightPalette.muted; },
  get faint() { return currentThemeMode === 'dark' ? darkPalette.faint : lightPalette.faint; },
  get line() { return currentThemeMode === 'dark' ? darkPalette.line : lightPalette.line; },
  get accent() { return currentThemeMode === 'dark' ? darkPalette.accent : lightPalette.accent; },
  get accentSoft() { return currentThemeMode === 'dark' ? darkPalette.accentSoft : lightPalette.accentSoft; },
  get checked() { return currentThemeMode === 'dark' ? darkPalette.checked : lightPalette.checked; },
  get danger() { return currentThemeMode === 'dark' ? darkPalette.danger : lightPalette.danger; },
} as const;


export const noteBackgroundColors: Record<NoteBackground, string> = {
  warmWhite: '#F7F6F1', white: '#FFFFFF', cream: '#FBF3E2', pink: '#FFF1F4', green: '#EEF5EA', blue: '#EDF4FC',
};
export const noteBackgroundLabels: Record<NoteBackground, string> = {
  warmWhite: 'Warm white', white: 'Pure white', cream: 'Cream', pink: 'Soft pink', green: 'Pale green', blue: 'Light blue',
};
export const noteMarginValues: Record<NoteMargin, number> = { narrow: 12, comfortable: 22, wide: 34 };
