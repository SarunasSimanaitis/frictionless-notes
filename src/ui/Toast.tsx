import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { styles } from '../styles';
import { FadeSlideIn } from './FadeSlideIn';

export interface ToastMessage {
  /** Changes with every new toast so the timer restarts. */
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** A short confirmation at the bottom of the screen, with an optional undo. */
export function Toast({ toast, bottom, onDismiss }: {
  toast: ToastMessage | null;
  bottom: number;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, toast.actionLabel ? 6_000 : 3_000);
    return () => clearTimeout(timer);
  }, [onDismiss, toast]);

  if (!toast) return null;
  return (
    <View pointerEvents="box-none" style={[styles.toastLayer, { bottom }]}>
      <FadeSlideIn key={toast.id} style={styles.toast}>
        <Text style={styles.toastText} numberOfLines={2} accessibilityLiveRegion="polite">{toast.message}</Text>
        {toast.actionLabel && toast.onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={toast.actionLabel}
            hitSlop={10}
            onPress={() => { toast.onAction?.(); onDismiss(); }}
            style={({ pressed }) => [styles.toastAction, pressed && styles.pressed]}
          >
            <Text style={styles.toastActionText}>{toast.actionLabel}</Text>
          </Pressable>
        ) : null}
      </FadeSlideIn>
    </View>
  );
}
