import {
  Alert, Image, Keyboard, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { NestableDraggableFlatList, NestableScrollContainer, type RenderItemParams } from 'react-native-draggable-flatlist';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { RichText, useBridgeState, useEditorBridge, useEditorContent, type EditorBridge } from '@10play/tentap-editor';
import { FormattingToolbar, type ActiveRichEditor } from './FormattingToolbar';
import { NoteFontFormattingBridge } from './fontFormattingBridge';
import { editorHtml } from '../../editor-web/build/editorHtml';
import {
  canAddChecklistItem, createEmbeddedChecklistBlock, createEmbeddedChecklistItem, createId, editChecklistItemText,
  insertChecklistBlockAtSelection, normalizeItemPositions, removeChecklistItem, reorderItem, richHtmlToPlainText, toggleItem,
} from '../model';
import { pickNoteImage, removeNoteImage } from '../noteImages';
import { noteBackgroundColors, noteBackgroundLabels, noteMarginValues, palette } from '../theme';
import { styles } from '../styles';
import type {
  EmbeddedChecklistBlock, EmbeddedChecklistItem, InlineImageBlock, Note, NoteAppearance, NoteBackground, NoteBlock,
  NoteMargin, ParagraphBlock, ParagraphSpacing, PaperStyle,
} from '../types';
import { customNoteCss } from './customNoteCss';

export function TextDocumentEditor({ note, firstParagraphInputRef, firstRichEditorRef, onBlocksChange, onBlocksCommit, onAppearanceChange }: {
  note: Note;
  firstParagraphInputRef: MutableRefObject<TextInput | null>;
  firstRichEditorRef: MutableRefObject<EditorBridge | null>;
  onBlocksChange: (blocks: NoteBlock[]) => void;
  onBlocksCommit: (blocks: NoteBlock[], obsoleteImageUris?: string[]) => Promise<boolean>;
  onAppearanceChange: (appearance: NoteAppearance) => void;
}) {
  const isCustom = note.type === 'custom';
  const [pageStyleOpen, setPageStyleOpen] = useState(false);
  const [activeRichEditor, setActiveRichEditor] = useState<ActiveRichEditor | null>(null);
  const activeRichEditorRef = useRef<ActiveRichEditor | null>(null);
  const paragraphRefs = useRef(new Map<string, TextInput>());
  const selections = useRef(new Map<string, { start: number; end: number }>());
  const focusedBlockId = useRef<string | null>(null);
  const focusAfterInsert = useRef<string | null>(null);
  const [paragraphHeights, setParagraphHeights] = useState<Record<string, number>>({});
  const { width: viewportWidth } = useWindowDimensions();
  const firstParagraphId = note.blocks.find((block) => block.type === 'paragraph')?.id;
  const pageColor = noteBackgroundColors[note.appearance.background];
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
      ? { ...block, text }
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

  return (
    <View style={[styles.documentEditor, isCustom && styles.customDocumentEditor]}>
      {isCustom ? (
        <FormattingToolbar
          active={activeRichEditor}
          defaultFontFamily={note.appearance.font}
          onAlignmentChange={updateParagraphAlignment}
          onSpacingChange={updateParagraphSpacing}
          onInsertChecklist={insertChecklist}
          onInsertImage={() => void insertImage()}
          onOpenPageStyle={() => setPageStyleOpen(true)}
        />
      ) : (
        <View style={styles.documentToolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Insert checklist at the cursor"
            onPress={insertChecklist}
            style={({ pressed }) => [styles.documentInsertButton, pressed && styles.pressed]}
          >
            <Text style={styles.documentInsertText}>+ Checklist</Text>
          </Pressable>
        </View>
      )}
      <NestableScrollContainer
        style={[styles.documentScroll, isCustom && { backgroundColor: pageColor }]}
        contentContainerStyle={[styles.documentContent, isCustom && { paddingHorizontal: pageMargin }]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
      >
        {note.blocks.map((block) => block.type === 'paragraph' ? (
          isCustom ? (
            <RichParagraphEditor
              key={block.id}
              block={block}
              appearance={note.appearance}
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
              style={[styles.documentParagraphInput, { height: paragraphHeights[block.id] ?? 44 }]}
              selectionColor={palette.accent}
            />
          )
        ) : block.type === 'checklist' ? (
          <EmbeddedChecklistEditor
            key={block.id}
            noteId={note.id}
            block={block}
            backgroundColor={isCustom ? pageColor : palette.surface}
            onItemsChange={(items) => onBlocksChange(note.blocks.map((candidate) =>
              candidate.id === block.id && candidate.type === 'checklist'
                ? { ...candidate, items }
                : candidate,
            ))}
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
      </NestableScrollContainer>
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

function textAsHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n/g, '<br>') || '<br>'}</p>`;
}

function RichParagraphEditor({ block, appearance, alignment, spacing, placeholder, focusedBlockId, firstEditorRef, isFirst, onEditorStateChange, onChange }: {
  block: ParagraphBlock;
  appearance: NoteAppearance;
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
  const backgroundColor = noteBackgroundColors[appearance.background];
  const editor = useEditorBridge({
    initialContent: block.richHtml ?? textAsHtml(block.text),
    customSource: editorHtml,
    bridgeExtensions: [NoteFontFormattingBridge],
    autofocus: false,
    avoidKeyboard: true,
    dynamicHeight: true,
    scrollBottomOffset: 18,
    theme: {
      webview: { backgroundColor },
      webviewContainer: { backgroundColor },
    },
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
    editor.injectCSS(customNoteCss(appearance, alignment, spacing), 'page-style');
    editor.setPlaceholder(placeholder);
  }, [alignment, appearance, editor, editorState.isReady, placeholder, spacing]);

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
  const setBackground = (background: NoteBackground) => onChange({ ...appearance, background });
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

function InlineNoteImage({ noteId, image, blocks, availableWidth, onBlocksCommit }: {
  noteId: string;
  image: InlineImageBlock;
  blocks: NoteBlock[];
  availableWidth: number;
  onBlocksCommit: (blocks: NoteBlock[], obsoleteImageUris?: string[]) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const imageAspect = image.width / image.height;
  const imageScale = Math.max(0.2, Math.min(1.5, image.scale ?? 1));
  const requestedWidth = availableWidth * imageScale;
  const imageHeight = Math.min(requestedWidth / imageAspect, 480);
  const imageWidth = imageHeight * imageAspect;
  const [offset, setOffset] = useState({ x: image.offsetX ?? 0, y: image.offsetY ?? 0 });
  const offsetRef = useRef(offset);
  const dragOrigin = useRef(offset);
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
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => !busy && Math.hypot(gesture.dx, gesture.dy) > 3,
    onPanResponderGrant: () => { dragOrigin.current = offsetRef.current; },
    onPanResponderMove: (_event, gesture) => {
      const next = clampOffset(
        dragOrigin.current.x + gesture.dx / Math.max(availableWidth, 1),
        dragOrigin.current.y + gesture.dy / Math.max(availableWidth, 1),
      );
      offsetRef.current = next;
      setOffset(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      void commitOffset(
        dragOrigin.current.x + gesture.dx / Math.max(availableWidth, 1),
        dragOrigin.current.y + gesture.dy / Math.max(availableWidth, 1),
      );
    },
    onPanResponderTerminate: () => {
      offsetRef.current = dragOrigin.current;
      setOffset(dragOrigin.current);
    },
  }), [availableWidth, busy, commitOffset]);

  const changeScale = async (delta: number) => {
    const nextScale = Math.round(Math.max(0.2, Math.min(1.5, imageScale + delta)) * 100) / 100;
    if (nextScale === imageScale || busy) return;
    setBusy(true);
    try {
      await onBlocksCommit(blocks.map((block) => block.id === image.id && block.type === 'image'
        ? { ...block, scale: nextScale }
        : block));
    } finally {
      setBusy(false);
    }
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
    <View style={styles.inlineImageCard}>
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
        <Image
          accessibilityLabel="Image in custom note"
          source={{ uri: image.uri }}
          resizeMode="contain"
          onError={() => setImageUnavailable(true)}
          style={{ width: imageWidth, height: imageHeight, alignSelf: 'center', transform: [{ translateX: offset.x * availableWidth }, { translateY: offset.y * availableWidth }] }}
        />
      )}
      <View style={styles.inlineImageActions}>
        <View {...panResponder.panHandlers}>
          <Text style={styles.inlineImageDragHandle}>↕ Move</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Make image smaller"
          disabled={busy || imageScale <= 0.25}
          onPress={() => void changeScale(-0.15)}
          style={styles.inlineImageAction}
        >
          <Text style={styles.inlineImageActionText}>Smaller</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Make image larger"
          disabled={busy || imageScale >= 1}
          onPress={() => void changeScale(0.15)}
          style={styles.inlineImageAction}
        >
          <Text style={styles.inlineImageActionText}>Larger</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void replaceImage()}
          style={styles.inlineImageAction}
        >
          <Text style={styles.inlineImageActionText}>{busy ? 'Saving…' : 'Replace'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={removeImage}
          style={styles.inlineImageAction}
        >
          <Text style={styles.inlineImageRemoveText}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EmbeddedChecklistEditor({ noteId, block, onItemsChange, backgroundColor = palette.surface }: {
  noteId: string;
  block: EmbeddedChecklistBlock;
  onItemsChange: (items: EmbeddedChecklistItem[]) => void;
  backgroundColor?: string;
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

  const saveItemEdit = (item: EmbeddedChecklistItem) => {
    onItemsChange(editChecklistItemText(block.items, item.id, editingText));
    setEditingItemId(null);
    setEditingText('');
    Keyboard.dismiss();
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
            <Pressable accessibilityRole="button" onPress={() => saveItemEdit(item)} style={[styles.itemActionButton, styles.itemSaveButton]}>
              <Text style={styles.itemSaveText}>Done</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.checklistRow, isActive && styles.checklistRowActive]}>
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
          delayLongPress={700}
          onPress={() => onItemsChange(toggleItem(block.items, item.id))}
          style={({ pressed }) => [styles.checklistToggleArea, pressed && styles.rowPressed]}
        >
          <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
            {item.checked ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={[styles.checklistText, item.checked && styles.checklistTextChecked]}>
            {item.text || 'Empty item'}
          </Text>
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
    <View style={[styles.embeddedChecklist, { backgroundColor }]}>
      <Text style={styles.embeddedChecklistLabel}>CHECKLIST</Text>
      <NestableDraggableFlatList
        data={block.items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragEnd={({ data }) => onItemsChange(normalizeItemPositions(data))}
        autoscrollThreshold={40}
        autoscrollSpeed={60}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        renderPlaceholder={({ item }) => (
          <View pointerEvents="none" style={[styles.checklistRow, styles.checklistPlaceholder]}>
            <View style={styles.checkbox} />
            <Text style={styles.checklistText}>{item.text || 'Empty item'}</Text>
            <View style={styles.editItemButton} />
          </View>
        )}
        ListEmptyComponent={<Text style={styles.embeddedChecklistEmpty}>Add the first item below.</Text>}
      />
      <View style={styles.embeddedAddItemBar}>
        <TextInput
          accessibilityLabel="New checklist item"
          value={newItemText}
          onChangeText={setNewItemText}
          onSubmitEditing={({ nativeEvent }) => addItem(nativeEvent.text ?? newItemText)}
          submitBehavior="submit"
          placeholder="Add an item"
          placeholderTextColor={palette.faint}
          returnKeyType="done"
          style={styles.embeddedItemInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add checklist item"
          disabled={!canAddChecklistItem(newItemText)}
          onPress={() => addItem(newItemText)}
          style={({ pressed }) => [styles.addItemButton, pressed && styles.pressed, !canAddChecklistItem(newItemText) && styles.addItemDisabled]}
        >
          <Text style={styles.addItemButtonText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}
