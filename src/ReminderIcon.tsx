import { View } from 'react-native';
import { palette } from './theme';

export function ReminderIcon({ size = 18, color = palette.accent }: { size?: number; color?: string }) {
  return (
    <View
      accessibilityElementsHidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.8,
        borderColor: color,
      }}
    >
      <View style={{
        position: 'absolute',
        top: size * 0.2,
        left: size * 0.47,
        width: 1.7,
        height: size * 0.31,
        borderRadius: 1,
        backgroundColor: color,
      }} />
      <View style={{
        position: 'absolute',
        top: size * 0.47,
        left: size * 0.47,
        width: size * 0.24,
        height: 1.7,
        borderRadius: 1,
        backgroundColor: color,
      }} />
    </View>
  );
}