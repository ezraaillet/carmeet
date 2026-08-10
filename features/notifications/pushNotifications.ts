import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { supabase } from "@/database/supabase";

export type PushNotificationData = {
  meet_id?: string;
  request_id?: string;
  user_id?: string;
};

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function registerForPushNotifications(userId: string) {
  if (Platform.OS === "web" || !Device.isDevice) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#ef4444",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== Notifications.PermissionStatus.GRANTED) {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== Notifications.PermissionStatus.GRANTED) return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn("Cannot register push notifications without an EAS project ID.");
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      expo_push_token: token,
      platform: Platform.OS,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "expo_push_token" },
  );

  if (error) throw error;
  return token;
}

export async function removePushTokenForUser(userId: string) {
  if (Platform.OS === "web") return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId || !Device.isDevice) return;

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("expo_push_token", token);
  } catch (error: any) {
    console.warn("Could not remove push token:", error?.message ?? error);
  }
}
