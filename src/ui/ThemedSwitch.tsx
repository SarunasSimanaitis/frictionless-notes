import { Switch } from 'react-native';
import { palette } from '../theme';

/** One switch style for the whole app: a neutral track that turns accent when on. */
export function ThemedSwitch({ label, value, onValueChange, disabled = false }: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: palette.line, true: palette.accent }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={palette.line}
    />
  );
}
