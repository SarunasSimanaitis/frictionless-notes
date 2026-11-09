import { View } from 'react-native';

/**
 * Toolbar icons drawn with plain Views (no SVG dependency), sized for a 24px box.
 */

/** Photo icon: rounded frame, sun and two mountains, like the standard gallery glyph. */
export function ImageIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 21, height: 18, borderWidth: 2, borderColor: color, borderRadius: 4, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 2.5, right: 3, width: 4.5, height: 4.5, borderRadius: 2.25, backgroundColor: color }} />
        <View style={{
          position: 'absolute', bottom: 0, left: 0, width: 0, height: 0,
          borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 8,
          borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color,
        }} />
        <View style={{
          position: 'absolute', bottom: 0, left: 7, width: 0, height: 0,
          borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 5.5,
          borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color,
        }} />
      </View>
    </View>
  );
}

/** Two checkbox rows, the first one ticked. */
export function ChecklistIcon({ color }: { color: string }) {
  const box = { width: 7, height: 7, borderWidth: 1.7, borderColor: color, borderRadius: 2 } as const;
  const line = { flex: 1, height: 2, borderRadius: 1, backgroundColor: color, marginLeft: 4 } as const;
  return (
    <View style={{ width: 24, height: 24, justifyContent: 'center', paddingHorizontal: 2, gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={[box, { backgroundColor: color }]} />
        <View style={line} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={box} />
        <View style={line} />
      </View>
    </View>
  );
}

/** Curved arrow pointing left; `flip` mirrors it for redo. */
export function UndoIcon({ color, flip = false }: { color: string; flip?: boolean }) {
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', transform: flip ? [{ scaleX: -1 }] : [] }}>
      <View style={{
        position: 'absolute', top: 7, left: 6, width: 13, height: 11,
        borderTopWidth: 2, borderRightWidth: 2, borderColor: color, borderTopRightRadius: 7, borderBottomRightRadius: 6,
      }} />
      <View style={{
        position: 'absolute', top: 3.5, left: 2, width: 0, height: 0,
        borderTopWidth: 4.5, borderBottomWidth: 4.5, borderRightWidth: 6,
        borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: color,
      }} />
    </View>
  );
}
