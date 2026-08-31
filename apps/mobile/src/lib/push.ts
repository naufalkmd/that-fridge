import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { api } from "@/lib/api";

// Remote push registration. Best-effort throughout: the in-app notification feed is the
// source of truth, a push is just a nudge, and older builds without the aps-environment
// entitlement (added by the expo-notifications config plugin — needs a native rebuild,
// see apps/mobile/RELEASE.md) will simply fail here and carry on.

let registeredToken: string | null = null;

export async function registerForPush(): Promise<void> {
  try {
    // The simulator can't be issued an APNs token.
    if (!Device.isDevice) return;

    const existing = await Notifications.getPermissionsAsync();
    let granted =
      existing.granted ||
      existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

    if (!granted) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as
      string | undefined;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    if (!token || token === registeredToken) return;

    await api.registerPushToken(
      token,
      Platform.OS === "ios" ? "ios" : "android",
    );
    registeredToken = token;
  } catch {
    // ignore — see file header
  }
}

/**
 * Hand the current device's token back so the server stops pushing to it. Call this while
 * still authenticated (before the token is cleared), i.e. at the top of sign-out.
 */
export async function unregisterPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await api.unregisterPushToken(token);
  } catch {
    // ignore — the server prunes dead tokens on the next failed send anyway
  }
}
