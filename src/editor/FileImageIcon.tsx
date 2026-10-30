import { View } from 'react-native';

/** Compact file-image outline icon, drawn with native Views to avoid another dependency. */
export function FileImageIcon({ color = '#242A35' }: { color?: string }) {
  return (
    <View style={{ width: 22, height: 25, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{ width: 17, height: 22, borderWidth: 1.8, borderColor: color, borderRadius: 2, backgroundColor: 'transparent', overflow: 'hidden', justifyContent: 'flex-end', padding: 2 }}>
        <View style={{ height: 9, justifyContent: 'flex-end', overflow: 'hidden' }}>
          <View style={{ position: 'absolute', left: 1, bottom: 0, width: 8, height: 8, borderLeftWidth: 1.5, borderTopWidth: 1.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
          <View style={{ position: 'absolute', right: 0, bottom: -2, width: 9, height: 9, borderLeftWidth: 1.5, borderTopWidth: 1.5, borderColor: color, transform: [{ rotate: '45deg' }] }} />
          <View style={{ position: 'absolute', right: 2, top: 0, width: 3, height: 3, borderRadius: 2, backgroundColor: color }} />
        </View>
      </View>
      <View style={{ position: 'absolute', right: 0, top: 0, width: 7, height: 7, backgroundColor: 'transparent', borderLeftWidth: 1.5, borderBottomWidth: 1.5, borderColor: color }} />
    </View>
  );
}
