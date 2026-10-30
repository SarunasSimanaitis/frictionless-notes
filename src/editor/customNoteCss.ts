import type { NoteAppearance } from '../types';
import { noteBackgroundColors, palette } from '../theme';
import type { ThemeMode } from '../theme';

export function customNoteCss(appearance: NoteAppearance, alignment: 'left' | 'center' | 'right', spacing: 'compact' | 'normal' | 'relaxed', themeMode: ThemeMode = 'light'): string {
  const background = appearance.customBackgroundColor && /^#[0-9a-fA-F]{6}$/.test(appearance.customBackgroundColor)
    ? appearance.customBackgroundColor
    : themeMode === 'dark' && appearance.background === 'warmWhite'
      ? palette.background : noteBackgroundColors[appearance.background];
  const fontFamily = appearance.font === 'serif' ? 'Georgia,"Times New Roman",serif' : 'system-ui,-apple-system,sans-serif';
  const paragraphGap = spacing === 'compact' ? 6 : spacing === 'relaxed' ? 22 : 12;
  const pattern = appearance.paper === 'lined'
    ? 'background-image:repeating-linear-gradient(to bottom,transparent 0,transparent 31px,rgba(73,105,84,.13) 32px,transparent 33px);background-size:100% 33px;'
    : appearance.paper === 'dotted'
      ? 'background-image:radial-gradient(rgba(73,105,84,.2) .8px,transparent .8px);background-size:18px 18px;'
      : appearance.paper === 'grid'
        ? 'background-image:linear-gradient(rgba(73,105,84,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(73,105,84,.1) 1px,transparent 1px);background-size:22px 22px;'
        : 'background-image:none;';
  const body = `body{box-sizing:border-box;padding:12px 0 38px;color:${palette.ink};font-family:${fontFamily};${pattern}}`;
  return `html,body{margin:0!important;background-color:${background}!important;}${body} .ProseMirror{min-height:38px;outline:none;color:${palette.ink};font-family:${fontFamily};font-size:20px;line-height:1.55;text-align:${alignment};} .ProseMirror .is-editor-empty:first-child::before{color:${palette.faint};} .ProseMirror p{margin:0 0 ${paragraphGap}px;} .ProseMirror li{margin:0 0 ${Math.max(4, paragraphGap / 2)}px;} .ProseMirror h1{font-size:29px;line-height:1.25;margin:4px 0 14px;} .ProseMirror h2{font-size:24px;line-height:1.3;margin:4px 0 12px;} .ProseMirror h3{font-size:20px;line-height:1.35;margin:4px 0 10px;} .ProseMirror ul,.ProseMirror ol{padding-left:26px;} .ProseMirror img{max-width:100%;height:auto;}`;
}
