import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { styles as appStyles } from './styles';
import { palette } from './theme';
import { Icon } from './ui/Icon';

export function BackButton({ label, accessibilityLabel, onPress, style }: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [appStyles.headerAction, style, pressed && appStyles.pressed]}
    >
      <Icon name="chevronLeft" size={24} color={palette.ink} />
      <Text style={appStyles.headerActionText}>{label}</Text>
    </Pressable>
  );
}
