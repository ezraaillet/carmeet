import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/database/supabase";
import { Platform } from "react-native";

export const LOCATION_TRACKING_TASK = "cruizr-background-location";
export const LOCATION_TRACKING_PREFERENCE_KEY =
  "cruizr:location-tracking-mode";

export type LocationTrackingMode = "while_using" | "always";

async function publishLocation(location: Location.LocationObject) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { error } = await supabase.from("locations").upsert({
    user_id: user.id,
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    heading: location.coords.heading ?? null,
    speed: location.coords.speed ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.warn("Background location update failed:", error.message);
  }
}

if (
  Platform.OS !== "web" &&
  !TaskManager.isTaskDefined(LOCATION_TRACKING_TASK)
) {
  TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
    if (error) {
      console.warn("Background location task failed:", error.message);
      return;
    }

    const mode = await AsyncStorage.getItem(LOCATION_TRACKING_PREFERENCE_KEY);
    if (mode !== "always") return;

    const locations = (data as { locations?: Location.LocationObject[] } | null)
      ?.locations;
    const latestLocation = locations?.[locations.length - 1];
    if (latestLocation) await publishLocation(latestLocation);
  });
}

export async function getLocationTrackingMode(): Promise<LocationTrackingMode> {
  const stored = await AsyncStorage.getItem(LOCATION_TRACKING_PREFERENCE_KEY);
  return stored === "always" ? "always" : "while_using";
}

export async function stopBackgroundLocationTracking() {
  if (Platform.OS === "web") return;

  const started = await Location.hasStartedLocationUpdatesAsync(
    LOCATION_TRACKING_TASK,
  );
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TRACKING_TASK);
  }
}

export async function setLocationTrackingMode(
  mode: LocationTrackingMode,
): Promise<{ mode: LocationTrackingMode; denied: boolean }> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(
      LOCATION_TRACKING_PREFERENCE_KEY,
      "while_using",
    );
    return { mode: "while_using", denied: false };
  }

  if (mode === "while_using") {
    await stopBackgroundLocationTracking();
    await AsyncStorage.setItem(LOCATION_TRACKING_PREFERENCE_KEY, mode);
    return { mode, denied: false };
  }

  const foreground = await Location.getForegroundPermissionsAsync();
  if (foreground.status !== Location.PermissionStatus.GRANTED) {
    return { mode: "while_using", denied: true };
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== Location.PermissionStatus.GRANTED) {
    await AsyncStorage.setItem(
      LOCATION_TRACKING_PREFERENCE_KEY,
      "while_using",
    );
    return { mode: "while_using", denied: true };
  }

  const started = await Location.hasStartedLocationUpdatesAsync(
    LOCATION_TRACKING_TASK,
  );
  if (!started) {
    await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 25,
      timeInterval: 15000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Cruizr location sharing is active",
        notificationBody: "Cruizr is updating your location for friends.",
        notificationColor: "#ef4444",
      },
    });
  }

  await AsyncStorage.setItem(LOCATION_TRACKING_PREFERENCE_KEY, mode);
  return { mode, denied: false };
}
