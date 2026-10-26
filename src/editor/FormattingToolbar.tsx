import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { BridgeState, EditorBridge } from '@10play/tentap-editor';
import type { NoteFontFormattingState } from './fontFormattingBridge';
import {
  CUSTOM_NOTE_FONTS,
  CUSTOM_NOTE_FONT_SIZES,
  parseCustomFontSize,
  preserveFormattingSelection,
  readFontSizeNumber,
  toFontSizeCss,
  type FontSizeSelection,
} from './formatting';
import type { ParagraphSpacing } from '../types';
import { palette } from '../theme';

type MenuName = 'font' | 'size' | 'color' | 'overflow' | 'alignment' | 'spacing' | null;
type ColorKind = 'text' | 'highlight';

export interface ActiveRichEditor {
  editor: EditorBridge;
  state: BridgeState & NoteFontFormattingState;
  blockId: string;
  alignment: 'left' | 'center' | 'right';
  spacing: ParagraphSpacing;
}

interface FormattingToolbarProps {
  active: ActiveRichEditor | null;
  defaultFontFamily: 'sans' | 'serif';
  onAlignmentChange: (blockId: string, alignment: 'left' | 'center' | 'right') => void;
  onSpacingChange: (blockId: string, spacing: ParagraphSpacing) => void;
  onInsertChecklist: () => void;
  onInsertImage: () => void;
  onOpenPageStyle: () => void;
}

const textColors = [
  { label: 'Default', color: null, swatch: '#FFFFFF' },
  { label: 'Ink', color: '#242923', swatch: '#242923' },
  { label: 'Forest', color: '#366A52', swatch: '#366A52' },
  { label: 'Terracotta', color: '#A0443A', swatch: '#A0443A' },
  { label: 'Blue', color: '#2F6D9E', swatch: '#2F6D9E' },
  { label: 'Plum', color: '#78558A', swatch: '#78558A' },
] as const;

const highlightColors = [
  { label: 'None', color: null, swatch: '#FFFFFF' },
  { label: 'Butter', color: '#FFF1A8', swatch: '#FFF1A8' },
  { label: 'Sage', color: '#DDEDD8', swatch: '#DDEDD8' },
  { label: 'Sky', color: '#DCEBFA', swatch: '#DCEBFA' },
  { label: 'Blush', color: '#FBE1E5', swatch: '#FBE1E5' },
] as const;

function ToolbarButton({
  label,
  children,
  selected = false,
  disabled = false,
  onPress,
}: {
  label: string;
  children: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, selected && styles.buttonSelected, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {typeof children === 'string' ? <Text style={[styles.buttonGlyph, selected && styles.buttonGlyphSelected]}>{children}</Text> : children}
    </Pressable>
  );
}

