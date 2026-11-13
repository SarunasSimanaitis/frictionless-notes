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
  HIGHLIGHT_COLORS,
  NOTE_PAGE_FONT_CSS,
  TEXT_COLORS,
  parseCustomFontSize,
  preserveFormattingSelection,
  readFontSizeNumber,
  toFontSizeCss,
  type FontSizeSelection,
} from './formatting';
import type { NoteFont, ParagraphSpacing } from '../types';
import { getThemeMode, palette, setThemeMode } from '../theme';
import { Icon, type IconName } from '../ui/Icon';

type MenuName = 'text' | 'color' | 'paragraph' | 'insert' | null;
type ColorKind = 'text' | 'highlight';
type Alignment = 'left' | 'center' | 'right';

export interface ActiveRichEditor {
  editor: EditorBridge;
  state: BridgeState & NoteFontFormattingState;
  blockId: string;
  alignment: Alignment;
  spacing: ParagraphSpacing;
}

interface FormattingToolbarProps {
  active: ActiveRichEditor | null;
  defaultFontFamily: NoteFont;
  defaultFontSize: number;
  /** Page style belongs to Custom Notes only. */
  showPageStyle: boolean;
  onAlignmentChange: (blockId: string, alignment: Alignment) => void;
  onSpacingChange: (blockId: string, spacing: ParagraphSpacing) => void;
  onInsertChecklist: () => void;
  onInsertImage: () => void;
  onOpenPageStyle: () => void;
}

const alignmentIcons: Record<Alignment, IconName> = { left: 'alignLeft', center: 'alignCenter', right: 'alignRight' };

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
      {children}
    </Pressable>
  );
}

