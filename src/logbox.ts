import { LogBox } from 'react-native';

// This app schedules local reminders only. Expo Go's startup warnings below
// concern the package's broader support and remote push notifications.
LogBox.ignoreLogs([
  '`expo-notifications` functionality is not fully supported in Expo Go:',
  '[expo-notifications] Push notifications (remote notifications) are unavailable in Expo Go on Android since SDK 53. Local notifications remain available.',
]);
