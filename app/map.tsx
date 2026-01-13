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
import { useMapData } from "@/components/MapDataProvider";

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
  location_visibility?: string | null;
};

function isFresh(updatedAt?: string | null, maxAgeMs = 2 * 60 * 1000) {
  if (!updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= maxAgeMs;
}

function formatLastSeen(updatedAt?: string | null) {
  if (!updatedAt) return "unknown";
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return "unknown";
  const diffMs = Date.now() - t;
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function MapScreen() {
  console.log("MAP VERSION:", Date.now());

  const mapRef = useRef<MapView | null>(null);

  // ✅ Use cached map data (friends + nearby) + preloaded profiles
  const {
    profilesById,
    locationsById,
    loading: mapDataLoading,
    setMyLiveLocation,
  } = useMapData();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // NEW: GPS fix gate
  const [gotFix, setGotFix] = useState(false);

  const [region, setRegion] = useState<Region>({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // ---- selected profile card state ----
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

  // -------------- Permissions --------------
  useEffect(() => {
    (async () => {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== "granted") {
        setHasPermission(false);
        return;
      }

      // Ask for “Always”
      const bg = await Location.requestBackgroundPermissionsAsync();
      console.log("BG permission:", bg.status);

      setHasPermission(true);
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
      let cancelled = false;

      (async () => {
        try {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.BestForNavigation,
          });

          if (cancelled) return;

          // ✅ Update local cache immediately so your marker snaps to true current position
          const uid =
            myUserId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
          if (uid) {
            setMyLiveLocation({
              user_id: uid,
              lat: current.coords.latitude,
              lng: current.coords.longitude,
              heading: current.coords.heading ?? undefined,
              speed: current.coords.speed ?? undefined,
              updated_at: new Date().toISOString(),
            });
          }

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

          setGotFix(true);

          await upsertMyLocation(
            current.coords.latitude,
            current.coords.longitude,
            current.coords.heading ?? undefined,
            current.coords.speed ?? undefined
          );

          sub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.BestForNavigation,
              distanceInterval: 5,
              timeInterval: 3000,
            },
            async ({ coords }) => {
              // ✅ Keep local cache in sync so your marker moves immediately
              if (myUserId) {
                setMyLiveLocation({
                  user_id: myUserId,
                  lat: coords.latitude,
                  lng: coords.longitude,
                  heading: coords.heading ?? undefined,
                  speed: coords.speed ?? undefined,
                  updated_at: new Date().toISOString(),
                });
              }

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
        } catch (e: any) {
          console.warn("Location watch error:", e?.message ?? e);
        }
      })();

      return () => {
        cancelled = true;
        sub?.remove();
      };
    }, [hasPermission, authed, upsertMyLocation, setMyLiveLocation, myUserId])
  );

  // ✅ Replace local "all" with cached locations
  const all = locationsById;

  // -------------- Anti-collision (spread overlapping markers more) --------------
  const spread = useMemo(() => {
    const groups = new Map<string, LiveLoc[]>();
    const round = (v: number) => Math.round(v * 1e5) / 1e5; // group by ~1 meter

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

      const baseRadiusMeters = 20;
      const extraPerUser = 5;
      const radiusMeters =
        baseRadiusMeters + extraPerUser * Math.max(0, arr.length - 2);

      arr.forEach((loc, i) => {
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
      if (!userId || userId === myUserId) return;

      setSelectedUserId(userId);
      setProfileError(null);

      // ✅ If we already have it in cache, use it immediately
      const cached = profilesById[userId];
      if (cached) {
        setSelectedProfile(cached);
        setProfileLoading(false);
        return;
      }

      // fallback (should be rare once preloading is working)
      setProfileLoading(true);
      setSelectedProfile(null);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle<Profile>();

      if (error) setProfileError(error.message);
      else if (data) setSelectedProfile(data);
      else setProfileError("No profile found for this user.");

      setProfileLoading(false);
    },
    [myUserId, profilesById]
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
    mapDataLoading ||
    (hasPermission && !gotFix);

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
        {/* ✅ Render only markers with loaded profiles */}
        {spread
          .filter(({ loc }) => !!profilesById[loc.user_id])
          .map(({ loc, adjLat, adjLng }) => {
            const p = profilesById[loc.user_id];

            const markerName =
              p?.display_name || p?.username || loc.user_id.slice(0, 8);

            const markerInitials = markerName
              .split(" ")
              .map((x) => x[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            const fresh = isFresh(loc.updated_at, 2 * 60 * 1000);
            const lastSeen = formatLastSeen(loc.updated_at);

            // ✅ Use actual profile photo for marker
            const markerUri = p?.photo_url ?? null;

            return (
              <Marker
                key={loc.user_id}
                coordinate={{ latitude: adjLat, longitude: adjLng }}
                anchor={{ x: 0.5, y: 0.5 }}
                title={markerName}
                // ✅ show last seen in native callout
                description={fresh ? "Live" : `Last seen ${lastSeen}`}
                zIndex={999}
                onPress={() => handleMarkerPress(loc.user_id)}
              >
                {markerUri ? (
                  <Image
                    source={{ uri: markerUri }}
                    style={{
                      width: 44,
                      height: 44,
                      borderColor: "white",
                      borderWidth: 2,
                      borderRadius: 22,
                      backgroundColor: "#000",
                      opacity: fresh ? 1 : 0.45, // ✅ ghost stale users
                    }}
                  />
                ) : (
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      borderColor: "white",
                      borderWidth: 2,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#222",
                      opacity: fresh ? 1 : 0.45, // ✅ ghost stale users
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "700" }}>
                      {markerInitials}
                    </Text>
                  </View>
                )}
              </Marker>
            );
          })}
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
                {selectedProfile?.location_visibility && (
                  <Text style={styles.cardSubSmall}>
                    Location: {selectedProfile.location_visibility}
                  </Text>
                )}

                {/* ✅ show last seen in your overlay card too */}
                {locationsById[selectedUserId]?.updated_at && (
                  <Text style={styles.cardSubSmall}>
                    Last seen:{" "}
                    {formatLastSeen(locationsById[selectedUserId]?.updated_at)}
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
