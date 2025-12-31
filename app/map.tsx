// app/map.tsx

import * as Location from "expo-location";

import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "@/styles/mapstyles";
import { supabase } from "../database/supabase";
import { useFocusEffect } from "@react-navigation/native";

type LiveLoc = {
  user_id: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updated_at?: string;
};

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  photo_url: string | null;
  location_vis?: string | null;
};

export default function MapScreen() {
  const mapRef = useRef<MapView | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // NEW: loading gates
  const [seeded, setSeeded] = useState(false); // finished initial fetch/subscribe
  const [gotFix, setGotFix] = useState(false); // got first GPS fix

  const [region, setRegion] = useState<Region>({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const [all, setAll] = useState<Record<string, LiveLoc>>({});

  // ---- NEW: selected profile card state ----
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);

  // ---------------- Auth state ----------------
  useEffect(() => {
    let mounted = true;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (mounted) {
        setAuthed(!!user);
        setMyUserId(user?.id ?? null);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setAuthed(!!session?.user);
      setMyUserId(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // -------------- Seed + realtime --------------
  useEffect(() => {
    if (!authed) return;

    let cleaned = false;

    (async () => {
      const { data, error } = await supabase.from("locations").select("*");
      if (!error && data && !cleaned) {
        const seed: Record<string, LiveLoc> = {};
        (data as LiveLoc[]).forEach((row) => (seed[row.user_id] = row));
        setAll(seed);
      }
      setSeeded(true); // <-- mark seed complete even if empty

      const channel = supabase
        .channel("public:locations")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "locations" },
          (payload) => {
            const row = payload.new as LiveLoc;
            setAll((prev) => ({ ...prev, [row.user_id]: row }));
          }
        )
        .subscribe();

      return () => supabase.removeChannel(channel);
    })();

    return () => {
      cleaned = true;
    };
  }, [authed]);

  // -------------- Permissions --------------
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasPermission(status === Location.PermissionStatus.GRANTED);
    })();
  }, []);

  // -------------- Upsert my location --------------
  const upsertMyLocation = useCallback(
    async (lat: number, lng: number, heading?: number, speed?: number) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("locations").upsert({
        user_id: user.id,
        lat,
        lng,
        heading,
        speed,
        updated_at: new Date().toISOString(),
      });

      if (error) console.warn("Supabase upsert error:", error.message);
    },
    []
  );

  // -------------- Watch while focused --------------
  useFocusEffect(
    useCallback(() => {
      if (!hasPermission || !authed) return;
      let sub: Location.LocationSubscription | null = null;

      (async () => {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        setRegion((r) => ({
          ...r,
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        }));

        mapRef.current?.animateCamera({
          center: {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          },
          zoom: 15,
        });

        setGotFix(true); // <-- first fix obtained

        await upsertMyLocation(
          current.coords.latitude,
          current.coords.longitude,
          current.coords.heading ?? undefined,
          current.coords.speed ?? undefined
        );

        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 10,
            timeInterval: 3000,
          },
          async ({ coords }) => {
            setRegion((r) => ({
              ...r,
              latitude: coords.latitude,
              longitude: coords.longitude,
            }));
            mapRef.current?.animateCamera({
              center: {
                latitude: coords.latitude,
                longitude: coords.longitude,
              },
            });

            await upsertMyLocation(
              coords.latitude,
              coords.longitude,
              coords.heading ?? undefined,
              coords.speed ?? undefined
            );
          }
        );
      })();

      return () => sub?.remove();
    }, [hasPermission, authed, upsertMyLocation])
  );

  // -------------- Anti-collision (spread overlapping markers more) --------------
  const spread = useMemo(() => {
    const groups = new Map<string, LiveLoc[]>();
    const round = (v: number) => Math.round(v * 1e5) / 1e5; // group by ~1 meter

    // Group by rounded lat/lng so "same spot" people end up together
    Object.values(all).forEach((loc) => {
      const key = `${round(loc.lat)}:${round(loc.lng)}`;
      const arr = groups.get(key);
      if (arr) arr.push(loc);
      else groups.set(key, [loc]);
    });

    const results: Array<{ loc: LiveLoc; adjLat: number; adjLng: number }> = [];

    for (const [, arr] of groups) {
      if (arr.length === 1) {
        const [loc] = arr;
        results.push({ loc, adjLat: loc.lat, adjLng: loc.lng });
        continue;
      }

      // 🔥 Increase radius so icons don’t overlap visually
      // baseRadius ~ 20m, plus a bit more as the group size grows
      const baseRadiusMeters = 20;
      const extraPerUser = 5; // meters extra per user after 2
      const radiusMeters =
        baseRadiusMeters + extraPerUser * Math.max(0, arr.length - 2);

      arr.forEach((loc, i) => {
        // Evenly distribute users in a circle
        const angle = (2 * Math.PI * i) / arr.length;

        const latRad = (loc.lat * Math.PI) / 180;
        const metersPerDegLat = 111_111;
        const metersPerDegLng = 111_111 * Math.cos(latRad);

        const dx = radiusMeters * Math.cos(angle);
        const dy = radiusMeters * Math.sin(angle);

        results.push({
          loc,
          adjLat: loc.lat + dy / metersPerDegLat,
          adjLng: loc.lng + dx / metersPerDegLng,
        });
      });
    }

    return results;
  }, [all]);

  // -------------- Load selected profile when clicking marker --------------
  const handleMarkerPress = useCallback(
    async (userId: string) => {
      if (!userId || userId === myUserId) {
        // don't open a card for yourself
        return;
      }

      setSelectedUserId(userId);
      setProfileLoading(true);
      setProfileError(null);
      setSelectedProfile(null);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle<Profile>();

      if (error) {
        setProfileError(error.message);
      } else if (data) {
        setSelectedProfile(data);
      } else {
        setProfileError("No profile found for this user.");
      }

      setProfileLoading(false);
    },
    [myUserId]
  );

  const closeProfileCard = () => {
    setSelectedUserId(null);
    setSelectedProfile(null);
    setProfileError(null);
    setProfileLoading(false);
  };

  const sendFriendRequest = useCallback(async () => {
    if (!myUserId || !selectedUserId) return;
    if (myUserId === selectedUserId) return;

    try {
      setSendingRequest(true);
      const { error } = await supabase.from("friend_requests").insert({
        from_user_id: myUserId,
        to_user_id: selectedUserId,
        status: "pending",
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.warn("Friend request error:", error.message);
        setProfileError(error.message);
      } else {
        setProfileError(null);
      }
    } finally {
      setSendingRequest(false);
    }
  }, [myUserId, selectedUserId]);

  // -------------- Loader logic --------------
  const showLoader =
    !authed ||
    hasPermission === null ||
    (hasPermission && (!gotFix || !seeded));

  if (showLoader) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Loading map…</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 16 }}>Location permission denied.</Text>
      </View>
    );
  }

  // -------------- Map + overlay card --------------
  const displayName =
    selectedProfile?.display_name ||
    selectedProfile?.username ||
    selectedProfile?.id?.slice(0, 8) ||
    "CarMeet user";

  const initials = (
    selectedProfile?.display_name ||
    selectedProfile?.username ||
    displayName
  )
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
      >
        {spread.map(({ loc, adjLat, adjLng }) => (
          <Marker
            key={loc.user_id}
            coordinate={{ latitude: adjLat, longitude: adjLng }}
            anchor={{ x: 0.5, y: 0.5 }}
            title={loc.user_id.slice(0, 8)}
            zIndex={999}
            onPress={() => handleMarkerPress(loc.user_id)}
          >
            <Image
              source={require("../assets/images/racing-car-with-side-skirts.png")}
              style={{
                width: 44,
                height: 44,
                borderColor: "white",
                borderWidth: 1,
                borderRadius: 22,
              }}
              resizeMode="contain"
            />
          </Marker>
        ))}
      </MapView>

      {/* Small profile card overlay */}
      {selectedUserId && (
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              {selectedProfile?.photo_url ? (
                <Image
                  source={{ uri: selectedProfile.photo_url }}
                  style={styles.avatar}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>{initials}</Text>
                </View>
              )}

              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.cardName}>{displayName}</Text>
                {selectedProfile?.username && (
                  <Text style={styles.cardSub}>
                    @{selectedProfile.username}
                  </Text>
                )}
                {selectedProfile?.location_vis && (
                  <Text style={styles.cardSubSmall}>
                    Location: {selectedProfile.location_vis}
                  </Text>
                )}
              </View>

              <Pressable onPress={closeProfileCard} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {profileLoading && (
              <View style={{ marginTop: 8 }}>
                <ActivityIndicator />
              </View>
            )}

            {profileError && (
              <Text style={styles.errorText}>{profileError}</Text>
            )}

            <View style={styles.cardActions}>
              <Pressable
                onPress={sendFriendRequest}
                disabled={sendingRequest || !!profileError || profileLoading}
                style={({ pressed }) => [
                  styles.friendBtn,
                  (pressed || sendingRequest) && { opacity: 0.8 },
                ]}
              >
                {sendingRequest ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.friendBtnText}>Send Friend Request</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
