import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { palette } from '../theme';
import { styles } from '../styles';
import type { ImageWrap, InlineImageBlock } from '../types';

export const MIN_IMAGE_SCALE = 0.2;
const MAX_INLINE_SCALE = 1;
/** Wrapped images leave at least a quarter of the line for text. */
const MAX_WRAPPED_SCALE = 0.75;
const MAX_IMAGE_HEIGHT = 480;

export function maxScaleFor(wrap: ImageWrap | undefined): number {
  return wrap === 'left' || wrap === 'right' ? MAX_WRAPPED_SCALE : MAX_INLINE_SCALE;
}

export function clampImageScale(scale: number, wrap: ImageWrap | undefined): number {
  return Math.max(MIN_IMAGE_SCALE, Math.min(maxScaleFor(wrap), scale));
}

/** On-screen size of an image block for the given content width. */
export function imageBoxSize(image: InlineImageBlock, availableWidth: number, scaleOverride?: number | null) {
  const aspect = image.width / image.height;
  const scale = clampImageScale(scaleOverride ?? image.scale ?? (image.wrap && image.wrap !== 'none' ? 0.45 : 1), image.wrap);
  let width = availableWidth * scale;
  let height = width / aspect;
  if (height > MAX_IMAGE_HEIGHT) {
    height = MAX_IMAGE_HEIGHT;
    width = height * aspect;
  }
  return { width: Math.round(width), height: Math.round(height), scale };
}

type Handle = 'topLeft' | 'top' | 'topRight' | 'right' | 'bottomRight' | 'bottom' | 'bottomLeft' | 'left';
const handles: Handle[] = ['topLeft', 'top', 'topRight', 'right', 'bottomRight', 'bottom', 'bottomLeft', 'left'];

export interface ImageDragCallbacks {
  /** `fingerOffsetY` is where the finger is inside the image, from its top. */
  onDragStart: (imageId: string, fingerOffsetY: number) => void;
  onDragMove: (absoluteX: number, absoluteY: number, translationY: number) => void;
  onDragEnd: (absoluteX: number, absoluteY: number, translationY: number) => void;
  onDragCancel: () => void;
  /** How far the note scrolled since the drag started, so the image stays under the finger. */
  scrollDeltaSinceDragStart: () => number;
}

/**
 * Samsung Notes-style image: tap to select, drag the edge or corner handles to
 * resize, hold and drag to move it anywhere in the note. Layout (inline or
 * wrapped beside text) is handled by the parent.
 */
