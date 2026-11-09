import { ChecklistItemLabel } from '../lists/ChecklistItemLabel';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import {
  Alert, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type ScrollViewInstance, type StyleProp, type TextInputInstance, type ViewInstance, type ViewStyle,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { RichText, TenTapStartKit, useBridgeState, useEditorBridge, useEditorContent, type EditorBridge, type EditorBridgeOptions } from '@10play/tentap-editor';
import { FormattingToolbar, type ActiveRichEditor } from './FormattingToolbar';
import { NoteFontFormattingBridge } from './fontFormattingBridge';
import { editorHtml } from '../../editor-web/build/editorHtml';
import {
  canAddChecklistItem, createEmbeddedChecklistBlock, createEmbeddedChecklistItem, createId, editChecklistItemText,
  insertChecklistBlockAtSelection, placeImageBlock, normalizeItemPositions, removeChecklistItem, reorderItem, richHtmlToPlainText, toggleItem,
} from '../model';
import { pickNoteImage, removeNoteImage } from '../noteImages';
import { noteBackgroundColors, noteBackgroundLabels, noteMarginValues, palette } from '../theme';
import { styles } from '../styles';
import type {
  EmbeddedChecklistBlock, EmbeddedChecklistItem, ImageWrap, InlineImageBlock, Note, NoteAppearance, NoteBackground, NoteBlock,
  NoteMargin, ParagraphBlock, ParagraphSpacing, PaperStyle,
} from '../types';
import { customNoteCss } from './customNoteCss';
import { ImageActionsBar, InlineNoteImage, imageBoxSize, maxScaleFor, type ImageDragCallbacks } from './InlineNoteImage';

/** Top of a wrapped image inside its paragraph; matches the editor body's top padding. */
const WRAP_TOP = 12;
/** Top of an inline image inside its container (margin + padding in inlineImageContainer). */
const INLINE_IMAGE_TOP = 14;

type FloatSpace = { side: 'left' | 'right'; width: number; height: number };

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
  const pageColor = note.appearance.customBackgroundColor ?? (themeMode === 'dark' && note.appearance.background === 'warmWhite' ? palette.background : noteBackgroundColors[note.appearance.background]);
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

  // ---- Images: selection, resizing, wrapping and drag-to-place ----
  const contentWidth = Math.max(1, viewportWidth - 16 - pageMargin * 2);
  const blocksRef = useRef(note.blocks);
  blocksRef.current = note.blocks;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollFrameRef = useRef<ViewInstance>(null);
  const scrollY = useRef(0);
  const scrollFrame = useRef({ y: 0, height: 0 });
  const unitLayouts = useRef(new Map<string, { y: number; height: number }>());
  const dragging = useRef<{ imageId: string; startContentY: number; startScrollY: number } | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{ id: string; scale: number } | null>(null);
  const [unavailableImages, setUnavailableImages] = useState<ReadonlySet<string>>(() => new Set());
  const [imageBusy, setImageBusy] = useState(false);
  const [drop, setDrop] = useState<{ imageId: string; beforeBlockId: string | null; wrap: ImageWrap; y: number } | null>(null);

  // Render units: a wrapped image is drawn together with the paragraph after it.
  const units: { key: string; blocks: NoteBlock[] }[] = [];
  for (let index = 0; index < note.blocks.length; index += 1) {
    const block = note.blocks[index];
    const next = note.blocks[index + 1];
    if (usesRichText && block.type === 'image' && (block.wrap === 'left' || block.wrap === 'right') && next?.type === 'paragraph') {
      units.push({ key: next.id, blocks: [block, next] });
      index += 1;
    } else {
      units.push({ key: block.id, blocks: [block] });
    }
  }
  const unitsRef = useRef(units);
  unitsRef.current = units;

  const commitImageBlocks = async (blocks: NoteBlock[], obsoleteImageUris?: string[]) => {
    setImageBusy(true);
    try {
      return await onBlocksCommit(blocks, obsoleteImageUris);
    } finally {
      setImageBusy(false);
    }
  };

  /** Place an image and shrink it if it becomes wrapped while wider than a wrapped image may be. */
  const placeImage = (imageId: string, beforeBlockId: string | null, wrap: ImageWrap) => {
    const placed = placeImageBlock(blocksRef.current, imageId, beforeBlockId, wrap, createId());
    return placed.map((block) => block.id === imageId && block.type === 'image' && (block.scale ?? 1) > maxScaleFor(wrap)
      ? { ...block, scale: 0.5 }
      : block);
  };

  const sameLayout = (a: NoteBlock[], b: NoteBlock[]) => a.length === b.length && a.every((block, index) => {
    const other = b[index];
    return block.id === other.id && (block.type !== 'image' || (other.type === 'image' && (block.wrap ?? 'none') === (other.wrap ?? 'none') && block.scale === other.scale));
  });

  const changeImageWrap = async (imageId: string, wrap: ImageWrap) => {
    const blocks = blocksRef.current;
    const index = blocks.findIndex((block) => block.id === imageId);
    if (index < 0) return;
    const next = placeImage(imageId, blocks[index + 1]?.id ?? null, wrap);
    if (!sameLayout(blocks, next)) await commitImageBlocks(next);
  };

  const resizeImage = async (imageId: string, scale: number) => {
    const blocks = blocksRef.current;
    const next = blocks.map((block) => block.id === imageId && block.type === 'image' ? { ...block, scale } : block);
    if (!sameLayout(blocks, next)) await commitImageBlocks(next);
  };

  const moveImageByAction = (imageId: string, action: string) => {
    const blocks = blocksRef.current;
    const index = blocks.findIndex((block) => block.id === imageId);
    const image = blocks[index];
    if (index < 0 || image.type !== 'image') return;
    const wrap = image.wrap ?? 'none';
    if (action === 'moveUp' && index > 0) void commitImageBlocks(placeImage(imageId, blocks[index - 1].id, wrap));
    if (action === 'moveDown' && index < blocks.length - 1) void commitImageBlocks(placeImage(imageId, blocks[index + 2]?.id ?? null, wrap));
    if (action === 'moveLeft' && wrap !== 'left') void changeImageWrap(imageId, wrap === 'right' ? 'none' : 'left');
    if (action === 'moveRight' && wrap !== 'right') void changeImageWrap(imageId, wrap === 'left' ? 'none' : 'right');
  };

  const replaceImage = async (image: InlineImageBlock) => {
    setImageBusy(true);
    try {
      const nextImage = await pickNoteImage(note.id);
      if (!nextImage) return;
      const replacement: InlineImageBlock = { ...nextImage, id: image.id, ...(image.wrap ? { wrap: image.wrap } : {}), ...(image.scale ? { scale: image.scale } : {}) };
      const nextBlocks = blocksRef.current.map((block) => block.id === image.id ? replacement : block);
      if (!(await onBlocksCommit(nextBlocks, [image.uri]))) await removeNoteImage(nextImage.uri);
      setUnavailableImages((current) => {
        const next = new Set(current);
        next.delete(image.id);
        return next;
      });
    } catch {
      Alert.alert('Could not replace image', 'Please choose another image.');
    } finally {
      setImageBusy(false);
    }
  };

  const removeImage = (image: InlineImageBlock) => {
    Alert.alert('Remove this image?', 'The image will be removed from this note.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        setSelectedImageId(null);
        void commitImageBlocks(blocksRef.current.filter((block) => block.id !== image.id), [image.uri]);
      } },
    ]);
  };

  const computeDrop = (imageId: string, absoluteX: number, contentY: number) => {
    const relativeX = absoluteX / Math.max(viewportWidth, 1);
    const wrap: ImageWrap = relativeX < 0.33 ? 'left' : relativeX > 0.67 ? 'right' : 'none';
    let beforeBlockId: string | null = null;
    let y = 0;
    for (const unit of unitsRef.current) {
      const target = unit.blocks.find((block) => block.id !== imageId);
      const layout = unitLayouts.current.get(unit.key);
      if (!target || !layout) continue;
      if (layout.y + layout.height / 2 > contentY) {
        beforeBlockId = target.id;
        y = layout.y;
        break;
      }
      y = layout.y + layout.height;
    }
    return { imageId, beforeBlockId, wrap, y };
  };

  const fingerContentY = (translationY: number) => {
    const current = dragging.current;
    if (!current) return 0;
    return current.startContentY + translationY + (scrollY.current - current.startScrollY);
  };

  const dragCallbacks: ImageDragCallbacks = {
    onDragStart: (imageId, fingerOffsetY) => {
      const unit = unitsRef.current.find((candidate) => candidate.blocks.some((block) => block.id === imageId));
      const layout = unit ? unitLayouts.current.get(unit.key) : undefined;
      const imageTop = (layout?.y ?? 0) + (unit && unit.blocks.length > 1 ? WRAP_TOP : INLINE_IMAGE_TOP);
      dragging.current = { imageId, startContentY: imageTop + fingerOffsetY, startScrollY: scrollY.current };
      setSelectedImageId(null);
      Keyboard.dismiss();
    },
    onDragMove: (absoluteX, absoluteY, translationY) => {
      const current = dragging.current;
      if (!current) return;
      // Auto-scroll when the finger nears the top or bottom of the note.
      const frame = scrollFrame.current;
      if (frame.height > 0 && absoluteY < frame.y + 72) scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current - 18), animated: false });
      else if (frame.height > 0 && absoluteY > frame.y + frame.height - 72) scrollRef.current?.scrollTo({ y: scrollY.current + 18, animated: false });
      const next = computeDrop(current.imageId, absoluteX, fingerContentY(translationY));
      setDrop((previous) => previous && previous.beforeBlockId === next.beforeBlockId && previous.wrap === next.wrap && previous.y === next.y ? previous : next);
    },
    onDragEnd: (absoluteX, _absoluteY, translationY) => {
      const current = dragging.current;
      dragging.current = null;
      setDrop(null);
      if (!current) return;
      const target = computeDrop(current.imageId, absoluteX, fingerContentY(translationY));
      const next = placeImage(current.imageId, target.beforeBlockId, target.wrap);
      if (!sameLayout(blocksRef.current, next)) void commitImageBlocks(next);
    },
    onDragCancel: () => {
      dragging.current = null;
      setDrop(null);
    },
    scrollDeltaSinceDragStart: () => dragging.current ? scrollY.current - dragging.current.startScrollY : 0,
  };

  // Starting to type elsewhere deselects the image, like tapping outside it.
  const textFocused = Boolean(activeRichEditor?.state.isFocused);
  useEffect(() => {
    if (textFocused) setSelectedImageId(null);
  }, [textFocused]);

  const renderImage = (image: InlineImageBlock) => (
    <InlineNoteImage
      image={image}
      availableWidth={contentWidth}
      selected={selectedImageId === image.id}
      previewScale={imagePreview?.id === image.id ? imagePreview.scale : null}
      unavailable={unavailableImages.has(image.id)}
      onUnavailable={() => setUnavailableImages((current) => new Set(current).add(image.id))}
      onSelect={(selected) => {
        if (selected) Keyboard.dismiss();
        setSelectedImageId(selected ? image.id : null);
      }}
      onPreviewScale={(scale) => setImagePreview(scale === null ? null : { id: image.id, scale })}
      onCommitScale={(scale) => void resizeImage(image.id, scale)}
      onAccessibilityMove={(action) => moveImageByAction(image.id, action)}
      drag={dragCallbacks}
    />
  );

  const renderImageActions = (image: InlineImageBlock) => selectedImageId === image.id ? (
    <ImageActionsBar
      wrap={image.wrap ?? 'none'}
      busy={imageBusy}
      onWrapChange={(wrap) => void changeImageWrap(image.id, wrap)}
      onReplace={() => void replaceImage(image)}
      onRemove={() => removeImage(image)}
      onDone={() => setSelectedImageId(null)}
    />
  ) : null;

  const renderParagraph = (block: ParagraphBlock, floatSpace?: FloatSpace) => usesRichText ? (
    <RichParagraphEditor
      key="text"
      block={block}
      appearance={note.appearance}
      themeMode={themeMode}
      alignment={block.alignment ?? 'left'}
      spacing={block.spacing ?? 'normal'}
      placeholder={note.blocks.length === 1 ? 'Start writing…' : 'Continue writing…'}
      focusedBlockId={focusedBlockId}
      firstEditorRef={firstRichEditorRef}
      isFirst={block.id === firstParagraphId}
      floatSpace={floatSpace}
      onEditorStateChange={updateActiveRichEditor}
      onChange={(html, text) => updateRichParagraph(block.id, html, text)}
    />
  ) : (
    <TextInput
      key="text"
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
  );

  return (
    <View style={[styles.documentEditor, isCustom && styles.customDocumentEditor]}>
      <View
        ref={scrollFrameRef}
        collapsable={false}
        style={styles.documentScrollFrame}
        onLayout={() => scrollFrameRef.current?.measureInWindow((_x: number, y: number, _width: number, height: number) => { scrollFrame.current = { y, height }; })}
      >
      <ScrollView
        ref={scrollRef}
        style={[styles.documentScroll, usesRichText && { backgroundColor: pageColor }]}
        contentContainerStyle={[styles.documentContent, isCustom && { paddingHorizontal: pageMargin }]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        scrollEnabled={drop === null && imagePreview === null}
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => { scrollY.current = nativeEvent.contentOffset.y; }}
      >
        {units.map((unit) => {
          const [first, second] = unit.blocks;
          let content: ReactNode;
          if (first.type === 'image' && second?.type === 'paragraph') {
            const size = imageBoxSize(first, contentWidth, imagePreview?.id === first.id ? imagePreview.scale : null);
            const side = first.wrap === 'right' ? 'right' : 'left';
            content = (
              <>
                <View style={[styles.paragraphFrame, { minHeight: size.height + WRAP_TOP + 8 }]}>
                  {renderParagraph(second, { side, width: size.width, height: size.height })}
                  <View style={[styles.wrappedImage, { top: WRAP_TOP }, side === 'left' ? { left: 0 } : { right: 0 }]}>
                    {renderImage(first)}
                  </View>
                </View>
                {renderImageActions(first)}
              </>
            );
          } else if (first.type === 'paragraph') {
            content = <><View style={styles.paragraphFrame}>{renderParagraph(first)}</View></>;
          } else if (first.type === 'checklist') {
            const block = first;
            content = (
                <EmbeddedChecklistEditor
                  noteId={note.id}
                  block={block}
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
            );
          } else {
            content = (
              <View style={[styles.inlineImageContainer, { alignItems: first.wrap === 'left' ? 'flex-start' : first.wrap === 'right' ? 'flex-end' : 'center' }]}>
                {renderImage(first)}
                {renderImageActions(first)}
              </View>
            );
          }
          const isDragged = drop !== null && unit.blocks.some((block) => block.id === drop.imageId);
          return (
            <View
              key={unit.key}
              onLayout={({ nativeEvent }) => unitLayouts.current.set(unit.key, { y: nativeEvent.layout.y, height: nativeEvent.layout.height })}
              style={isDragged ? styles.draggingUnit : undefined}
            >
              {content}
            </View>
          );
        })}
        {drop && drop.y >= 0 ? (
          <View pointerEvents="none" style={[styles.imageDropIndicator, { top: drop.y - 2 }]}>
            <View style={styles.imageDropLine} />
            <Text style={styles.imageDropLabel}>{drop.wrap === 'left' ? 'Image left · text wraps' : drop.wrap === 'right' ? 'Image right · text wraps' : 'Image on its own line'}</Text>
          </View>
        ) : null}
      </ScrollView>
      </View>
      {quickNoteToolbarMode === 'advanced' ? (
        <FormattingToolbar
          active={activeRichEditor}
          defaultFontFamily={note.appearance.font}
          onAlignmentChange={updateParagraphAlignment}
          onSpacingChange={updateParagraphSpacing}
          onInsertChecklist={insertChecklist}
          onInsertImage={() => void insertImage()}
          onOpenPageStyle={() => { if (isCustom) setPageStyleOpen(true); }}
        />
      ) : null}

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

function textAsHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n/g, '<br>') || '<br>'}</p>`;
}

function RichParagraphEditor({ block, appearance, themeMode, alignment, spacing, placeholder, focusedBlockId, firstEditorRef, isFirst, floatSpace, onEditorStateChange, onChange }: {
  block: ParagraphBlock;
  appearance: NoteAppearance;
  themeMode: 'light' | 'dark';
  alignment: 'left' | 'center' | 'right';
  spacing: 'compact' | 'normal' | 'relaxed';
  placeholder: string;
  focusedBlockId: MutableRefObject<string | null>;
  firstEditorRef: MutableRefObject<EditorBridge | null>;
  isFirst: boolean;
  /** Space reserved for a wrapped image so text flows beside and then below it. */
  floatSpace?: FloatSpace;
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
  const backgroundColor = appearance.customBackgroundColor ?? (themeMode === 'dark' && appearance.background === 'warmWhite' ? palette.background : noteBackgroundColors[appearance.background]);
  const editorTheme = {
    webview: { backgroundColor },
    webviewContainer: { backgroundColor },
  };
  const editor = useEditorBridgeWithTheme({
    initialContent: block.richHtml ?? textAsHtml(block.text),
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

  const floatSide = floatSpace?.side;
  const floatWidth = floatSpace?.width;
  const floatHeight = floatSpace?.height;
  useEffect(() => {
    if (!editorState.isReady) return;
    // A transparent float at the top of the text reserves room for the native
    // image drawn over it, so lines wrap beside the image and continue full
    // width below it, like Samsung Notes' "wrap text" option.
    editor.injectCSS(floatSide && floatWidth && floatHeight
      ? `.ProseMirror::before{content:"";float:${floatSide};width:${floatWidth + 12}px;height:${floatHeight + 6}px;}.ProseMirror::after{content:"";display:block;clear:both;}`
      : '', 'image-wrap');
  }, [editor, editorState.isReady, floatHeight, floatSide, floatWidth]);

  useEffect(() => {
    if (typeof html !== 'string') return;
    const text = richHtmlToPlainText(html);
    if (block.richHtml === html && block.text === text) return;
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

function PageStyleModal({ visible, appearance, onClose, onChange }: {
  visible: boolean;
  appearance: NoteAppearance;
  onClose: () => void;
  onChange: (appearance: NoteAppearance) => void;
}) {
  const [customColorDraft, setCustomColorDraft] = useState(appearance.customBackgroundColor ?? '#F7F6F1');
  const setBackground = (background: NoteBackground) => onChange({ ...appearance, background, customBackgroundColor: undefined });
  const setCustomColor = (color: string) => {
    const normalized = color.trim().startsWith('#') ? color.trim() : `#${color.trim()}`;
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) onChange({ ...appearance, customBackgroundColor: normalized });
  };
  const customColors = ['#F7F6F1', '#FFFFFF', '#F5E9D7', '#FBE1E8', '#E3F2E1', '#DDEBFA', '#E9E1FA', '#D5F2EF', '#242B35', '#343434', '#6B3442', '#2C4C3B'];
  const setPaper = (paper: PaperStyle) => onChange({ ...appearance, paper });
  const setMargin = (margin: NoteMargin) => onChange({ ...appearance, margin });
  const backgrounds: NoteBackground[] = ['warmWhite', 'white', 'cream', 'pink', 'green', 'blue'];
  const papers: PaperStyle[] = ['plain', 'lined', 'dotted', 'grid'];
  const margins: NoteMargin[] = ['narrow', 'comfortable', 'wide'];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.pageStyleBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close page style" />
        <View style={styles.pageStylePanel}>
          <View style={styles.pageStyleHeader}>
            <Text style={styles.pageStyleTitle}>Page style</Text>
            <Pressable onPress={onClose} accessibilityRole="button" style={styles.pageStyleDoneButton}>
              <Text style={styles.pageStyleDoneText}>Done</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="always">
            <Text style={styles.pageStyleLabel}>BACKGROUND</Text>
            <View style={styles.pageStyleOptions}>
              {backgrounds.map((background) => (
                <Pressable
                  key={background}
                  accessibilityRole="button"
                  accessibilityState={{ selected: appearance.background === background }}
                  onPress={() => setBackground(background)}
                  style={[styles.pageColorOption, appearance.background === background && styles.pageStyleOptionSelected]}
                >
                  <View style={[styles.pageColorSwatch, { backgroundColor: noteBackgroundColors[background] }]} />
                  <Text style={styles.pageStyleOptionText}>{noteBackgroundLabels[background]}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.pageStyleLabel}>CUSTOM COLOR</Text>
            <View style={styles.customColorGrid}>
              {customColors.map((color) => (
                <Pressable
                  key={color}
                  accessibilityRole="button"
                  accessibilityLabel={`Set page color ${color}`}
                  accessibilityState={{ selected: (appearance.customBackgroundColor ?? '') === color }}
                  onPress={() => { setCustomColorDraft(color); setCustomColor(color); }}
                  style={[styles.customColorSwatch, { backgroundColor: color }, appearance.customBackgroundColor === color && styles.pageStyleOptionSelected]}
                />
              ))}
            </View>
            <View style={styles.customColorInputRow}>
              <TextInput
                accessibilityLabel="Custom page color hex value"
                value={customColorDraft}
                onChangeText={setCustomColorDraft}
                onEndEditing={() => setCustomColor(customColorDraft)}
                autoCapitalize="characters"
                maxLength={7}
                placeholder="#RRGGBB"
                placeholderTextColor={palette.faint}
                style={styles.customColorInput}
              />
              <Pressable accessibilityRole="button" onPress={() => setCustomColor(customColorDraft)} style={styles.pageStyleDoneButton}>
                <Text style={styles.pageStyleDoneText}>Apply</Text>
              </Pressable>
            </View>
            <Text style={styles.pageStyleLabel}>PAPER</Text>
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
            <Text style={styles.pageStyleLabel}>MARGINS</Text>
            <View style={styles.pageStyleOptions}>
              {margins.map((margin) => (
                <PageStyleChoice
                  key={margin}
                  selected={appearance.margin === margin}
                  label={margin === 'comfortable' ? 'Comfortable' : margin[0].toUpperCase() + margin.slice(1)}
                  onPress={() => setMargin(margin)}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PageStyleChoice({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.pageStyleChoice, selected && styles.pageStyleOptionSelected]}
    >
      <Text style={[styles.pageStyleOptionText, selected && styles.pageStyleOptionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function EmbeddedChecklistEditor({ noteId, block, onItemsChange, onRemove }: {
  noteId: string;
  block: EmbeddedChecklistBlock;
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
            {item.checked ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <ChecklistItemLabel text={item.text} checked={item.checked} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.text || 'list item'}`}
          onPress={() => { setEditingItemId(item.id); setEditingText(item.text); }}
          style={({ pressed }) => [styles.editItemButton, pressed && styles.pressed]}
        >
          <Text style={styles.editItemGlyph}>✎</Text>
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
          placeholderTextColor={palette.faint}
          returnKeyType="done"
          style={styles.embeddedItemInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add checklist item"
          disabled={!canAddChecklistItem(newItemText)}
          onPress={() => addItem(newItemText)}
          style={({ pressed }) => [styles.embeddedAddItemButton, pressed && styles.pressed, !canAddChecklistItem(newItemText) && styles.addItemDisabled]}
        >
          <Text style={styles.embeddedAddItemButtonText}>+</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Remove checklist" onPress={onRemove} hitSlop={8} style={styles.embeddedRemoveButton}>
          <Text style={styles.mutedActionText}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}
