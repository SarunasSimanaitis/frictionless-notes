import Svg, { Circle, Path } from 'react-native-svg';
import { palette } from '../theme';
import { iconShapes, type IconName, type IconShape } from './iconPaths';

export type { IconName } from './iconPaths';

/** A crisp outline icon that follows the app theme. Decorative by default: label the button, not the icon. */
export function Icon({ name, size = 24, color = palette.ink, strokeWidth = 1.8 }: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const shape: IconShape = iconShapes[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      {shape.strokes?.map((d, index) => (
        <Path key={`s${index}`} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
      {shape.dots?.map(([cx, cy, r], index) => (
        <Circle key={`d${index}`} cx={cx} cy={cy} r={r} fill={color} />
      ))}
    </Svg>
  );
}