export function FormattingToolbar({
  active,
  defaultFontFamily,
  onAlignmentChange,
  onSpacingChange,
  onInsertChecklist,
  onInsertImage,
  onOpenPageStyle,
}: FormattingToolbarProps) {
  const [menu, setMenu] = useState<MenuName>(null);
  const [colorKind, setColorKind] = useState<ColorKind>('text');
  const [customSizeDraft, setCustomSizeDraft] = useState('');
  const savedSelection = useRef<FontSizeSelection | null>(null);
  const disabled = active === null;
  const currentFontSize = readFontSizeNumber(active?.state.activeFontSize);
  const currentFont = active?.state.activeFontFamily ?? (defaultFontFamily === 'serif'
    ? CUSTOM_NOTE_FONTS.find((font) => font.id === 'serif')?.css
    : CUSTOM_NOTE_FONTS.find((font) => font.id === 'system')?.css);

  const showMenu = (next: Exclude<MenuName, null>) => {
    if (active) savedSelection.current = preserveFormattingSelection(active.state.selection);
    setMenu((current) => current === next ? null : next);
  };

  const applyAtSavedSelection = (action: (editor: EditorBridge) => void) => {
    if (!active) return;
    const selection = preserveFormattingSelection(savedSelection.current ?? active.state.selection);
    if (!selection) return;
    active.editor.setSelection(selection.from, selection.to);
    action(active.editor);
    savedSelection.current = selection;
  };

  const applyFontFamily = (fontFamily: string | null) => {
    applyAtSavedSelection((editor) => editor.setFontFamily(fontFamily));
    setMenu(null);
  };

  const applyFontSize = (size: number) => {
    applyAtSavedSelection((editor) => editor.setFontSize(toFontSizeCss(size)));
    setMenu(null);
  };

  const applyCustomSize = () => {
    const size = parseCustomFontSize(customSizeDraft);
    if (size === null) return;
    applyFontSize(size);
    setCustomSizeDraft('');
  };

  const runEditorCommand = (command: (editor: EditorBridge) => void) => {
    if (!active) return;
    savedSelection.current = preserveFormattingSelection(active.state.selection);
    applyAtSavedSelection(command);
  };

  const applyColor = (kind: ColorKind, color: string | null) => {
    runEditorCommand((editor) => {
      if (kind === 'text') {
        if (color) editor.setColor(color);
        else editor.unsetColor();
      } else if (color) {
        editor.setHighlight(color);
      } else {
        editor.unsetHighlight();
      }
    });
    setMenu(null);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <ToolbarButton label="Font family and style" selected={menu === 'font'} disabled={disabled} onPress={() => showMenu('font')}>
          <Text style={[styles.familyGlyph, menu === 'font' && styles.buttonGlyphSelected]}>A</Text>
        </ToolbarButton>
        <ToolbarButton label={`Font size, ${currentFontSize} pixels`} selected={menu === 'size'} disabled={disabled} onPress={() => showMenu('size')}>
          <Text style={styles.sizeGlyph}>{currentFontSize}<Text style={styles.downArrow}>⌄</Text></Text>
        </ToolbarButton>
        <View style={styles.separator} />
        <ToolbarButton label="Bold" selected={Boolean(active?.state.isBoldActive)} disabled={disabled} onPress={() => runEditorCommand((editor) => editor.toggleBold())}>
          <Text style={[styles.buttonGlyph, styles.boldGlyph]}>B</Text>
        </ToolbarButton>
        <ToolbarButton label="Italic" selected={Boolean(active?.state.isItalicActive)} disabled={disabled} onPress={() => runEditorCommand((editor) => editor.toggleItalic())}>
          <Text style={[styles.buttonGlyph, styles.italicGlyph]}>I</Text>
        </ToolbarButton>
        <ToolbarButton label="Underline" selected={Boolean(active?.state.isUnderlineActive)} disabled={disabled} onPress={() => runEditorCommand((editor) => editor.toggleUnderline())}>
          <Text style={[styles.buttonGlyph, styles.underlineGlyph]}>U</Text>
        </ToolbarButton>
        <ToolbarButton label="Text color and highlight" selected={menu === 'color'} disabled={disabled} onPress={() => showMenu('color')}>
          <View style={styles.colorGlyphWrap}>
            <Text style={[styles.buttonGlyph, styles.boldGlyph]}>A</Text>
            <View style={[styles.colorGlyphLine, { backgroundColor: active?.state.activeColor ?? palette.accent }]} />
          </View>
        </ToolbarButton>
        <View style={styles.separator} />
        <ToolbarButton label="More formatting" selected={menu === 'overflow'} disabled={disabled} onPress={() => showMenu('overflow')}>
          <Text style={styles.moreGlyph}>•••</Text>
        </ToolbarButton>
      </ScrollView>

      {menu === 'font' ? (
        <View style={styles.menuPanel} accessibilityLabel="Font family options">
          <Text style={styles.menuTitle}>Font</Text>
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false}>
            <View style={styles.optionsRow}>
              {CUSTOM_NOTE_FONTS.map((font) => {
                const selected = currentFont === font.css || (!currentFont && font.id === 'system');
                return (
                  <Pressable
                    key={font.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${font.label} font`}
                    accessibilityState={{ selected }}
                    onPress={() => applyFontFamily(font.css)}
                    style={[styles.fontOption, selected && styles.optionSelected]}
                  >
                    <Text style={[styles.fontPreview, font.preview ? { fontFamily: font.preview } : null]} numberOfLines={1}>Aa</Text>
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{font.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {menu === 'size' ? (
        <View style={styles.menuPanel} accessibilityLabel="Font size options">
          <Text style={styles.menuTitle}>Size</Text>
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false}>
            <View style={styles.optionsRow}>
              {CUSTOM_NOTE_FONT_SIZES.map((size) => (
                <Pressable
                  key={size}
                  accessibilityRole="button"
                  accessibilityLabel={`${size} pixel font size`}
                  accessibilityState={{ selected: currentFontSize === size }}
                  onPress={() => applyFontSize(size)}
                  style={[styles.sizeOption, currentFontSize === size && styles.optionSelected]}
                >
                  <Text style={[styles.optionText, currentFontSize === size && styles.optionTextSelected]}>{size}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <View style={styles.customSizeRow}>
            <TextInput
              accessibilityLabel="Custom font size in pixels"
              keyboardType="number-pad"
              maxLength={2}
              onChangeText={setCustomSizeDraft}
              onSubmitEditing={applyCustomSize}
              placeholder="Custom px"
              placeholderTextColor={palette.faint}
              returnKeyType="done"
              value={customSizeDraft}
              style={styles.customSizeInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apply custom font size"
              disabled={parseCustomFontSize(customSizeDraft) === null}
              onPress={applyCustomSize}
              style={[styles.applySizeButton, parseCustomFontSize(customSizeDraft) === null && styles.disabled]}
            >
              <Text style={styles.applySizeText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {menu === 'color' ? (
        <View style={styles.menuPanel} accessibilityLabel="Text color and highlight options">
          <View style={styles.menuHeaderRow}>
            <Text style={styles.menuTitle}>Color</Text>
            <View style={styles.toggleRow}>
              {(['text', 'highlight'] as const).map((kind) => (
                <Pressable
                  key={kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected: colorKind === kind }}
                  onPress={() => setColorKind(kind)}
                  style={[styles.toggleOption, colorKind === kind && styles.optionSelected]}
                >
                  <Text style={[styles.optionText, colorKind === kind && styles.optionTextSelected]}>{kind === 'text' ? 'Text' : 'Highlight'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false}>
            <View style={styles.colorOptions}>
              {(colorKind === 'text' ? textColors : highlightColors).map((option) => (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.label} ${colorKind === 'text' ? 'text color' : 'highlight'}`}
                  onPress={() => applyColor(colorKind, option.color)}
                  style={styles.colorOption}
                >
                  <View style={[styles.swatch, { backgroundColor: option.swatch }]} />
                  <Text style={styles.colorLabel}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {menu === 'overflow' ? (
        <View style={styles.menuPanel} accessibilityLabel="More text formatting">
          <View style={styles.menuHeaderRow}>
            <Text style={styles.menuTitle}>Text</Text>
            <View style={styles.actionsRow}>
              <ActionOption label="Body" selected={!active?.state.headingLevel} onPress={() => {
                const level = active?.state.headingLevel;
                if (level) runEditorCommand((editor) => editor.toggleHeading(level as 1 | 2 | 3 | 4 | 5 | 6));
              }} />
              <ActionOption label="H1" selected={active?.state.headingLevel === 1} onPress={() => runEditorCommand((editor) => editor.toggleHeading(1))} />
              <ActionOption label="H2" selected={active?.state.headingLevel === 2} onPress={() => runEditorCommand((editor) => editor.toggleHeading(2))} />
              <ActionOption label="H3" selected={active?.state.headingLevel === 3} onPress={() => runEditorCommand((editor) => editor.toggleHeading(3))} />
            </View>
          </View>
          <View style={styles.menuSection}>
            <Text style={styles.menuTitle}>Paragraph</Text>
            <View style={styles.actionsRow}>
              <ActionOption label="Bullets" selected={Boolean(active?.state.isBulletListActive)} onPress={() => runEditorCommand((editor) => editor.toggleBulletList())} />
              <ActionOption label="Numbered" selected={Boolean(active?.state.isOrderedListActive)} onPress={() => runEditorCommand((editor) => editor.toggleOrderedList())} />
              <ActionOption label={`Align ${active?.alignment ?? 'left'}`} onPress={() => showMenu('alignment')} />
              <ActionOption label="Spacing" onPress={() => showMenu('spacing')} />
            </View>
          </View>
          <View style={styles.menuSection}>
            <Text style={styles.menuTitle}>Insert</Text>
            <View style={styles.actionsRow}>
              <ActionOption label="Checklist" onPress={() => { onInsertChecklist(); setMenu(null); }} />
              <ActionOption label="Image" onPress={() => { onInsertImage(); setMenu(null); }} />
              <ActionOption label="Page style" onPress={() => { onOpenPageStyle(); setMenu(null); }} />
              <ActionOption label="Undo" onPress={() => runEditorCommand((editor) => editor.undo())} />
              <ActionOption label="Redo" onPress={() => runEditorCommand((editor) => editor.redo())} />
            </View>
          </View>
        </View>
      ) : null}

      {menu === 'alignment' ? (
        <View style={styles.menuPanel} accessibilityLabel="Text alignment options">
          <View style={styles.menuHeaderRow}>
            <Text style={styles.menuTitle}>Alignment</Text>
            <ActionOption label="Back" onPress={() => setMenu('overflow')} />
          </View>
          <View style={styles.actionsRow}>
            {(['left', 'center', 'right'] as const).map((alignment) => (
              <ActionOption
                key={alignment}
                label={alignment[0].toUpperCase() + alignment.slice(1)}
                selected={active?.alignment === alignment}
                onPress={() => {
                  if (active) onAlignmentChange(active.blockId, alignment);
                  setMenu('overflow');
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      {menu === 'spacing' ? (
        <View style={styles.menuPanel} accessibilityLabel="Paragraph spacing options">
          <View style={styles.menuHeaderRow}>
            <Text style={styles.menuTitle}>Paragraph spacing</Text>
            <ActionOption label="Back" onPress={() => setMenu('overflow')} />
          </View>
          <View style={styles.actionsRow}>
            {(['compact', 'normal', 'relaxed'] as const).map((spacing) => (
              <ActionOption
                key={spacing}
                label={spacing[0].toUpperCase() + spacing.slice(1)}
                selected={active?.spacing === spacing}
                onPress={() => {
                  if (active) onSpacingChange(active.blockId, spacing);
                  setMenu('overflow');
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ActionOption({ label, selected = false, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.actionOption, selected && styles.optionSelected]}
    >
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexShrink: 0,
    backgroundColor: palette.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  row: {
    minHeight: 48,
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 4,
  },
  button: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    paddingHorizontal: 6,
  },
  buttonSelected: {
    backgroundColor: palette.accentSoft,
  },
  buttonGlyph: {
    color: palette.ink,
    fontSize: 18,
    lineHeight: 22,
    textAlign: 'center',
  },
  buttonGlyphSelected: {
    color: palette.accent,
  },
  familyGlyph: {
    color: palette.ink,
    fontSize: 21,
    fontWeight: '500',
  },
  sizeGlyph: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  downArrow: {
    color: palette.muted,
    fontSize: 12,
  },
  boldGlyph: {
    fontWeight: '800',
  },
  italicGlyph: {
    fontStyle: 'italic',
    fontFamily: 'serif',
  },
  underlineGlyph: {
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
  colorGlyphWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorGlyphLine: {
    width: 19,
    height: 3,
    marginTop: -1,
    borderRadius: 2,
  },
  moreGlyph: {
    color: palette.ink,
    fontSize: 20,
    letterSpacing: 1,
  },
  separator: {
    width: StyleSheet.hairlineWidth,
    height: 26,
    backgroundColor: palette.line,
    marginHorizontal: 4,
  },
  menuPanel: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 7,
    backgroundColor: palette.surface,
  },
  menuTitle: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.25,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fontOption: {
    minWidth: 72,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 12,
  },
  fontPreview: {
    color: palette.ink,
    fontSize: 19,
    lineHeight: 23,
  },
  sizeOption: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
  },
  optionSelected: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  optionText: {
    color: palette.ink,
    fontSize: 12,
  },
  optionTextSelected: {
    color: palette.accent,
    fontWeight: '700',
  },
  customSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  customSizeInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    color: palette.ink,
    fontSize: 14,
  },
  applySizeButton: {
    minWidth: 64,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: palette.accentSoft,
  },
  applySizeText: {
    color: palette.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  menuHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleOption: {
    minWidth: 56,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 9,
  },
  colorOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colorOption: {
    minWidth: 54,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(36,41,35,0.24)',
  },
  colorLabel: {
    marginTop: 3,
    color: palette.muted,
    fontSize: 9,
  },
  menuSection: {
    gap: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  actionOption: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.42,
  },
});
