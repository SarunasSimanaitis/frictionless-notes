import test from 'node:test';
import assert from 'node:assert/strict';
import { getThemeMode, isDarkColor, pageInkColors, palette, resolvePageColor, resolveThemeMode, setThemeMode } from '../src/theme.ts';

test('theme palette switches between light and dark and can return to light', () => {
  setThemeMode('light');
  const lightBackground = palette.background;
  const lightInk = palette.ink;
  setThemeMode('dark');
  assert.equal(getThemeMode(), 'dark');
  assert.notEqual(palette.background, lightBackground);
  assert.notEqual(palette.ink, lightInk);
  assert.equal(palette.background, '#000000');
  setThemeMode('light');
  assert.equal(palette.background, lightBackground);
});

test('the saved theme preference resolves against the device setting', () => {
  assert.equal(resolveThemeMode('system', 'dark'), 'dark');
  assert.equal(resolveThemeMode('system', 'light'), 'light');
  assert.equal(resolveThemeMode('system', null), 'light');
  assert.equal(resolveThemeMode('light', 'dark'), 'light');
  assert.equal(resolveThemeMode('dark', 'light'), 'dark');
});

test('note pages pick text colours from the page, not from the app theme', () => {
  // The default page follows the app theme.
  assert.equal(resolvePageColor({ background: 'warmWhite' }, 'light'), '#FFFFFF');
  assert.equal(resolvePageColor({ background: 'warmWhite' }, 'dark'), '#000000');
  // A chosen paper keeps its colour in both themes, and a custom colour wins over everything.
  assert.equal(resolvePageColor({ background: 'cream' }, 'dark'), resolvePageColor({ background: 'cream' }, 'light'));
  assert.equal(resolvePageColor({ background: 'cream', customBackgroundColor: '#243B53' }, 'light'), '#243B53');
  assert.equal(resolvePageColor({ background: 'cream', customBackgroundColor: 'red' }, 'light'), resolvePageColor({ background: 'cream' }, 'light'));

  assert.equal(isDarkColor('#243B53'), true);
  assert.equal(isDarkColor('#FBF3E2'), false);
  const onDark = pageInkColors(resolvePageColor({ background: 'midnight' }, 'light'));
  const onLight = pageInkColors(resolvePageColor({ background: 'cream' }, 'dark'));
  assert.equal(isDarkColor(onDark.ink), false, 'a dark page gets light text even in the light theme');
  assert.equal(isDarkColor(onLight.ink), true, 'a pastel page gets dark text even in the dark theme');
});
