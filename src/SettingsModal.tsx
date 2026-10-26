import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AppPreferences } from './types';
import type { NotificationPermission } from './notifications';

const palette = {
  background: '#F7F6F1', surface: '#FFFFFF', ink: '#242923', muted: '#74796F',
  faint: '#9A9D95', line: '#E7E7DF', accent: '#366A52', accentSoft: '#E8F0E9',
};

interface SettingsModalProps {
  visible: boolean;
  preferences: AppPreferences;
  permission: NotificationPermission;
  onClose: () => void;
  onPreferencesChange: (preferences: AppPreferences) => void;
  onReminderSettingChange: (enabled: boolean) => void;
}

function timeAsDate(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function SettingsModal({
  visible,
  preferences,
  permission,
  onClose,
  onPreferencesChange,
  onReminderSettingChange,
}: SettingsModalProps) {
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(() => timeAsDate(preferences.afterWorkTime));

  useEffect(() => {
    setPickerDate(timeAsDate(preferences.afterWorkTime));
  }, [preferences.afterWorkTime]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.headerAction}>
            <Text style={styles.headerActionText}>‹ Notes</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerAction} />
        </View>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>REMINDERS</Text>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceCopy}>
              <Text style={styles.preferenceTitle}>Reminder notifications</Text>
              <Text style={styles.preferenceDescription}>
                {!permission.granted
                  ? 'Saved reminders stay here; notifications need permission.'
                  : permission.channelEnabled === false
                    ? 'Reminders are enabled, but the Reminders channel is blocked in Android settings.'
                    : 'Upcoming reminders can notify you.'}
              </Text>
            </View>
            <Switch
              accessibilityLabel="Enable reminder notifications"
              value={preferences.remindersEnabled}
              onValueChange={onReminderSettingChange}
              trackColor={{ false: '#D7D9D2', true: '#AFC8B7' }}
              thumbColor={preferences.remindersEnabled ? palette.accent : '#FFFFFF'}
            />
          </View>
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>Notification permission</Text>
            <Text style={styles.permissionDescription}>
                {!permission.granted
                  ? permission.canAskAgain
                    ? 'Not allowed yet. You can allow it when saving a reminder.'
                    : 'Blocked by Android or iOS settings. Reminders will not alert you until permission is restored.'
                  : permission.channelEnabled === false
                    ? 'Blocked for the Reminders channel in Android notification settings.'
                    : 'Allowed on this device.'}
            </Text>
            {!permission.granted || permission.channelEnabled === false ? (
              <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.systemSettingsButton}>
                <Text style={styles.systemSettingsText}>Open system settings</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.sectionRule} />
          <Text style={styles.eyebrow}>QUICK TIME</Text>
          <Text style={styles.preferenceTitle}>After work</Text>
          <Text style={styles.preferenceDescription}>New “After work” reminders use this time.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`After work time ${preferences.afterWorkTime}`}
            onPress={() => setShowTimePicker(true)}
            style={({ pressed }) => [styles.timeButton, pressed && styles.pressed]}
          >
            <Text style={styles.timeButtonText}>{preferences.afterWorkTime}</Text>
            <Text style={styles.timeButtonHint}>Change time</Text>
          </Pressable>
          {showTimePicker ? (
            <DateTimePicker
              value={pickerDate}
              mode="time"
              display="default"
              onChange={(_, selectedDate) => {
                setShowTimePicker(false);
                if (selectedDate) {
                  setPickerDate(selectedDate);
                  onPreferencesChange({ ...preferences, afterWorkTime: formatTime(selectedDate) });
                }
              }}
            />
          ) : null}
          <Text style={styles.smallNote}>Times follow this device’s local time zone.</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  header: { minHeight: 58, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerAction: { minWidth: 78, minHeight: 48, justifyContent: 'center' },
  headerActionText: { color: palette.accent, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: palette.ink, fontSize: 19, fontWeight: '700' },
  content: { paddingHorizontal: 22, paddingTop: 18 },
  eyebrow: { color: palette.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1, marginBottom: 13 },
  preferenceRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14 },
  preferenceCopy: { flex: 1 },
  preferenceTitle: { color: palette.ink, fontSize: 16, fontWeight: '600' },
  preferenceDescription: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  permissionCard: { padding: 15, marginTop: 12, borderRadius: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  permissionTitle: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  permissionDescription: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  systemSettingsButton: { alignSelf: 'flex-start', minHeight: 48, marginTop: 12, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 11, backgroundColor: palette.accentSoft },
  systemSettingsText: { color: palette.accent, fontSize: 13, fontWeight: '700' },
  sectionRule: { height: StyleSheet.hairlineWidth, backgroundColor: palette.line, marginTop: 24, marginBottom: 24 },
  timeButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, marginTop: 12, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  timeButtonText: { color: palette.ink, fontSize: 17, fontWeight: '700' },
  timeButtonHint: { color: palette.accent, fontSize: 13, fontWeight: '600' },
  smallNote: { color: palette.faint, fontSize: 12, marginTop: 10 },
  pressed: { opacity: 0.72 },
});
