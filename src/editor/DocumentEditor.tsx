import { ChecklistItemLabel } from '../lists/ChecklistItemLabel';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import {
  Alert, Image, Keyboard, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions, type StyleProp, type TextInputInstance, type ViewStyle,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { RichText, TenTapStartKit, useBridgeState, useEditorBridge, useEditorContent, type EditorBridge, type EditorBridgeOptions } from '@10play/tentap-editor';
import { FormattingToolbar, type ActiveRichEditor } from './FormattingToolbar';
import { NoteFontFormattingBridge } from './fontFormattingBridge';
import { editorHtml } from '../../editor-web/build/editorHtml';
import {
  NOTE_BASE_FONT_SIZES, canAddChecklistItem, createEmbeddedChecklistBlock, createEmbeddedChecklistItem, createId, editChecklistItemText,
  insertChecklistBlockAtSelection, isUnchangedPlainParagraph, noteBackgrounds, normalizeItemPositions, plainTextToHtml, removeChecklistItem,
  reorderItem, richHtmlToPlainText, toggleItem,
} from '../model';
import { pickNoteImage, removeNoteImage } from '../noteImages';
import { noteBackgroundColors, noteBackgroundLabels, noteMarginValues, pageInkColors, palette, resolvePageColor } from '../theme';
import { styles } from '../styles';
import type {
  EmbeddedChecklistBlock, EmbeddedChecklistItem, InlineImageBlock, Note, NoteAppearance, NoteBackground, NoteBlock,
  NoteFont, NoteLineHeight, NoteMargin, ParagraphBlock, PaperStyle,
} from '../types';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';
import { customNoteCss } from './customNoteCss';
import { DEFAULT_CUSTOM_NOTE_FONT_SIZE } from './formatting';

type ShallowEditorThemeOptions = Omit<EditorBridgeOptions, 'theme'> & {
  theme?: { webview?: StyleProp<ViewStyle>; webviewContainer?: StyleProp<ViewStyle> };
};

// TenTap's recursive theme type expands React Native 0.88's StyleProp until TypeScript hits its depth limit.
const useEditorBridgeWithTheme = useEditorBridge as unknown as (options?: ShallowEditorThemeOptions) => EditorBridge;

export function TextDocumentEditor({ note, firstParagraphInputRef, firstRichEditorRef, onBlocksChange, onBlocksCommit, onAppearanceChange, quickNoteToolbarMode = 'simple', themeMode = 'light' }: {
  note: Note;
  firstParagraphInputRef: MutableRefObject<TextInputInstance | null>;
  firstRichEditorRef: MutableRefObject<EditorBridge | null>;
  onBlocksChange: (blocks: NoteBlock[]) => void;
  onBlocksCommit: (blocks: NoteBlock[], obsoleteImageUris?: string[]) => Promise<boolean>;
  onAppearanceChange: (appearance: NoteAppearance) => void;
  quickNoteToolbarMode?: 'simple' | 'advanced';
  themeMode?: 'light' | 'dark';
}) {
  const isCustom = note.type === 'custom';
  const usesRichText = isCustom || (note.type === 'text' && quickNoteToolbarMode === 'advanced');
  const [pageStyleOpen, setPageStyleOpen] = useState(false);
  const [activeRichEditor, setActiveRichEditor] = useState<ActiveRichEditor | null>(null);
  const activeRichEditorRef = useRef<ActiveRichEditor | null>(null);
  const paragraphRefs = useRef(new Map<string, TextInputInstance>());
  const selections = useRef(new Map<string, { start: number; end: number }>());
  const focusedBlockId = useRef<string | null>(null);
  const focusAfterInsert = useRef<string | null>(null);
  const [paragraphHeights, setParagraphHeights] = useState<Record<string, number>>({});
  const { width: viewportWidth } = useWindowDimensions();
  const firstParagraphId = note.blocks.find((block) => block.type === 'paragraph')?.id;
  const pageColor = resolvePageColor(note.appearance, themeMode);
  const pageInk = pageInkColors(pageColor);
  const pageMargin = isCustom ? noteMarginValues[note.appearance.margin] : 0;

  const updateActiveRichEditor = useCallback((
    editor: EditorBridge,
    state: ReturnType<EditorBridge['getEditorState']>,
    blockId: string,
    alignment: 'left' | 'center' | 'right',
    spacing: 'compact' | 'normal' | 'relaxed',
    isFirst: boolean,
  ) => {
    const current = activeRichEditorRef.current;
    if (!state.isFocused && !(isFirst && state.isReady && !current) && current?.blockId !== blockId) return;

    const next = { editor, state, blockId, alignment, spacing } as ActiveRichEditor;
    activeRichEditorRef.current = next;

    // TenTap can return a fresh state object on each render even when no editor
    // state actually changed. Avoid feeding that identity change back into React
    // state, which otherwise creates a render/effect/update loop.
    if (
      current &&
      current.editor === editor &&
      current.blockId === blockId &&
      current.alignment === alignment &&
      current.spacing === spacing &&
      areEditorStatesEquivalent(current.state, next.state)
    ) return;

    setActiveRichEditor(next);
  }, []);

  useEffect(() => {
    const paragraphId = focusAfterInsert.current;
    if (!paragraphId) return;
    focusAfterInsert.current = null;
    const input = paragraphRefs.current.get(paragraphId);
    if (!input) return;
    input.focus();
    selections.current.set(paragraphId, { start: 0, end: 0 });
    input.setNativeProps({ selection: { start: 0, end: 0 } });
  }, [note.blocks]);

  const updateParagraph = (paragraphId: string, text: string) => {
    onBlocksChange(note.blocks.map((block) => block.id === paragraphId && block.type === 'paragraph'
      ? { ...block, text, richHtml: undefined }
      : block));
  };

  const updateRichParagraph = (paragraphId: string, richHtml: string, text: string) => {
    const current = note.blocks.find((block) => block.id === paragraphId && block.type === 'paragraph');
    if (current?.type === 'paragraph' && current.richHtml === richHtml && current.text === text) return;
    // Opening a note is not editing it: skip the editor's first report of unformatted text,
    // which would otherwise save the note again and move it to the top of the list.
    if (current?.type === 'paragraph' && isUnchangedPlainParagraph(current, richHtml)) return;
    onBlocksChange(note.blocks.map((block) => block.id === paragraphId && block.type === 'paragraph'
      ? { ...block, richHtml, text }
      : block));
  };

  const insertChecklist = () => {
    const focusedId = focusedBlockId.current;
    if (isCustom) {
      const focusedIndex = note.blocks.findIndex((block) => block.id === focusedId);
      const insertIndex = focusedIndex < 0 ? note.blocks.length : focusedIndex + 1;
      const checklist = createEmbeddedChecklistBlock(createId());
      const continuation: ParagraphBlock = { id: createId(), type: 'paragraph', text: '' };
      const blocks = [...note.blocks];
      blocks.splice(insertIndex, 0, checklist, continuation);
      focusedBlockId.current = continuation.id;
      onBlocksChange(blocks);
      return;
    }

    const paragraph = note.blocks.find((block) => block.id === focusedId && block.type === 'paragraph');
    const selection = paragraph?.type === 'paragraph'
      ? selections.current.get(paragraph.id) ?? { start: paragraph.text.length, end: paragraph.text.length }
      : null;
    const result = insertChecklistBlockAtSelection(
      note.blocks,
      paragraph?.type === 'paragraph' ? paragraph.id : null,
      selection,
      createId(),
      createId(),
    );
    focusAfterInsert.current = result.focusParagraphId;
    focusedBlockId.current = result.focusParagraphId;
    onBlocksChange(result.blocks);
  };

  const insertImage = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Images are not available', 'Add inline images from the Android or iOS app.');
      return;
    }
    try {
      const image = await pickNoteImage(note.id);
      if (!image) return;
      const focusedIndex = note.blocks.findIndex((block) => block.id === focusedBlockId.current);
      const insertIndex = focusedIndex < 0 ? note.blocks.length : focusedIndex + 1;
      const blocks = [...note.blocks];
      blocks.splice(insertIndex, 0, image);
      if (!(await onBlocksCommit(blocks))) await removeNoteImage(image.uri);
    } catch {
      Alert.alert('Could not add image', 'Please try choosing the image again.');
    }
  };

  const updateParagraphAlignment = (paragraphId: string, alignment: 'left' | 'center' | 'right') => {
    onBlocksChange(note.blocks.map((block) => block.id === paragraphId && block.type === 'paragraph'
      ? { ...block, alignment }
      : block));
  };

  const updateParagraphSpacing = (paragraphId: string, spacing: 'compact' | 'normal' | 'relaxed') => {
    onBlocksChange(note.blocks.map((block) => block.id === paragraphId && block.type === 'paragraph'
      ? { ...block, spacing }
      : block));
  };

  return (
    <View style={[styles.documentEditor, isCustom && styles.customDocumentEditor]}>
      {/* Custom Notes always carry their tools; Quick Notes only when rich formatting is switched on. */}
      {usesRichText ? (
        <FormattingToolbar
          active={activeRichEditor}
          defaultFontFamily={note.appearance.font}
          defaultFontSize={note.appearance.baseFontSize ?? DEFAULT_CUSTOM_NOTE_FONT_SIZE}
          showPageStyle={isCustom}
          onAlignmentChange={updateParagraphAlignment}
          onSpacingChange={updateParagraphSpacing}
          onInsertChecklist={insertChecklist}
          onInsertImage={() => void insertImage()}
          onOpenPageStyle={() => { if (isCustom) setPageStyleOpen(true); }}
        />
      ) : null}

      <ScrollView
        style={[styles.documentScroll, usesRichText && { backgroundColor: pageColor }]}
        contentContainerStyle={[styles.documentContent, isCustom && { paddingHorizontal: pageMargin }]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
      >
        {note.blocks.map((block) => block.type === 'paragraph' ? (
          usesRichText ? (
            <RichParagraphEditor
              key={block.id}
              block={block}
              appearance={note.appearance}
              themeMode={themeMode}
              alignment={block.alignment ?? 'left'}
              spacing={block.spacing ?? 'normal'}
              placeholder={note.blocks.length === 1 ? 'Start writing…' : 'Continue writing…'}
              focusedBlockId={focusedBlockId}
              firstEditorRef={firstRichEditorRef}
              isFirst={block.id === firstParagraphId}
              onEditorStateChange={updateActiveRichEditor}
              onChange={(html, text) => updateRichParagraph(block.id, html, text)}
            />
          ) : (
            <TextInput
              key={block.id}
              ref={(input) => {
                if (input) {
                  paragraphRefs.current.set(block.id, input);
                  if (block.id === firstParagraphId) firstParagraphInputRef.current = input;
                } else {
                  paragraphRefs.current.delete(block.id);
                  if (block.id === firstParagraphId) firstParagraphInputRef.current = null;
                }
              }}
              accessibilityLabel="Note text paragraph"
              value={block.text}
              onChangeText={(text) => updateParagraph(block.id, text)}
              onFocus={() => {
                focusedBlockId.current = block.id;
                if (!selections.current.has(block.id)) {
                  selections.current.set(block.id, { start: block.text.length, end: block.text.length });
                }
              }}
              onSelectionChange={({ nativeEvent }) => {
                focusedBlockId.current = block.id;
                selections.current.set(block.id, nativeEvent.selection);
              }}
              onContentSizeChange={({ nativeEvent }) => {
                const height = Math.max(44, Math.ceil(nativeEvent.contentSize.height) + 12);
                setParagraphHeights((current) => current[block.id] === height
                  ? current
                  : { ...current, [block.id]: height });
              }}
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              placeholder={note.blocks.length === 1 ? 'Start writing…' : 'Continue writing…'}
              placeholderTextColor={palette.faint}
              style={[styles.documentParagraphInput, { height: paragraphHeights[block.id] ?? 44, fontSize: note.appearance.quickFontSize ?? 16, color: note.appearance.quickTextColor ?? palette.ink, fontFamily: note.appearance.font === 'serif' ? 'serif' : undefined }]}
              selectionColor={palette.accent}
            />
          )
        ) : block.type === 'checklist' ? (
          <EmbeddedChecklistEditor
            key={block.id}
            noteId={note.id}
            block={block}
            inkColor={usesRichText ? pageInk.ink : undefined}
            hintColor={usesRichText ? pageInk.faint : undefined}
            onItemsChange={(items) => onBlocksChange(note.blocks.map((candidate) =>
              candidate.id === block.id && candidate.type === 'checklist'
                ? { ...candidate, items }
                : candidate,
            ))}
            onRemove={() => Alert.alert('Remove checklist?', 'This removes the checklist and its items from this note.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove checklist', style: 'destructive', onPress: () => {
                const nextBlocks = note.blocks.filter((candidate) => candidate.id !== block.id);
                onBlocksChange(nextBlocks.length ? nextBlocks : [{ id: createId(), type: 'paragraph', text: '' }]);
              } },
            ])}
          />
        ) : (
          <InlineNoteImage
            key={block.id}
            noteId={note.id}
            image={block}
            blocks={note.blocks}
            availableWidth={Math.max(1, viewportWidth - 16 - pageMargin * 2)}
            onBlocksCommit={onBlocksCommit}
          />
        ))}
      </ScrollView>
      {isCustom ? (
        <PageStyleModal
          visible={pageStyleOpen}
          appearance={note.appearance}
          onClose={() => setPageStyleOpen(false)}
          onChange={onAppearanceChange}
        />
      ) : null}
    </View>
  );
}

