import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { styles } from '../styles';
import { palette } from '../theme';
import { Icon, type IconName } from './Icon';

/** A 48dp touch target around a single icon. */
export function IconButton({ icon, label, onPress, onLongPress, color = palette.ink, size = 24, disabled = false, selected, style }: {
  icon: IconName;
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, style, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}
