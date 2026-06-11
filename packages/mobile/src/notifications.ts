import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

// Push notifications for the app. The daemon (packages/backend/src/push.ts) sends
// straight to FCM v1 via firebase-admin, so the app needs the *native* FCM device
// token (getDevicePushTokenAsync), not an Expo push token. Getting that token on
// Android requires Google Play Services and a google-services.json baked into the
// build (app.json -> android.googleServicesFile).

// Foreground display behaviour. The daemon only pushes when NO client is connected,
// so a foregrounded app normally won't receive one — but set a sane handler anyway.
// Guarded: a dev build without the expo-notifications native module would otherwise
// throw at module load and crash the whole app.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // native module not present in this build — notifications are inert until rebuilt
}

// Request permission, ensure an Android channel exists, and return the raw FCM
// registration token. Returns null when push is unavailable (emulator without Play
// Services, permission denied, missing FCM config, or a build without the native
// module) so callers can degrade gracefully — the app still works, it just won't
// get background pushes.
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;

    // On Android 8+ a channel must exist before the permission prompt / token request.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#ec4899',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted) {
      // Android 13+ shows a runtime POST_NOTIFICATIONS prompt here.
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (!granted) return null;

    const token = await Notifications.getDevicePushTokenAsync();
    return token.data; // native FCM registration token (string on Android)
  } catch {
    // No native module, or google-services.json / FCM not configured in the build.
    return null;
  }
}

// Subscribe to notification taps (deep-linking). Guarded the same way; returns a
// no-op unsubscribe if the native module isn't in this build.
export function addNotificationTapListener(handler: (threadId: string) => void): () => void {
  try {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { threadId?: string };
      if (data?.threadId) handler(String(data.threadId));
    });
    // App launched by tapping a notification while terminated.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const data = response?.notification.request.content.data as
          | { threadId?: string }
          | undefined;
        if (data?.threadId) handler(String(data.threadId));
      })
      .catch(() => {});
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
