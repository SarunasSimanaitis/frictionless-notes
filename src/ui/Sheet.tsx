import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from '../styles';
import { palette } from '../theme';
import { Icon, type IconName } from './Icon';

/** A bottom sheet for short menus and settings. Tapping outside or pressing back closes it. */
export function Sheet({ visible, title, subtitle, onClose, children, scrollable = false }: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  scrollable?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
        <View style={[styles.sheetPanel, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <View style={styles.sheetGrabber} />
          {title ? (
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{title}</Text>
              {subtitle ? <Text style={styles.sheetSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
            </View>
          ) : null}
          {scrollable ? (
            <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>{children}</ScrollView>
          ) : children}
        </View>
      </View>
    </Modal>
  );
}

export function SheetAction({ icon, label, detail, danger = false, selected = false, onPress }: {
  icon?: IconName;
  label: string;
  detail?: string;
  danger?: boolean;
  selected?: boolean;
  onPress: () => void;
}) {
  const color = danger ? palette.danger : palette.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.sheetAction, pressed && styles.rowPressed]}
    >
      {icon ? <Icon name={icon} size={22} color={color} /> : null}
      <View style={styles.sheetActionCopy}>
        <Text style={[styles.sheetActionLabel, { color }]}>{label}</Text>
        {detail ? <Text style={styles.sheetActionDetail}>{detail}</Text> : null}
      </View>
      {selected ? <Icon name="check" size={20} color={palette.accent} /> : null}
    </Pressable>
  );
}