export function InlineNoteImage({
  image, availableWidth, selected, previewScale, unavailable, onUnavailable, onSelect,
  onPreviewScale, onCommitScale, onAccessibilityMove, drag,
}: {
  image: InlineImageBlock;
  availableWidth: number;
  selected: boolean;
  previewScale: number | null;
  unavailable: boolean;
  onUnavailable: () => void;
  onSelect: (selected: boolean) => void;
  onPreviewScale: (scale: number | null) => void;
  onCommitScale: (scale: number) => void;
  onAccessibilityMove: (action: string) => void;
  drag: ImageDragCallbacks;
}) {
  const { width, height } = imageBoxSize(image, availableWidth, previewScale);
  const [translation, setTranslation] = useState<{ x: number; y: number } | null>(null);
  const resizeOrigin = useRef(width);

  // Gesture callbacks are created once per relevant change; read the latest
  // values through a ref so they never act on stale props.
  const live = useRef({ image, availableWidth, width, selected, drag, onSelect, onPreviewScale, onCommitScale });
  live.current = { image, availableWidth, width, selected, drag, onSelect, onPreviewScale, onCommitScale };

  const imageGesture = useMemo(() => {
    const move = Gesture.Pan()
      .runOnJS(true)
      .activateAfterLongPress(350)
      .onStart((event) => {
        live.current.onSelect(false);
        live.current.drag.onDragStart(live.current.image.id, event.y);
        setTranslation({ x: 0, y: 0 });
      })
      .onUpdate((event) => {
        setTranslation({ x: event.translationX, y: event.translationY + live.current.drag.scrollDeltaSinceDragStart() });
        live.current.drag.onDragMove(event.absoluteX, event.absoluteY, event.translationY);
      })
      .onEnd((event) => live.current.drag.onDragEnd(event.absoluteX, event.absoluteY, event.translationY))
      .onFinalize((_event, success) => {
        if (!success) live.current.drag.onDragCancel();
        setTranslation(null);
      });
    const tap = Gesture.Tap().runOnJS(true).onEnd((_event, success) => {
      if (success) live.current.onSelect(!live.current.selected);
    });
    return Gesture.Exclusive(move, tap);
  }, []);

  const resizeGestures = useMemo(() => {
    const scaleForResize = (handle: Handle, translationX: number, translationY: number) => {
      const { image: current, availableWidth: contentWidth } = live.current;
      const aspect = current.width / current.height;
      const signX = handle.toLowerCase().includes('left') ? -1 : handle.toLowerCase().includes('right') ? 1 : 0;
      const signY = handle.startsWith('top') ? -1 : handle.startsWith('bottom') ? 1 : 0;
      const fromX = signX * translationX;
      const fromY = signY * translationY * aspect;
      const delta = signX && signY ? (Math.abs(fromX) > Math.abs(fromY) ? fromX : fromY) : signX ? fromX : fromY;
      // A centered image grows on both sides, so double the delta to keep the
      // dragged edge under the finger.
      const factor = current.wrap === 'left' || current.wrap === 'right' ? 1 : 2;
      return clampImageScale((resizeOrigin.current + delta * factor) / Math.max(contentWidth, 1), current.wrap);
    };
    const create = (handle: Handle) => Gesture.Pan()
      .runOnJS(true)
      .minDistance(1)
      .onStart(() => { resizeOrigin.current = live.current.width; })
      .onUpdate((event) => {
        live.current.onPreviewScale(scaleForResize(handle, event.translationX, event.translationY));
      })
      .onEnd((event) => {
        live.current.onCommitScale(Math.round(scaleForResize(handle, event.translationX, event.translationY) * 100) / 100);
      })
      .onFinalize(() => live.current.onPreviewScale(null));
    return Object.fromEntries(handles.map((handle) => [handle, create(handle)])) as Record<Handle, ReturnType<typeof create>>;
  }, []);

  const dragging = translation !== null;

  return (
    <View
      style={{
        width,
        height,
        transform: dragging ? [{ translateX: translation.x }, { translateY: translation.y }, { scale: 1.03 }] : [],
        opacity: dragging ? 0.88 : 1,
        zIndex: dragging ? 20 : 1,
        elevation: dragging ? 8 : 0,
      }}
    >
      <GestureDetector gesture={imageGesture}>
        <View
          collapsable={false}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Image in note. Tap to select and resize, hold and drag to move."
          accessibilityState={{ selected }}
          accessibilityActions={[
            { name: 'activate', label: selected ? 'Deselect image' : 'Select image' },
            { name: 'moveUp', label: 'Move image up' },
            { name: 'moveDown', label: 'Move image down' },
            { name: 'moveLeft', label: 'Move image left' },
            { name: 'moveRight', label: 'Move image right' },
          ]}
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'activate') onSelect(!selected);
            else onAccessibilityMove(nativeEvent.actionName);
          }}
          style={{ width, height }}
        >
          {unavailable ? (
            <View style={[styles.inlineImageUnavailable, { width, height }]}>
              <Text style={styles.inlineImageUnavailableText}>Image unavailable on this device</Text>
            </View>
          ) : (
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: image.uri }}
              resizeMode="cover"
              onError={onUnavailable}
              style={{ width, height, borderRadius: selected ? 2 : 8 }}
            />
          )}
        </View>
      </GestureDetector>
      {selected ? (
        <>
          <View pointerEvents="none" style={styles.inlineImageSelectionFrame} />
          {handles.map((handle) => (
            <GestureDetector key={handle} gesture={resizeGestures[handle]}>
              <View
                collapsable={false}
                accessibilityLabel={`Resize image from ${handle.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}`}
                hitSlop={14}
                style={[styles.inlineImageHandle, handleStyle(handle, width, height)]}
              >
                <View style={handle.length > 6 ? styles.inlineImageHandleCorner : handle === 'top' || handle === 'bottom' ? styles.inlineImageHandleEdgeHorizontal : styles.inlineImageHandleEdgeVertical} />
              </View>
            </GestureDetector>
          ))}
          {previewScale !== null ? (
            <View pointerEvents="none" style={styles.inlineImageSizeBadge}>
              <Text style={styles.inlineImageSizeBadgeText}>{Math.round(previewScale * 100)}%</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const HANDLE_BOX = 28;
function handleStyle(handle: Handle, width: number, height: number) {
  const half = HANDLE_BOX / 2;
  const x = handle.toLowerCase().includes('left') ? -half : handle.toLowerCase().includes('right') ? width - half : width / 2 - half;
  const y = handle.startsWith('top') ? -half : handle.startsWith('bottom') ? height - half : height / 2 - half;
  return { left: x, top: y };
}

/** Floating actions for the selected image: text wrapping, replace, remove. */
export function ImageActionsBar({ wrap, busy, onWrapChange, onReplace, onRemove, onDone }: {
  wrap: ImageWrap;
  busy: boolean;
  onWrapChange: (wrap: ImageWrap) => void;
  onReplace: () => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const wrapOptions: { value: ImageWrap; label: string; a11y: string }[] = [
    { value: 'left', label: 'Left', a11y: 'Image on the left, text wraps on the right' },
    { value: 'none', label: 'Inline', a11y: 'Image on its own line' },
    { value: 'right', label: 'Right', a11y: 'Image on the right, text wraps on the left' },
  ];
  return (
    <View style={styles.inlineImageActions}>
      <View style={styles.inlineImageWrapGroup}>
        {wrapOptions.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.a11y}
            accessibilityState={{ selected: wrap === option.value, disabled: busy }}
            disabled={busy}
            onPress={() => onWrapChange(option.value)}
            style={[styles.inlineImageWrapOption, wrap === option.value && styles.inlineImageWrapOptionSelected]}
          >
            <Text style={[styles.inlineImageActionText, wrap === option.value && { color: palette.surface }]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Replace image" disabled={busy} onPress={onReplace} style={styles.inlineImageAction}>
        <Text style={styles.inlineImageActionText}>{busy ? 'Saving…' : 'Replace'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove image" disabled={busy} onPress={onRemove} style={styles.inlineImageAction}>
        <Text style={styles.inlineImageRemoveText}>Remove</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Done editing image" onPress={onDone} style={styles.inlineImageAction}>
        <Text style={styles.inlineImageActionText}>Done</Text>
      </Pressable>
    </View>
  );
}