export function FormattingToolbar({
  active,
  defaultFontFamily,
  defaultFontSize,
  showPageStyle,
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
  const state = active?.state;
  const currentFontSize = readFontSizeNumber(state?.activeFontSize, defaultFontSize);
  const currentFont = state?.activeFontFamily ?? (defaultFontFamily === 'sans' ? undefined : NOTE_PAGE_FONT_CSS[defaultFontFamily]);
  const activeSwatch = colorKind === 'text' ? state?.activeColor : state?.activeHighlight;

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
  };

  const applyFontSize = (size: number) => {
    applyAtSavedSelection((editor) => editor.setFontSize(toFontSizeCss(size)));
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
  };

  const setHeading = (level: 0 | 1 | 2 | 3) => {
    const currentLevel = state?.headingLevel;
    if (level === 0) {
      if (currentLevel) runEditorCommand((editor) => editor.toggleHeading(currentLevel as 1 | 2 | 3 | 4 | 5 | 6));
      return;
    }
    if (currentLevel !== level) runEditorCommand((editor) => editor.toggleHeading(level));
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <ToolbarButton label="Font family and style" selected={menu === 'text'} disabled={disabled} onPress={() => showMenu('text')}>
          <Text style={styles.styleGlyph}>Aa</Text>
        </ToolbarButton>
        <ToolbarButton label="Bold" selected={Boolean(state?.isBoldActive)} disabled={disabled} onPress={() => runEditorCommand((editor) => editor.toggleBold())}>
          <Text style={[styles.buttonGlyph, styles.boldGlyph]}>B</Text>
        </ToolbarButton>
        <ToolbarButton label="Italic" selected={Boolean(state?.isItalicActive)} disabled={disabled} onPress={() => runEditorCommand((editor) => editor.toggleItalic())}>
          <Text style={[styles.buttonGlyph, styles.italicGlyph]}>I</Text>
        </ToolbarButton>
        <ToolbarButton label="Underline" selected={Boolean(state?.isUnderlineActive)} disabled={disabled} onPress={() => runEditorCommand((editor) => editor.toggleUnderline())}>
          <Text style={[styles.buttonGlyph, styles.underlineGlyph]}>U</Text>
        </ToolbarButton>
        <ToolbarButton label="Strikethrough" selected={Boolean(state?.isStrikeActive)} disabled={disabled} onPress={() => runEditorCommand((editor) => editor.toggleStrike())}>
          <Text style={[styles.buttonGlyph, styles.strikeGlyph]}>S</Text>
        </ToolbarButton>
        <ToolbarButton label="Text color and highlight" selected={menu === 'color'} disabled={disabled} onPress={() => showMenu('color')}>
          <View style={styles.colorGlyphWrap}>
            <Text style={[styles.buttonGlyph, styles.boldGlyph]}>A</Text>
            <View style={[styles.colorGlyphLine, { backgroundColor: state?.activeColor ?? palette.accent }]} />
          </View>
        </ToolbarButton>
        <View style={styles.separator} />
        <ToolbarButton label="Bulleted list" selected={Boolean(state?.isBulletListActive)} disabled={disabled} onPress={() => runEditorCommand((editor) => editor.toggleBulletList())}>
          <Icon name="listBullets" size={22} />
        </ToolbarButton>
        <ToolbarButton label="Numbered list" selected={Boolean(state?.isOrderedListActive)} disabled={disabled} onPress={() => runEditorCommand((editor) => editor.toggleOrderedList())}>
          <Icon name="listNumbers" size={22} />
        </ToolbarButton>
        <ToolbarButton label="Alignment and spacing" selected={menu === 'paragraph'} disabled={disabled} onPress={() => showMenu('paragraph')}>
          <Icon name={alignmentIcons[active?.alignment ?? 'left']} size={22} />
        </ToolbarButton>
        <View style={styles.separator} />
        <ToolbarButton label="Insert checklist, image or divider" selected={menu === 'insert'} onPress={() => showMenu('insert')}>
          <Icon name="plus" size={22} />
        </ToolbarButton>
        {showPageStyle ? (
          <ToolbarButton label="Page style" onPress={() => { setMenu(null); onOpenPageStyle(); }}>
            <Icon name="droplet" size={22} />
          </ToolbarButton>
        ) : null}
        <View style={styles.separator} />
        <ToolbarButton label="Undo" disabled={disabled || !state?.canUndo} onPress={() => runEditorCommand((editor) => editor.undo())}>
          <Icon name="undo" size={22} />
        </ToolbarButton>
        <ToolbarButton label="Redo" disabled={disabled || !state?.canRedo} onPress={() => runEditorCommand((editor) => editor.redo())}>
          <Icon name="redo" size={22} />
        </ToolbarButton>
      </ScrollView>

      {menu === 'text' ? (
        <View style={styles.menuPanel} accessibilityLabel="Text style options">
          <View style={styles.menuSection}>
            <Text style={styles.menuTitle}>Style</Text>
            <View style={styles.actionsRow}>
              <ActionOption label="Body" selected={!state?.headingLevel && !state?.isBlockquoteActive} onPress={() => setHeading(0)} />
              <ActionOption label="Title" accessibilityLabel="Heading 1" selected={state?.headingLevel === 1} onPress={() => setHeading(1)} />
              <ActionOption label="Heading" accessibilityLabel="Heading 2" selected={state?.headingLevel === 2} onPress={() => setHeading(2)} />
              <ActionOption label="Subheading" accessibilityLabel="Heading 3" selected={state?.headingLevel === 3} onPress={() => setHeading(3)} />
              <ActionOption label="Quote" icon="quote" selected={Boolean(state?.isBlockquoteActive)} onPress={() => runEditorCommand((editor) => editor.toggleBlockquote())} />
            </View>
          </View>
          <View style={styles.menuSection}>
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
                      onPress={() => applyFontFamily(font.id === 'system' ? null : font.css)}
                      style={[styles.fontOption, selected && styles.optionSelected]}
                    >
                      <Text style={[styles.fontPreview, font.preview ? { fontFamily: font.preview } : null, selected && styles.optionTextSelected]} numberOfLines={1}>Aa</Text>
                      <Text style={[styles.fontLabel, selected && styles.optionTextSelected]}>{font.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
          <View style={styles.menuSection}>
            <Text style={styles.menuTitle}>Size · {currentFontSize}</Text>
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
                <TextInput
                  accessibilityLabel="Custom font size in pixels"
                  keyboardType="number-pad"
                  maxLength={2}
                  onChangeText={setCustomSizeDraft}
                  onSubmitEditing={applyCustomSize}
                  placeholder="Other"
                  placeholderTextColor={palette.faint}
                  returnKeyType="done"
                  value={customSizeDraft}
                  style={styles.customSizeInput}
                />
                {parseCustomFontSize(customSizeDraft) !== null ? (
                  <ActionOption label="Apply" accessibilityLabel="Apply custom font size" onPress={applyCustomSize} />
                ) : null}
              </View>
            </ScrollView>
          </View>
          <View style={styles.actionsRow}>
            <ActionOption
              label="Clear formatting"
              icon="eraser"
              onPress={() => runEditorCommand((editor) => editor.clearFormatting())}
            />
          </View>
        </View>
      ) : null}

      {menu === 'color' ? (
        <View style={styles.menuPanel} accessibilityLabel="Text color and highlight options">
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
          <View style={styles.colorOptions}>
            {(colorKind === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS).map((option) => {
              const selected = option.color === null
                ? !activeSwatch
                : activeSwatch?.toLowerCase() === option.color.toLowerCase();
              return (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.label} ${colorKind === 'text' ? 'text color' : 'highlight'}`}
                  accessibilityState={{ selected }}
                  onPress={() => applyColor(colorKind, option.color)}
                  style={[styles.colorOption, selected && styles.colorOptionSelected]}
                >
                  <View style={[styles.swatch, { backgroundColor: option.color ?? palette.background }]}>
                    {option.color === null ? <Icon name="close" size={14} color={palette.muted} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {menu === 'paragraph' ? (
        <View style={styles.menuPanel} accessibilityLabel="Alignment and spacing options">
          <View style={styles.menuSection}>
            <Text style={styles.menuTitle}>Align</Text>
            <View style={styles.actionsRow}>
              {(['left', 'center', 'right'] as const).map((alignment) => (
                <ActionOption
                  key={alignment}
                  label={alignment[0].toUpperCase() + alignment.slice(1)}
                  accessibilityLabel={`Align ${alignment}`}
                  icon={alignmentIcons[alignment]}
                  selected={active?.alignment === alignment}
                  onPress={() => {
                    if (active) onAlignmentChange(active.blockId, alignment);
                  }}
                />
              ))}
            </View>
          </View>
          <View style={styles.menuSection}>
            <Text style={styles.menuTitle}>Paragraph spacing</Text>
            <View style={styles.actionsRow}>
              {(['compact', 'normal', 'relaxed'] as const).map((spacing) => (
                <ActionOption
                  key={spacing}
                  label={spacing[0].toUpperCase() + spacing.slice(1)}
                  selected={active?.spacing === spacing}
                  onPress={() => {
                    if (active) onSpacingChange(active.blockId, spacing);
                  }}
                />
              ))}
            </View>
          </View>
          <View style={styles.menuSection}>
            <Text style={styles.menuTitle}>List level</Text>
            <View style={styles.actionsRow}>
              <ActionOption label="Indent" icon="indent" disabled={!state?.canSink} onPress={() => runEditorCommand((editor) => editor.sink())} />
              <ActionOption label="Outdent" icon="outdent" disabled={!state?.canLift} onPress={() => runEditorCommand((editor) => editor.lift())} />
            </View>
          </View>
        </View>
      ) : null}

      {menu === 'insert' ? (
        <View style={styles.menuPanel} accessibilityLabel="Insert options">
          <View style={styles.actionsRow}>
            <ActionOption label="Checklist" accessibilityLabel="Insert checklist at the cursor" icon="checklist" onPress={() => { onInsertChecklist(); setMenu(null); }} />
            <ActionOption label="Image" accessibilityLabel="Choose image from gallery" icon="image" onPress={() => { onInsertImage(); setMenu(null); }} />
            <ActionOption label="Divider" accessibilityLabel="Insert divider line" icon="divider" disabled={disabled} onPress={() => { runEditorCommand((editor) => editor.insertDivider()); setMenu(null); }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ActionOption({ label, accessibilityLabel, icon, selected = false, disabled = false, onPress }: {
  label: string;
  accessibilityLabel?: string;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionOption, selected && styles.optionSelected, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {icon ? <Icon name={icon} size={18} color={selected ? palette.background : palette.ink} /> : null}
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = () => StyleSheet.create({
  container: {
    flexShrink: 0,
    backgroundColor: palette.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  row: {
    minHeight: 48,
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 2,
  },
  button: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 6,
  },
  buttonSelected: {
    backgroundColor: palette.field,
  },
  buttonGlyph: {
    color: palette.ink,
    fontSize: 18,
    lineHeight: 22,
    textAlign: 'center',
  },
  styleGlyph: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  boldGlyph: {
    fontWeight: '800',
  },
  italicGlyph: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: '600',
  },
  underlineGlyph: {
    textDecorationLine: 'underline',
    fontWeight: '700',
  },
  strikeGlyph: {
    textDecorationLine: 'line-through',
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
  separator: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: palette.line,
    marginHorizontal: 4,
  },
  menuPanel: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: palette.background,
  },
  menuSection: {
    gap: 6,
  },
  menuTitle: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 16,
  },
  fontOption: {
    minWidth: 76,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: palette.field,
  },
  fontPreview: {
    color: palette.ink,
    fontSize: 19,
    lineHeight: 24,
  },
  fontLabel: {
    color: palette.muted,
    fontSize: 11,
  },
  sizeOption: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: palette.field,
  },
  optionSelected: {
    backgroundColor: palette.ink,
  },
  optionText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  optionTextSelected: {
    color: palette.background,
  },
  customSizeInput: {
    width: 72,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: palette.field,
    color: palette.ink,
    fontSize: 13,
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: 6,
  },
  toggleOption: {
    minWidth: 76,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: palette.field,
  },
  colorOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  colorOption: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: palette.ink,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: palette.field,
  },
  pressed: {
    opacity: 0.6,
  },
  disabled: {
    opacity: 0.35,
  },
});

const originalThemeMode = getThemeMode();
setThemeMode('light');
const lightStyles = createStyles();
setThemeMode('dark');
const darkStyles = createStyles();
setThemeMode(originalThemeMode);
const styles = new Proxy(lightStyles, {
  get(_target, property) {
    return Reflect.get(getThemeMode() === 'dark' ? darkStyles : lightStyles, property);
  },
}) as typeof lightStyles;
