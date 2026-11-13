import { palette } from './theme';
import { Icon } from './ui/Icon';

export function ReminderIcon({ size = 18, color = palette.accent }: { size?: number; color?: string }) {
  return <Icon name="bell" size={size} color={color} />;
}
