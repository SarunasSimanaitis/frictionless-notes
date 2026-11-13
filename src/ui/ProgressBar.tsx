import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { styles } from '../styles';

/** A thin bar that glides to its new value instead of jumping. `value` runs from 0 to 1. */
export function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const progress = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: clamped,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      // Width cannot run on the native driver; this is one short animation on a 4pt bar.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [clamped, progress]);

  return (
    <View style={styles.listProgressTrack}>
      <Animated.View
        style={[styles.listProgressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
      />
    </View>
  );
}
