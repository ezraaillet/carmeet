import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, {
  AnimatedRegion,
  Marker,
  MarkerAnimated,
  PROVIDER_GOOGLE,
  Region,
} from "react-native-maps";

import styles from "@/styles/mapstyles";
import { supabase } from "../database/supabase";
import { useFocusEffect } from "@react-navigation/native";
import { useMapData } from "@/components/MapDataProvider";
import { useRouter } from "expo-router";
import { ensureMinimalProfileExists, hasMapProfileData } from "@/utils/profileReadiness";

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

function formatMeetWhen(startTime?: string | null, endTime?: string | null) {
  if (!startTime) return "Time TBD";

  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : null;

  if (!Number.isFinite(start.getTime())) return "Time TBD";

  const startLabel = start.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  if (!end || !Number.isFinite(end.getTime())) return startLabel;

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    const endClock = end.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });

    return `${startLabel} - ${endClock}`;
  }

  const endLabel = end.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return `${startLabel} → ${endLabel}`;
}

function formatMeetStatus(status?: string | null) {
  if (!status) return "Planned";
  return status
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function distanceInMeters(a: LiveLoc, b: LiveLoc) {
  const avgLatRad = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  const metersPerDegLat = 111_111;
  const metersPerDegLng = 111_111 * Math.cos(avgLatRad);

  const dLat = (a.lat - b.lat) * metersPerDegLat;
  const dLng = (a.lng - b.lng) * metersPerDegLng;

  return Math.hypot(dLat, dLng);
}

function distanceBetweenCoordsMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
) {
  const avgLatRad = (((a.latitude + b.latitude) / 2) * Math.PI) / 180;
  const metersPerDegLat = 111_111;
  const metersPerDegLng = 111_111 * Math.cos(avgLatRad);

  const dLat = (a.latitude - b.latitude) * metersPerDegLat;
  const dLng = (a.longitude - b.longitude) * metersPerDegLng;

  return Math.hypot(dLat, dLng);
}

const MARKER_JITTER_THRESHOLD_METERS = 2;
const MARKER_SNAP_THRESHOLD_METERS = 350;
const MARKER_ANIMATION_DURATION_MS = 900;

type AnimatedUserMarkerProps = {
  userId: string;
  coordinate: AnimatedRegion;
  title: string;
  description: string;
  fresh: boolean;
  markerUri: string | null;
  markerInitials: string;
  onPress: (userId: string) => void;
  onRef: (userId: string, marker: MarkerAnimated | null) => void;
};

const AnimatedUserMarker = React.memo(function AnimatedUserMarker({
  userId,
  coordinate,
  title,
  description,
  fresh,
  markerUri,
  markerInitials,
  onPress,
  onRef,
}: AnimatedUserMarkerProps) {
  return (
    <MarkerAnimated
      ref={(marker) => onRef(userId, marker)}
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      title={title}
      description={description}
      zIndex={999}
      onPress={() => onPress(userId)}
    >
      {markerUri ? (
        <Image
          source={{ uri: markerUri }}
          style={[styles.icon, { opacity: fresh ? 1 : 0.45 }]}
        />
      ) : (
        <View style={[styles.iconInitials, { opacity: fresh ? 1 : 0.45 }]}>
          <Text style={{ color: "white", fontWeight: "700" }}>
            {markerInitials}
          </Text>
        </View>
      )}
    </MarkerAnimated>
  );
});

