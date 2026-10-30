import test from 'node:test';
import assert from 'node:assert/strict';
import { getThemeMode, palette, setThemeMode } from '../src/theme.ts';

test('theme palette switches between light and dark and can return to light', () => {
  setThemeMode('light');
  const lightBackground = palette.background;
  const lightInk = palette.ink;
  setThemeMode('dark');
  assert.equal(getThemeMode(), 'dark');
  assert.notEqual(palette.background, lightBackground);
  assert.notEqual(palette.ink, lightInk);
  assert.equal(palette.background, '#111722');
  setThemeMode('light');
  assert.equal(palette.background, lightBackground);
});
