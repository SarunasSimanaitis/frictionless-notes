import { memo, useCallback, useState } from 'react';
import { Text, View, type NativeSyntheticEvent } from 'react-native';
import { palette } from '../theme';
import { styles } from '../styles';

type TextLine = { x: number; y: number; width: number; height: number };

/** Checklist label with native strikethrough plus a measured visual fallback for Android. */
export const ChecklistItemLabel = memo(function ChecklistItemLabel({ text, checked }: {
  text: string;
  checked: boolean;
}) {
  const [lines, setLines] = useState<TextLine[]>([]);
  const onTextLayout = useCallback((event: NativeSyntheticEvent<{ lines: TextLine[] }>) => {
    const next = event.nativeEvent.lines.map((line) => ({
      x: line.x,
      y: line.y,
      width: line.width,
      height: line.height,
    }));
    setLines((previous) => {
      if (previous.length === next.length && previous.every((line, index) => {
        const candidate = next[index];
        return Math.abs(line.x - candidate.x) < 0.5 && Math.abs(line.y - candidate.y) < 0.5 &&
          Math.abs(line.width - candidate.width) < 0.5 && Math.abs(line.height - candidate.height) < 0.5;
      })) return previous;
      return next;
    });
  }, []);

  return (
    <View style={styles.checklistLabelWrap}>
      <Text
        onTextLayout={onTextLayout}
        style={[
          styles.checklistText,
          checked && styles.checklistTextChecked,
          { textDecorationLine: checked ? 'line-through' : 'none' },
        ]}
      >
        {text || 'Empty item'}
      </Text>
      {checked ? lines.map((line, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: line.x,
            top: line.y + line.height * 0.53,
            width: line.width,
            height: 1.5,
            backgroundColor: palette.ink,
            zIndex: 10,
            elevation: 2,
          }}
        />
      )) : null}
    </View>
  );
});