export default function MapScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView | null>(null);

  const {
    profilesById,
    locationsById,
    meets,
    meetAttendeeSummaryByMeetId,
    loading: mapDataLoading,
    setMyLiveLocation,
  } = useMapData();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [checkingProfileReady, setCheckingProfileReady] = useState(true);
  const [, setIsProfileReady] = useState<boolean>(true);

  const [gotFix, setGotFix] = useState(false);

  const [region, setRegion] = useState<Region>({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);

  const [selectedMeetId, setSelectedMeetId] = useState<string | null>(null);
  const animatedUserCoordsRef = useRef<Record<string, AnimatedRegion>>({});
  const markerRefs = useRef<Record<string, MarkerAnimated | null>>({});
  const lastAnimatedTargetsRef = useRef<
    Record<string, { latitude: number; longitude: number }>
  >({});

  useEffect(() => {
    let mounted = true;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (mounted) {
        setAuthed(!!user);
        setMyUserId(user?.id ?? null);
        setCheckingAuth(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setAuthed(!!session?.user);
      setMyUserId(session?.user?.id ?? null);
      setCheckingAuth(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!authed || !myUserId) {
        setCheckingProfileReady(false);
        setIsProfileReady(false);
        return;
      }

      setCheckingProfileReady(true);

      try {
        const profile = await ensureMinimalProfileExists(myUserId);
        if (cancelled) return;
        setIsProfileReady(hasMapProfileData(profile));
      } catch {
        if (cancelled) return;
        setIsProfileReady(false);
      }

      setCheckingProfileReady(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authed, myUserId]);

  useEffect(() => {
    if (checkingAuth) return;
    if (!authed) {
      router.navigate("/");
    }
  }, [checkingAuth, authed, router]);

  useEffect(() => {
    (async () => {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== "granted") {
        setHasPermission(false);
        return;
      }

      await Location.requestBackgroundPermissionsAsync();
      setHasPermission(true);
    })();
  }, []);

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
    }, [
      hasPermission,
      authed,
      upsertMyLocation,
      setMyLiveLocation,
      myUserId,
    ])
  );

  const all = locationsById;

  const mapMarkers = useMemo(() => {
    const nearbyThresholdMeters = 40;
    const usersWithProfiles = Object.values(all).filter(
      (loc) => !!profilesById[loc.user_id]
    );

    const visited = new Set<string>();
    const groups: LiveLoc[][] = [];

    for (const loc of usersWithProfiles) {
      if (visited.has(loc.user_id)) continue;

      const queue: LiveLoc[] = [loc];
      const group: LiveLoc[] = [];
      visited.add(loc.user_id);

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;

        group.push(current);

        usersWithProfiles.forEach((candidate) => {
          if (visited.has(candidate.user_id)) return;

          if (distanceInMeters(current, candidate) <= nearbyThresholdMeters) {
            visited.add(candidate.user_id);
            queue.push(candidate);
          }
        });
      }

      groups.push(group);
    }

    const renderedMarkers: (
      | {
          type: "user";
          loc: LiveLoc;
          adjLat: number;
          adjLng: number;
        }
      | {
          type: "cluster";
          key: string;
          lat: number;
          lng: number;
          count: number;
        }
    )[] = [];

    groups.forEach((group, groupIdx) => {
      if (group.length > 3) {
        const centerLat =
          group.reduce((sum, loc) => sum + loc.lat, 0) / group.length;
        const centerLng =
          group.reduce((sum, loc) => sum + loc.lng, 0) / group.length;

        renderedMarkers.push({
          type: "cluster",
          key: `cluster-${groupIdx}`,
          lat: centerLat,
          lng: centerLng,
          count: group.length,
        });
        return;
      }

      if (group.length === 1) {
        const [loc] = group;
        renderedMarkers.push({
          type: "user",
          loc,
          adjLat: loc.lat,
          adjLng: loc.lng,
        });
        return;
      }

      const radiusMeters = 14 + 4 * (group.length - 2);

      group.forEach((loc, i) => {
        const angle = (2 * Math.PI * i) / group.length;

        const latRad = (loc.lat * Math.PI) / 180;
        const metersPerDegLat = 111_111;
        const metersPerDegLng = 111_111 * Math.cos(latRad);

        const dx = radiusMeters * Math.cos(angle);
        const dy = radiusMeters * Math.sin(angle);

        renderedMarkers.push({
          type: "user",
          loc,
          adjLat: loc.lat + dy / metersPerDegLat,
          adjLng: loc.lng + dx / metersPerDegLng,
        });
      });
    });

    return renderedMarkers;
  }, [all, profilesById]);

  const meetMarkers = useMemo(() => {
    return meets
      .filter((meet) => Number.isFinite(meet.latitude) && Number.isFinite(meet.longitude))
      .map((meet) => ({
        ...meet,
        latitude: Number(meet.latitude),
        longitude: Number(meet.longitude),
      }));
  }, [meets]);

  const userMarkerItems = useMemo(
    () =>
      mapMarkers.filter(
        (
          item
        ): item is {
          type: "user";
          loc: LiveLoc;
          adjLat: number;
          adjLng: number;
        } => item.type === "user"
      ),
    [mapMarkers]
  );

  const getOrCreateAnimatedUserCoordinate = useCallback(
    (userId: string, latitude: number, longitude: number) => {
      let coord = animatedUserCoordsRef.current[userId];

      if (!coord) {
        coord = new AnimatedRegion({
          latitude,
          longitude,
          latitudeDelta: 0,
          longitudeDelta: 0,
        });
        animatedUserCoordsRef.current[userId] = coord;
        lastAnimatedTargetsRef.current[userId] = { latitude, longitude };
      }

      return coord;
    },
    []
  );

  useEffect(() => {
    const nextUserIds = new Set(userMarkerItems.map((item) => item.loc.user_id));

    Object.keys(animatedUserCoordsRef.current).forEach((userId) => {
      if (!nextUserIds.has(userId)) {
        delete animatedUserCoordsRef.current[userId];
        delete markerRefs.current[userId];
        delete lastAnimatedTargetsRef.current[userId];
      }
    });

    userMarkerItems.forEach((item) => {
      const userId = item.loc.user_id;
      const nextCoordinate = {
        latitude: item.adjLat,
        longitude: item.adjLng,
      };

      const animatedCoord = getOrCreateAnimatedUserCoordinate(
        userId,
        nextCoordinate.latitude,
        nextCoordinate.longitude
      );

      const last = lastAnimatedTargetsRef.current[userId] ?? nextCoordinate;
      const metersMoved = distanceBetweenCoordsMeters(last, nextCoordinate);

      if (metersMoved < MARKER_JITTER_THRESHOLD_METERS) return;

      lastAnimatedTargetsRef.current[userId] = nextCoordinate;

      if (metersMoved > MARKER_SNAP_THRESHOLD_METERS) {
        animatedCoord.setValue(nextCoordinate);
        return;
      }

      if (Platform.OS === "android") {
        markerRefs.current[userId]?.animateMarkerToCoordinate(
          nextCoordinate,
          MARKER_ANIMATION_DURATION_MS
        );
        return;
      }

      animatedCoord
        .timing({
          ...nextCoordinate,
          duration: MARKER_ANIMATION_DURATION_MS,
          useNativeDriver: false,
          easing: Easing.linear,
        })
        .start();
    });
  }, [getOrCreateAnimatedUserCoordinate, userMarkerItems]);

  const selectedMeet = useMemo(() => {
    if (!selectedMeetId) return null;
    return meetMarkers.find((meet) => meet.id === selectedMeetId) ?? null;
  }, [selectedMeetId, meetMarkers]);

  const handleMarkerPress = useCallback(
    async (userId: string) => {
      if (!userId || userId === myUserId) return;

      setSelectedMeetId(null);
      setSelectedUserId(userId);
      setProfileError(null);

      const cached = profilesById[userId];
      if (cached) {
        setSelectedProfile(cached);
        setProfileLoading(false);
        return;
      }

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

  const promptCompleteProfile = useCallback(() => {
    Alert.alert(
      "Complete your profile",
      "Finish your profile to add friends and interact with meets.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Go to Profile", onPress: () => router.push("/profile?onboarding=1") },
      ]
    );
  }, [router]);

  const canUseProfileGatedActions = useCallback(async () => {
    if (!myUserId) return false;

    try {
      const profile = await ensureMinimalProfileExists(myUserId);
      const ready = hasMapProfileData(profile);
      setIsProfileReady(ready);

      if (!ready) {
        promptCompleteProfile();
      }

      return ready;
    } catch {
      promptCompleteProfile();
      return false;
    }
  }, [myUserId, promptCompleteProfile]);

  const sendFriendRequest = useCallback(async () => {
    if (!myUserId || !selectedUserId) return;
    if (myUserId === selectedUserId) return;
    const canProceed = await canUseProfileGatedActions();
    if (!canProceed) return;

    try {
      setSendingRequest(true);
      const { error } = await supabase.from("friend_requests").insert({
        from_user_id: myUserId,
        to_user_id: selectedUserId,
        status: "pending",
        created_at: new Date().toISOString(),
      });

      if (error) {
        setProfileError(error.message);
      } else {
        setProfileError(null);
      }
    } finally {
      setSendingRequest(false);
    }
  }, [myUserId, selectedUserId, canUseProfileGatedActions]);

  if (checkingAuth || checkingProfileReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Checking account…</Text>
      </View>
    );
  }

  if (!authed) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>
          Sign in required
        </Text>
        <Text style={{ marginTop: 10, textAlign: "center", opacity: 0.85 }}>
          Please sign in or create an account before using the map.
        </Text>

        <Pressable
          onPress={() => router.navigate("/")}
          style={({ pressed }) => [
            styles.friendBtn,
            { marginTop: 16, paddingHorizontal: 18 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.friendBtnText}>Go to Home</Text>
        </Pressable>
      </View>
    );
  }

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
        {meetMarkers.map((meet) => (
          <Marker
            key={`meet-${meet.id}`}
            coordinate={{ latitude: meet.latitude, longitude: meet.longitude }}
            title={meet.title || "Meet"}
            description={meet.location_name || "Car meet"}
            pinColor="#f97316"
            zIndex={400}
            onPress={() => {
              closeProfileCard();
              setSelectedMeetId(meet.id);
            }}
          />
        ))}

        {mapMarkers.map((item) => {
          if (item.type === "cluster") {
            return (
              <Marker
                key={item.key}
                coordinate={{ latitude: item.lat, longitude: item.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                title="Nearby group"
                description={`${item.count} people nearby`}
                zIndex={1000}
                onPress={() => {
                  closeProfileCard();
                  setSelectedMeetId(null);
                }}
              >
                <View style={styles.clusterBubble}>
                  <Text style={styles.clusterBubbleText}>3+</Text>
                </View>
              </Marker>
            );
          }

          const { loc, adjLat, adjLng } = item;
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
          const markerUri = p?.photo_url ?? null;

          const animatedCoordinate = getOrCreateAnimatedUserCoordinate(
            loc.user_id,
            adjLat,
            adjLng
          );

          return (
            <AnimatedUserMarker
              key={loc.user_id}
              userId={loc.user_id}
              coordinate={animatedCoordinate}
              title={markerName}
              description={fresh ? "Live" : `Last seen ${lastSeen}`}
              fresh={fresh}
              markerUri={markerUri}
              markerInitials={markerInitials}
              onPress={handleMarkerPress}
              onRef={(userId, marker) => {
                markerRefs.current[userId] = marker;
              }}
            />
          );
        })}
      </MapView>

      {selectedMeet && (
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{selectedMeet.title || "Meet"}</Text>
                <Text style={styles.cardSub}>
                  {selectedMeet.location_name || selectedMeet.address || "Location TBD"}
                </Text>
                <Text style={styles.cardSubSmall}>
                  {formatMeetWhen(selectedMeet.start_time, selectedMeet.end_time)}
                </Text>
                <Text style={styles.cardSubSmall}>
                  {formatMeetStatus(selectedMeet.status)} · {meetAttendeeSummaryByMeetId[selectedMeet.id]?.going ?? 0} going
                </Text>
              </View>

              <Pressable onPress={() => setSelectedMeetId(null)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {selectedMeet.description ? (
              <Text style={styles.meetDescriptionText} numberOfLines={3}>
                {selectedMeet.description}
              </Text>
            ) : null}

          </View>
        </View>
      )}

      {selectedUserId && !selectedMeetId && (
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
                  <Text style={styles.cardSub}>@{selectedProfile.username}</Text>
                )}
                {selectedProfile?.location_visibility && (
                  <Text style={styles.cardSubSmall}>
                    Location: {selectedProfile.location_visibility}
                  </Text>
                )}

                {locationsById[selectedUserId]?.updated_at && (
                  <Text style={styles.cardSubSmall}>
                    Last seen: {formatLastSeen(locationsById[selectedUserId]?.updated_at)}
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

            {profileError && <Text style={styles.errorText}>{profileError}</Text>}

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
