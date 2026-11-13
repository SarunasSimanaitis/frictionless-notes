import type { NoteAppearance } from '../types';
import { isDarkColor, pageInkColors, resolvePageColor } from '../theme';
import type { ThemeMode } from '../theme';
import { DEFAULT_CUSTOM_NOTE_FONT_SIZE, NOTE_LINE_HEIGHTS, NOTE_PAGE_FONT_CSS } from './formatting';

/**
 * The stylesheet injected into each rich-text block. Text, hint and rule colours are
 * derived from the page colour, so a dark page stays readable in the light theme and a
 * pastel page stays readable in the dark theme.
 */
export function customNoteCss(appearance: NoteAppearance, alignment: 'left' | 'center' | 'right', spacing: 'compact' | 'normal' | 'relaxed', themeMode: ThemeMode = 'light'): string {
  const background = resolvePageColor(appearance, themeMode);
  const { ink, faint, rule } = pageInkColors(background);
  const accent = isDarkColor(background) ? '#8C9EFF' : '#3B5BFF';
  const fontFamily = NOTE_PAGE_FONT_CSS[appearance.font] ?? NOTE_PAGE_FONT_CSS.sans;
  const fontSize = appearance.baseFontSize ?? DEFAULT_CUSTOM_NOTE_FONT_SIZE;
  const lineHeight = NOTE_LINE_HEIGHTS[appearance.lineHeight ?? 'normal'];
  const row = Math.round(fontSize * lineHeight);
  const lined = appearance.paper === 'lined';
  // Ruled paper only reads as paper when every line of text sits on a rule, so on lined
  // pages all text shares one row height and spacing snaps to whole rows.
  const paragraphGap = lined
    ? (spacing === 'relaxed' ? row : 0)
    : spacing === 'compact' ? 6 : spacing === 'relaxed' ? 22 : 12;
  const topPadding = 10;
  const pattern = lined
    ? `background-image:repeating-linear-gradient(to bottom,transparent 0,transparent ${row - 1}px,${rule} ${row - 1}px,${rule} ${row}px);background-size:100% ${row}px;background-position:0 ${topPadding - Math.round(fontSize * 0.24)}px;`
    : appearance.paper === 'dotted'
      ? `background-image:radial-gradient(${rule} 1px,transparent 1px);background-size:18px 18px;`
      : appearance.paper === 'grid'
        ? `background-image:linear-gradient(${rule} 1px,transparent 1px),linear-gradient(90deg,${rule} 1px,transparent 1px);background-size:22px 22px;`
        : 'background-image:none;';
  const blockLineHeight = lined ? `${row}px` : `${lineHeight}`;
  const headingRule = (size: number, plainLineHeight: number, plainMargin: string) => lined
    ? `font-size:${Math.min(size, Math.floor(row * 0.92))}px;line-height:${row}px;margin:0 0 ${paragraphGap}px;`
    : `font-size:${size}px;line-height:${plainLineHeight};margin:${plainMargin};`;
  return [
    `html,body{margin:0!important;background-color:${background}!important;}`,
    `body{box-sizing:border-box;padding:${topPadding}px 0 ${lined ? row : 38}px;color:${ink};font-family:${fontFamily};${pattern}}`,
    `.ProseMirror{min-height:38px;outline:none;color:${ink};caret-color:${accent};font-family:${fontFamily};font-size:${fontSize}px;line-height:${blockLineHeight};text-align:${alignment};}`,
    `.ProseMirror ::selection{background:${accent}40;}`,
    `.ProseMirror .is-editor-empty:first-child::before{color:${faint};}`,
    `.ProseMirror p{margin:0 0 ${paragraphGap}px;}`,
    `.ProseMirror li{margin:0 0 ${lined ? 0 : Math.max(4, paragraphGap / 2)}px;}`,
    `.ProseMirror li p{margin:0;}`,
    `.ProseMirror h1{letter-spacing:-.01em;${headingRule(Math.round(fontSize * 1.5), 1.25, '6px 0 14px')}}`,
    `.ProseMirror h2{${headingRule(Math.round(fontSize * 1.22), 1.3, '6px 0 12px')}}`,
    `.ProseMirror h3{${headingRule(fontSize, 1.35, '6px 0 10px')}}`,
    `.ProseMirror ul,.ProseMirror ol{padding-left:26px;margin:0 0 ${paragraphGap}px;}`,
    `.ProseMirror blockquote{margin:0 0 ${paragraphGap}px;padding:${lined ? 0 : 2}px 0 ${lined ? 0 : 2}px 14px;border-left:3px solid ${accent};opacity:.86;}`,
    `.ProseMirror blockquote p:last-child{margin-bottom:0;}`,
    lined
      ? `.ProseMirror hr{border:none;height:2px;background:${ink};opacity:.5;margin:${Math.floor(row / 2) - 1}px 0 ${Math.ceil(row / 2) - 1 + paragraphGap}px;}`
      : `.ProseMirror hr{border:none;border-top:1.5px solid ${rule};margin:18px 0;}`,
    `.ProseMirror code{font-family:ui-monospace,"Courier New",monospace;font-size:.9em;background:${rule};border-radius:4px;padding:1px 5px;}`,
    // Highlights are pale, so highlighted text is always dark, even on a dark page.
    `.ProseMirror mark{border-radius:3px;padding:0 2px;color:#0F1419;}`,
    `.ProseMirror img{max-width:100%;height:auto;}`,
  ].join(' ');
}
