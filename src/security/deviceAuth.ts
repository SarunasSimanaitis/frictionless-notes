import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type AuthOutcome = 'success' | 'cancelled' | 'unavailable';

/** How long the app may sit in the background before App lock asks again. */
export const APP_LOCK_GRACE_MS = 20_000;
/** A successful unlock also covers locked notes for this long, so one tap does not mean two prompts. */
const RECENT_AUTH_MS = 30_000;

let lastAuthAt = 0;
let externalActivities = 0;

/** True when the device has a screen lock (PIN, pattern, password, fingerprint or face) to check against. */
export async function isDeviceLockAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export function wasRecentlyAuthenticated(now = Date.now()): boolean {
  return now - lastAuthAt < RECENT_AUTH_MS;
}

/**
 * Runs something that sends the user to another screen on purpose (the photo picker,
 * the share sheet, the system unlock prompt) so that coming back does not re-lock the app.
 */
export async function runWithoutAppLock<T>(task: () => Promise<T>): Promise<T> {
  externalActivities += 1;
  try {
    return await task();
  } finally {
    // The app becomes active again a moment after the task settles.
    setTimeout(() => { externalActivities = Math.max(0, externalActivities - 1); }, 1_000);
  }
}

export function isAppLockSuppressed(): boolean {
  return externalActivities > 0;
}

/** Asks for the fingerprint, face or device PIN. Nothing about the result is stored. */
export async function authenticate(promptMessage: string): Promise<AuthOutcome> {
  if (!(await isDeviceLockAvailable())) return 'unavailable';
  return runWithoutAppLock(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (result.success) {
        lastAuthAt = Date.now();
        return 'success';
      }
      return 'cancelled';
    } catch {
      return 'cancelled';
    }
  });
}