function areEditorStatesEquivalent(previous: ActiveRichEditor['state'], next: ActiveRichEditor['state']): boolean {
  const previousValues = previous as unknown as Record<string, unknown>;
  const nextValues = next as unknown as Record<string, unknown>;
  const previousKeys = Object.keys(previousValues);
  const nextKeys = Object.keys(nextValues);
  if (previousKeys.length !== nextKeys.length) return false;

  const equivalentValue = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((value, index) => equivalentValue(value, b[index]));
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const aRecord = a as Record<string, unknown>;
      const bRecord = b as Record<string, unknown>;
      const aKeys = Object.keys(aRecord);
      const bKeys = Object.keys(bRecord);
      return aKeys.length === bKeys.length && aKeys.every((key) =>
        Object.prototype.hasOwnProperty.call(bRecord, key) && equivalentValue(aRecord[key], bRecord[key]),
      );
    }
    return false;
  };

  return nextKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(previousValues, key) && equivalentValue(previousValues[key], nextValues[key]),
  );
}

function RichParagraphEditor({ block, appearance, themeMode, alignment, spacing, placeholder, focusedBlockId, firstEditorRef, isFirst, onEditorStateChange, onChange }: {
  block: ParagraphBlock;
  appearance: NoteAppearance;
  themeMode: 'light' | 'dark';
  alignment: 'left' | 'center' | 'right';
  spacing: 'compact' | 'normal' | 'relaxed';
  placeholder: string;
  focusedBlockId: MutableRefObject<string | null>;
  firstEditorRef: MutableRefObject<EditorBridge | null>;
  isFirst: boolean;
  onEditorStateChange: (
    editor: EditorBridge,
    state: ReturnType<EditorBridge['getEditorState']>,
    blockId: string,
    alignment: 'left' | 'center' | 'right',
    spacing: 'compact' | 'normal' | 'relaxed',
    isFirst: boolean,
  ) => void;
  onChange: (html: string, text: string) => void;
}) {
  const backgroundColor = resolvePageColor(appearance, themeMode);
  const editorTheme = {
    webview: { backgroundColor },
    webviewContainer: { backgroundColor },
  };
  const editor = useEditorBridgeWithTheme({
    initialContent: block.richHtml ?? plainTextToHtml(block.text),
    customSource: editorHtml,
    bridgeExtensions: [...TenTapStartKit, NoteFontFormattingBridge],
    autofocus: false,
    avoidKeyboard: true,
    dynamicHeight: true,
    scrollBottomOffset: 18,
    theme: editorTheme,
  });
  const editorState = useBridgeState(editor);
  const html = useEditorContent(editor, { type: 'html', debounceInterval: 220 });

  useEffect(() => {
    if (!isFirst) return;
    firstEditorRef.current = editor;
    return () => {
      if (firstEditorRef.current === editor) firstEditorRef.current = null;
    };
  }, [editor, firstEditorRef, isFirst]);

  useEffect(() => {
    if (editorState.isFocused) focusedBlockId.current = block.id;
  }, [block.id, editorState.isFocused, focusedBlockId]);

  useEffect(() => {
    if (!editorState.isReady) return;
    if (editorState.isFocused || isFirst) {
      onEditorStateChange(editor, editorState, block.id, alignment, spacing, isFirst);
    }
  }, [alignment, block.id, editor, editorState, isFirst, onEditorStateChange, spacing]);

  useEffect(() => {
    if (!editorState.isReady) return;
    editor.injectCSS(customNoteCss(appearance, alignment, spacing, themeMode), 'page-style');
    editor.setPlaceholder(placeholder);
  }, [alignment, appearance, editor, editorState.isReady, placeholder, spacing, themeMode]);

  useEffect(() => {
    if (typeof html !== 'string') return;
    const text = richHtmlToPlainText(html);
    if (block.richHtml === html && block.text === text) return;
    if (isUnchangedPlainParagraph(block, html)) return;
    onChange(html, text);
  }, [block.richHtml, block.text, html, onChange]);

  return (
    <View style={[styles.richParagraphFrame, { backgroundColor }]}>
      <RichText
        accessibilityLabel="Formatted note text"
        editor={editor}
        style={styles.richParagraph}
        scrollEnabled={false}
        nestedScrollEnabled
      />
    </View>
  );
}

