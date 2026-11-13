import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_NAME } from '../brand';
import { styles } from '../styles';
import { palette } from '../theme';
import { Icon } from '../ui/Icon';
import { authenticate } from './deviceAuth';

/** Covers the whole app until the device lock is passed. */
export function LockScreen({ onUnlocked, onUnavailable }: {
  onUnlocked: () => void;
  /** The device no longer has any screen lock, so there is nothing to check against. */
  onUnavailable: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const promptEndedAt = useRef(0);
  // The parent re-renders often (every refresh hands down new callbacks). Reading them
  // through a ref keeps `unlock` stable, so a cancelled prompt is never reopened by a re-render.
  const callbacks = useRef({ onUnlocked, onUnavailable });
  callbacks.current = { onUnlocked, onUnavailable };

  const unlock = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const outcome = await authenticate(`Unlock ${APP_NAME}`);
      if (outcome === 'success') callbacks.current.onUnlocked();
      else if (outcome === 'unavailable') callbacks.current.onUnavailable();
    } finally {
      promptEndedAt.current = Date.now();
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void unlock();
    // Ask again when the user comes back to the app, but not when the "return" is only
    // the system prompt closing after a cancel.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !busyRef.current && Date.now() - promptEndedAt.current > 1_500) void unlock();
    });
    return () => subscription.remove();
  }, [unlock]);

  return (
    <SafeAreaView style={styles.lockScreen}>
      <View style={styles.lockMark}>
        <Icon name="lock" size={30} color={palette.accent} />
      </View>
      <Text style={styles.lockTitle}>{APP_NAME} is locked</Text>
      <Text style={styles.lockCopy}>Use your fingerprint, face or device PIN to see your notes.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Unlock ${APP_NAME}`}
        disabled={busy}
        onPress={() => void unlock()}
        style={({ pressed }) => [styles.primaryButton, styles.lockButton, (pressed || busy) && styles.pressed]}
      >
        <Text style={styles.primaryButtonText}>{busy ? 'Waiting…' : 'Unlock'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}
