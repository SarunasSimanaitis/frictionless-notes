import type { NoteBackground, NoteMargin, ThemePreference } from './types';

export type ThemeMode = 'light' | 'dark';
let currentThemeMode: ThemeMode = 'light';

// A flat, neutral system: white and true-black surfaces, hairline separators and one accent.
const lightPalette = {
  background: '#FFFFFF', surface: '#FFFFFF', field: '#F2F3F5', ink: '#0F1419', muted: '#5F6672',
  faint: '#9AA1AC', line: '#E6E8EB', accent: '#3B5BFF', accentSoft: '#EEF1FF', onAccent: '#FFFFFF',
  checked: '#9AA1AC', danger: '#D93A3A', scrim: 'rgba(15,20,25,0.38)',
} as const;
const darkPalette = {
  background: '#000000', surface: '#121418', field: '#1A1D23', ink: '#F5F6F7', muted: '#A3A9B3',
  faint: '#6F7682', line: '#262A31', accent: '#8C9EFF', accentSoft: '#1B2140', onAccent: '#0B0D12',
  checked: '#6F7682', danger: '#FF6B6B', scrim: 'rgba(0,0,0,0.6)',
} as const;

export function setThemeMode(mode: ThemeMode): void { currentThemeMode = mode; }
export function getThemeMode(): ThemeMode { return currentThemeMode; }

/** Turns the saved preference into the mode to draw, following the device when asked to. */
export function resolveThemeMode(preference: ThemePreference, systemScheme: string | null | undefined): ThemeMode {
  if (preference === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  return preference;
}

type PaletteKey = keyof typeof lightPalette;
const pick = (key: PaletteKey): string => (currentThemeMode === 'dark' ? darkPalette : lightPalette)[key];

export const palette = {
  get background() { return pick('background'); },
  get surface() { return pick('surface'); },
  get field() { return pick('field'); },
  get ink() { return pick('ink'); },
  get muted() { return pick('muted'); },
  get faint() { return pick('faint'); },
  get line() { return pick('line'); },
  get accent() { return pick('accent'); },
  get accentSoft() { return pick('accentSoft'); },
  get onAccent() { return pick('onAccent'); },
  get checked() { return pick('checked'); },
  get danger() { return pick('danger'); },
  get scrim() { return pick('scrim'); },
} as const;

/** `warmWhite` is the stored key for the default page, which follows the app theme. */
export const noteBackgroundColors: Record<NoteBackground, string> = {
  warmWhite: '#FFFFFF', white: '#FFFFFF', cream: '#FBF3E2', pink: '#FFF0F3', green: '#EDF6EA', blue: '#EAF2FD',
  lavender: '#F1EEFC', sand: '#F3EEE6', graphite: '#22262D', midnight: '#0F172A',
};
export const noteBackgroundLabels: Record<NoteBackground, string> = {
  warmWhite: 'Default', white: 'White', cream: 'Cream', pink: 'Rose', green: 'Mint', blue: 'Sky',
  lavender: 'Lavender', sand: 'Sand', graphite: 'Graphite', midnight: 'Midnight',
};
export const noteMarginValues: Record<NoteMargin, number> = { narrow: 12, comfortable: 20, wide: 34 };

/** The colour actually painted behind a note, after custom colours and the app theme are applied. */
export function resolvePageColor(
  appearance: { background: NoteBackground; customBackgroundColor?: string },
  themeMode: ThemeMode = currentThemeMode,
): string {
  if (appearance.customBackgroundColor && /^#[0-9a-fA-F]{6}$/.test(appearance.customBackgroundColor)) {
    return appearance.customBackgroundColor;
  }
  if (appearance.background === 'warmWhite') return themeMode === 'dark' ? darkPalette.background : lightPalette.background;
  return noteBackgroundColors[appearance.background];
}

function relativeLuminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** True when a page colour is dark enough to need light text. */
export function isDarkColor(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex) && relativeLuminance(hex) < 0.32;
}

/** Text, hint and rule colours that stay readable on any page colour, in either app theme. */
export function pageInkColors(pageColor: string): { ink: string; faint: string; rule: string } {
  return isDarkColor(pageColor)
    ? { ink: darkPalette.ink, faint: '#8A919C', rule: 'rgba(245,246,247,0.16)' }
    : { ink: lightPalette.ink, faint: '#9AA1AC', rule: 'rgba(15,20,25,0.12)' };
}
