import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { styles as appStyles } from './styles';

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
      style={[appStyles.headerAction, style]}
    >
      <Text style={appStyles.backArrow}>‹</Text>
      <Text style={appStyles.headerActionText}>{label}</Text>
    </Pressable>
  );
}