const pageThemes: Array<{ label: string; background: NoteBackground; paper: PaperStyle; font: NoteFont }> = [
  { label: 'Clean', background: 'warmWhite', paper: 'plain', font: 'sans' },
  { label: 'Notebook', background: 'cream', paper: 'lined', font: 'serif' },
  { label: 'Journal', background: 'sand', paper: 'dotted', font: 'serif' },
  { label: 'Blueprint', background: 'blue', paper: 'grid', font: 'mono' },
  { label: 'Blossom', background: 'pink', paper: 'plain', font: 'sans' },
  { label: 'Night', background: 'graphite', paper: 'plain', font: 'sans' },
  { label: 'Midnight', background: 'midnight', paper: 'dotted', font: 'mono' },
];
const pageFontFamilies: Record<NoteFont, string | undefined> = { sans: undefined, serif: 'serif', mono: 'monospace' };
const pageFontLabels: Record<NoteFont, string> = { sans: 'Sans', serif: 'Serif', mono: 'Mono' };
const lineHeightLabels: Record<NoteLineHeight, string> = { tight: 'Tight', normal: 'Normal', loose: 'Loose' };
const textSizeLabels: Record<number, string> = { 16: 'Small', 18: 'Medium', 20: 'Large', 22: 'Extra large' };

function PageStyleModal({ visible, appearance, onClose, onChange }: {
  visible: boolean;
  appearance: NoteAppearance;
  onClose: () => void;
  onChange: (appearance: NoteAppearance) => void;
}) {
  const [customColorDraft, setCustomColorDraft] = useState(appearance.customBackgroundColor ?? '');
  const setBackground = (background: NoteBackground) => onChange({ ...appearance, background, customBackgroundColor: undefined });
  const setCustomColor = (color: string) => {
    const normalized = (color.trim().startsWith('#') ? color.trim() : `#${color.trim()}`).toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(normalized)) {
      setCustomColorDraft(normalized);
      onChange({ ...appearance, customBackgroundColor: normalized });
    }
  };
  const setPaper = (paper: PaperStyle) => onChange({ ...appearance, paper });
  const setMargin = (margin: NoteMargin) => onChange({ ...appearance, margin });
  const papers: PaperStyle[] = ['plain', 'lined', 'dotted', 'grid'];
  const margins: NoteMargin[] = ['narrow', 'comfortable', 'wide'];
  const baseFontSize = appearance.baseFontSize ?? DEFAULT_CUSTOM_NOTE_FONT_SIZE;
  const lineHeight = appearance.lineHeight ?? 'normal';
  return (
    <Sheet visible={visible} title="Page style" onClose={onClose} scrollable>
      <View style={styles.pageStyleBody}>
        <Text style={styles.pageStyleLabel}>Themes</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pageThemeRow}>
          {pageThemes.map((theme) => {
            const color = resolvePageColor({ background: theme.background });
            const ink = pageInkColors(color);
            const selected = !appearance.customBackgroundColor && appearance.background === theme.background &&
              appearance.paper === theme.paper && appearance.font === theme.font;
            return (
              <Pressable
                key={theme.label}
                accessibilityRole="button"
                accessibilityLabel={`${theme.label} page theme`}
                accessibilityState={{ selected }}
                onPress={() => onChange({ ...appearance, background: theme.background, paper: theme.paper, font: theme.font, customBackgroundColor: undefined })}
                style={styles.pageThemeCard}
              >
                <View style={[styles.pageThemePreview, { backgroundColor: color }, selected && styles.pageThemePreviewSelected]}>
                  <Text style={{ color: ink.ink, fontSize: 20, fontWeight: '700', fontFamily: pageFontFamilies[theme.font] }}>Aa</Text>
                  <View style={[styles.pageThemeLine, { backgroundColor: ink.rule, width: '100%' }]} />
                  <View style={[styles.pageThemeLine, { backgroundColor: ink.rule, width: '100%' }]} />
                  <View style={[styles.pageThemeLine, { backgroundColor: ink.rule, width: '60%' }]} />
                </View>
                <Text style={styles.pageThemeLabel}>{theme.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.pageStyleLabel}>Page colour</Text>
        <View style={styles.pageSwatchGrid}>
          {noteBackgrounds.map((background) => {
            const color = resolvePageColor({ background });
            // In the light theme the default page is already white, so the two share one swatch.
            if (background === 'white' && color === resolvePageColor({ background: 'warmWhite' })) return null;
            const selected = !appearance.customBackgroundColor && resolvePageColor(appearance) === color;
            return (
              <Pressable
                key={background}
                accessibilityRole="button"
                accessibilityLabel={`${noteBackgroundLabels[background]} page colour`}
                accessibilityState={{ selected }}
                onPress={() => setBackground(background)}
                style={[styles.pageSwatch, { backgroundColor: color }, selected && styles.pageSwatchSelected]}
              >
                {selected ? <Icon name="check" size={18} color={pageInkColors(color).ink} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.customColorInputRow}>
          <TextInput
            accessibilityLabel="Custom page color hex value"
            value={customColorDraft}
            onChangeText={setCustomColorDraft}
            onEndEditing={() => setCustomColor(customColorDraft)}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            placeholder="Your own colour, e.g. #E9E1FA"
            placeholderTextColor={palette.faint}
            style={styles.customColorInput}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Apply custom page colour" onPress={() => setCustomColor(customColorDraft)} style={styles.pageStyleDoneButton}>
            <Text style={styles.pageStyleDoneText}>Apply</Text>
          </Pressable>
        </View>

        <Text style={styles.pageStyleLabel}>Paper</Text>
        <View style={styles.pageStyleOptions}>
          {papers.map((paper) => (
            <PageStyleChoice
              key={paper}
              selected={appearance.paper === paper}
              label={paper[0].toUpperCase() + paper.slice(1)}
              onPress={() => setPaper(paper)}
            />
          ))}
        </View>

        <Text style={styles.pageStyleLabel}>Font</Text>
        <View style={styles.pageStyleOptions}>
          {(Object.keys(pageFontLabels) as NoteFont[]).map((font) => (
            <PageStyleChoice
              key={font}
              selected={appearance.font === font}
              label={pageFontLabels[font]}
              fontFamily={pageFontFamilies[font]}
              onPress={() => onChange({ ...appearance, font })}
            />
          ))}
        </View>

        <Text style={styles.pageStyleLabel}>Text size</Text>
        <View style={styles.pageStyleOptions}>
          {NOTE_BASE_FONT_SIZES.map((size) => (
            <PageStyleChoice
              key={size}
              selected={baseFontSize === size}
              label={textSizeLabels[size]}
              onPress={() => onChange({ ...appearance, baseFontSize: size })}
            />
          ))}
        </View>

        <Text style={styles.pageStyleLabel}>Line spacing</Text>
        <View style={styles.pageStyleOptions}>
          {(Object.keys(lineHeightLabels) as NoteLineHeight[]).map((option) => (
            <PageStyleChoice
              key={option}
              selected={lineHeight === option}
              label={lineHeightLabels[option]}
              onPress={() => onChange({ ...appearance, lineHeight: option })}
            />
          ))}
        </View>

        <Text style={styles.pageStyleLabel}>Margins</Text>
        <View style={styles.pageStyleOptions}>
          {margins.map((margin) => (
            <PageStyleChoice
              key={margin}
              selected={appearance.margin === margin}
              label={margin[0].toUpperCase() + margin.slice(1)}
              onPress={() => setMargin(margin)}
            />
          ))}
        </View>
      </View>
    </Sheet>
  );
}

function PageStyleChoice({ selected, label, fontFamily, onPress }: { selected: boolean; label: string; fontFamily?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.pageStyleChoice, selected && styles.pageStyleOptionSelected]}
    >
      <Text style={[styles.pageStyleOptionText, fontFamily ? { fontFamily } : null, selected && styles.pageStyleOptionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function InlineNoteImage({ noteId, image, blocks, availableWidth, onBlocksCommit }: {
  noteId: string;
  image: InlineImageBlock;
  blocks: NoteBlock[];
  availableWidth: number;
  onBlocksCommit: (blocks: NoteBlock[], obsoleteImageUris?: string[]) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [imageSelected, setImageSelected] = useState(false);
  const dragEnabledRef = useRef(false);
  const [scalePreview, setScalePreview] = useState<number | null>(null);
  const imageAspect = image.width / image.height;
  const imageScale = Math.max(0.2, Math.min(1.5, image.scale ?? 1));
  const displayedScale = scalePreview ?? imageScale;
  const requestedWidth = availableWidth * displayedScale;
  const imageHeight = Math.min(requestedWidth / imageAspect, 480);
  const imageWidth = imageHeight * imageAspect;
  const [offset, setOffset] = useState({ x: image.offsetX ?? 0, y: image.offsetY ?? 0 });
  const offsetRef = useRef(offset);
  const dragOrigin = useRef(offset);
  const scaleOrigin = useRef(imageScale);
  const resizeCorners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const;
  const clampOffset = (x: number, y: number) => ({
    x: Math.max(-0.5, Math.min(0.5, x)),
    y: Math.max(-1, Math.min(1, y)),
  });
  useEffect(() => {
    const savedOffset = clampOffset(image.offsetX ?? 0, image.offsetY ?? 0);
    offsetRef.current = savedOffset;
    setOffset(savedOffset);
  }, [image.offsetX, image.offsetY]);

  const commitOffset = useCallback(async (x: number, y: number) => {
    const previous = dragOrigin.current;
    const next = clampOffset(x, y);
    offsetRef.current = next;
    setOffset(next);
    setBusy(true);
    try {
      const saved = await onBlocksCommit(blocks.map((block) => block.id === image.id && block.type === 'image'
        ? { ...block, offsetX: next.x, offsetY: next.y }
        : block));
      if (!saved) throw new Error('Image position was not saved.');
    } catch {
      offsetRef.current = previous;
      setOffset(previous);
      Alert.alert('Could not move image', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [blocks, image.id, onBlocksCommit]);
  const persistScale = useCallback(async (nextScale: number) => {
    const clamped = Math.round(Math.max(0.2, Math.min(1.5, nextScale)) * 100) / 100;
    if (clamped === imageScale || busy) return;
    setBusy(true);
    try {
      const saved = await onBlocksCommit(blocks.map((block) => block.id === image.id && block.type === 'image'
        ? { ...block, scale: clamped }
        : block));
      if (!saved) throw new Error('Image size was not saved.');
    } catch {
      Alert.alert('Could not resize image', 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [blocks, busy, image.id, imageScale, onBlocksCommit]);

  const resizeResponders = useMemo(() => {
    const createResizeResponder = (corner: typeof resizeCorners[number]) => PanResponder.create({
      onStartShouldSetPanResponder: () => !busy,
      onMoveShouldSetPanResponder: (_event, gesture) => !busy && Math.hypot(gesture.dx, gesture.dy) > 2,
      onPanResponderGrant: () => { scaleOrigin.current = imageScale; },
      onPanResponderMove: (_event, gesture) => {
        const horizontal = corner.endsWith('Right') ? gesture.dx : -gesture.dx;
        const vertical = corner.startsWith('bottom') ? gesture.dy : -gesture.dy;
        const delta = (horizontal + vertical) / Math.max(availableWidth * 1.7, 1);
        setScalePreview(Math.max(0.2, Math.min(1.5, scaleOrigin.current + delta)));
      },
      onPanResponderRelease: (_event, gesture) => {
        const horizontal = corner.endsWith('Right') ? gesture.dx : -gesture.dx;
        const vertical = corner.startsWith('bottom') ? gesture.dy : -gesture.dy;
        const delta = (horizontal + vertical) / Math.max(availableWidth * 1.7, 1);
        const next = Math.max(0.2, Math.min(1.5, scaleOrigin.current + delta));
        setScalePreview(null);
        void persistScale(next);
      },
      onPanResponderTerminate: () => setScalePreview(null),
    });
    return {
      topLeft: createResizeResponder('topLeft'),
      topRight: createResizeResponder('topRight'),
      bottomLeft: createResizeResponder('bottomLeft'),
      bottomRight: createResizeResponder('bottomRight'),
    };
  }, [availableWidth, busy, imageScale, persistScale]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => dragEnabledRef.current && !busy && Math.hypot(gesture.dx, gesture.dy) > 3,
    onPanResponderGrant: () => { dragOrigin.current = offsetRef.current; },
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_event, gesture) => {
      const next = clampOffset(
        dragOrigin.current.x + gesture.dx / Math.max(availableWidth, 1),
        dragOrigin.current.y + gesture.dy / Math.max(availableWidth, 1),
      );
      offsetRef.current = next;
      setOffset(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      dragEnabledRef.current = false;
        void commitOffset(
        dragOrigin.current.x + gesture.dx / Math.max(availableWidth, 1),
        dragOrigin.current.y + gesture.dy / Math.max(availableWidth, 1),
      );
    },
    onPanResponderTerminate: () => {
      dragEnabledRef.current = false;
        offsetRef.current = dragOrigin.current;
      setOffset(dragOrigin.current);
    },
  }), [availableWidth, busy, commitOffset]);

  const handleImageLongPress = () => {
    dragEnabledRef.current = true;
    setImageSelected(true);
  };

  const closeImageSelection = () => {
    dragEnabledRef.current = false;
    setImageSelected(false);
  };

  const replaceImage = async () => {
    setBusy(true);
    try {
      const nextImage = await pickNoteImage(noteId);
      if (!nextImage) return;
      const nextBlocks = blocks.map((block) => block.id === image.id ? nextImage : block);
      if (!(await onBlocksCommit(nextBlocks, [image.uri]))) await removeNoteImage(nextImage.uri);
    } catch {
      Alert.alert('Could not replace image', 'Please choose another image.');
    } finally {
      setBusy(false);
    }
  };

  const removeImage = () => {
    Alert.alert('Remove this image?', 'The image will be removed from this note.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void onBlocksCommit(blocks.filter((block) => block.id !== image.id), [image.uri])
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  return (
    <View style={styles.inlineImageContainer}>
      {imageUnavailable ? (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel="Image unavailable on this device. Replace or remove it."
          style={[styles.inlineImageUnavailable, { width: imageWidth, height: imageHeight, transform: [{ translateX: offset.x * availableWidth }, { translateY: offset.y * availableWidth }] }]}
        >
          <Text style={styles.inlineImageUnavailableText}>Image unavailable on this device</Text>
        </View>
      ) : (
        <View style={{ alignSelf: 'center', position: 'relative', width: imageWidth, height: imageHeight, transform: [{ translateX: offset.x * availableWidth }, { translateY: offset.y * availableWidth }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hold and drag to move image"
            accessibilityActions={[
              { name: 'moveLeft', label: 'Move image left' },
              { name: 'moveRight', label: 'Move image right' },
              { name: 'moveUp', label: 'Move image up' },
              { name: 'moveDown', label: 'Move image down' },
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              const current = offsetRef.current;
              dragOrigin.current = current;
              const step = 0.08;
              void commitOffset(
                current.x + (nativeEvent.actionName === 'moveRight' ? step : nativeEvent.actionName === 'moveLeft' ? -step : 0),
                current.y + (nativeEvent.actionName === 'moveDown' ? step : nativeEvent.actionName === 'moveUp' ? -step : 0),
              );
            }}
            onLongPress={handleImageLongPress}
            delayLongPress={350}
            disabled={busy}
            {...panResponder.panHandlers}
          >
            <Image
              accessibilityLabel="Image in custom note"
              source={{ uri: image.uri }}
              resizeMode="contain"
              onError={() => setImageUnavailable(true)}
              style={{ width: imageWidth, height: imageHeight, borderRadius: 12 }}
            />
          </Pressable>
          {imageSelected ? resizeCorners.map((corner) => (
            <View
              key={corner}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={`Resize image from ${corner.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}`}
              {...resizeResponders[corner].panHandlers}
              style={[styles.inlineImageResizeHandle, corner === 'topLeft' ? styles.inlineImageResizeTopLeft : corner === 'topRight' ? styles.inlineImageResizeTopRight : corner === 'bottomLeft' ? styles.inlineImageResizeBottomLeft : styles.inlineImageResizeBottomRight]}
            />
          )) : null}
        </View>
      )}
      {imageSelected ? (
        <View style={styles.inlineImageActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Replace image"
            disabled={busy}
            onPress={() => void replaceImage()}
            style={styles.inlineImageAction}
          >
            <Text style={styles.inlineImageActionText}>{busy ? 'Saving…' : 'Replace'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove image"
            disabled={busy}
            onPress={removeImage}
            style={styles.inlineImageAction}
          >
            <Text style={styles.inlineImageRemoveText}>Remove</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Done editing image"
            onPress={closeImageSelection}
            style={styles.inlineImageAction}
          >
            <Text style={styles.inlineImageActionText}>Done</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function EmbeddedChecklistEditor({ noteId, block, inkColor, hintColor, onItemsChange, onRemove }: {
  noteId: string;
  block: EmbeddedChecklistBlock;
  /** Text and hint colours for a page whose background differs from the app's. */
  inkColor?: string;
  hintColor?: string;
  onItemsChange: (items: EmbeddedChecklistItem[]) => void;
  onRemove: () => void;
}) {
  const [newItemText, setNewItemText] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const addItem = (text: string) => {
    if (!canAddChecklistItem(text)) return;
    const item = createEmbeddedChecklistItem(noteId, block.id, text, block.items.length);
    if (!item) return;
    onItemsChange([...block.items, item]);
    setNewItemText('');
  };

  const moveByAccessibilityAction = (itemId: string, actionName: string) => {
    if (actionName !== 'moveUp' && actionName !== 'moveDown') return;
    const currentIndex = block.items.findIndex((item) => item.id === itemId);
    const nextIndex = currentIndex + (actionName === 'moveUp' ? -1 : 1);
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= block.items.length) return;
    onItemsChange(reorderItem(block.items, itemId, nextIndex));
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<EmbeddedChecklistItem>) => {
    if (editingItemId === item.id) {
      return (
        <View style={styles.editingItem}>
          <TextInput
            accessibilityLabel={`Edit ${item.text || 'list item'}`}
            value={editingText}
            onChangeText={setEditingText}
            autoFocus
            multiline
            textAlignVertical="top"
            placeholder="List item"
            placeholderTextColor={palette.faint}
            style={styles.itemEditInput}
            selectionColor={palette.accent}
          />
          <View style={styles.itemEditActions}>
            <Pressable accessibilityRole="button" onPress={() => {
              onItemsChange(normalizeItemPositions(removeChecklistItem(block.items, item.id)));
              setEditingItemId(null);
              setEditingText('');
              Keyboard.dismiss();
            }} style={styles.itemActionButton}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => {
              setEditingItemId(null);
              setEditingText('');
              Keyboard.dismiss();
            }} style={styles.itemActionButton}>
              <Text style={styles.mutedActionText}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => {
              onItemsChange(editChecklistItemText(block.items, item.id, editingText));
              setEditingItemId(null);
              setEditingText('');
              Keyboard.dismiss();
            }} style={[styles.itemActionButton, styles.itemSaveButton]}>
              <Text style={styles.itemSaveText}>Done</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.embeddedChecklistRow, isActive && styles.checklistRowActive]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          accessibilityLabel={`${item.text || 'Empty item'}, ${item.checked ? 'completed' : 'not completed'}`}
          accessibilityActions={[
            { name: 'moveUp', label: 'Move item up' },
            { name: 'moveDown', label: 'Move item down' },
          ]}
          onAccessibilityAction={(event) => moveByAccessibilityAction(item.id, event.nativeEvent.actionName)}
          onLongPress={drag}
          delayLongPress={450}
          onPress={() => onItemsChange(toggleItem(block.items, item.id))}
          style={({ pressed }) => [styles.embeddedChecklistToggleArea, pressed && styles.rowPressed]}
        >
          <View style={[styles.embeddedChecklistCheckbox, item.checked && styles.checkboxChecked]}>
            {item.checked ? <Icon name="check" size={13} color={palette.onAccent} strokeWidth={2.8} /> : null}
          </View>
          <ChecklistItemLabel text={item.text} checked={item.checked} color={inkColor} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.text || 'list item'}`}
          onPress={() => { setEditingItemId(item.id); setEditingText(item.text); }}
          style={({ pressed }) => [styles.editItemButton, pressed && styles.pressed]}
        >
          <Icon name="pen" size={18} color={hintColor ?? palette.faint} />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.embeddedChecklist}>
      {block.items.length > 0 ? (
        <DraggableFlatList
          data={block.items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onDragEnd={({ data }) => onItemsChange(normalizeItemPositions(data))}
          activationDistance={4}
          scrollEnabled={false}
          keyboardShouldPersistTaps="always"
        />
      ) : null}
      <View style={styles.embeddedAddItemBar}>
        <TextInput
          accessibilityLabel="New checklist item"
          value={newItemText}
          onChangeText={setNewItemText}
          onSubmitEditing={({ nativeEvent }) => addItem(nativeEvent.text ?? newItemText)}
          submitBehavior="submit"
          placeholder="Add checklist item"
          placeholderTextColor={hintColor ?? palette.faint}
          returnKeyType="done"
          style={[styles.embeddedItemInput, inkColor ? { color: inkColor } : null]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add checklist item"
          disabled={!canAddChecklistItem(newItemText)}
          onPress={() => addItem(newItemText)}
          style={({ pressed }) => [styles.embeddedAddItemButton, pressed && styles.pressed, !canAddChecklistItem(newItemText) && styles.addItemDisabled]}
        >
          <Icon name="plus" size={20} color={palette.accent} strokeWidth={2.2} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Remove checklist" onPress={onRemove} hitSlop={8} style={styles.embeddedRemoveButton}>
          <Icon name="close" size={16} color={hintColor ?? palette.faint} />
        </Pressable>
      </View>
    </View>
  );
}
