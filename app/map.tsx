import * as ExpoLinking from "expo-linking";
import * as Location from "expo-location";

import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Car, FriendRelationshipState, LiveLoc, Profile } from "@/features/map/mapTypes";
import MapView, {
  AnimatedRegion,
  Marker,
  MarkerAnimated,
  PROVIDER_GOOGLE,
  Region,
} from "react-native-maps";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  distanceBetweenCoordsMeters,
  distanceInMeters,
  formatLastSeen,
  formatMeetStatus,
  formatMeetWhen,
  isFresh,
} from "@/features/map/mapHelpers";
import { ensureMinimalProfileExists, hasMapProfileData } from "@/utils/profileReadiness";
import {
  fetchUserMarkerCardData,
  getCurrentAuthUser,
  insertFriendRequest,
  upsertLocation,
} from "@/features/map/mapService";
import { useLocalSearchParams, useRouter } from "expo-router";

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/styles/themes";
import styles from "@/styles/mapstyles";
import { supabase } from "../database/supabase";
import { useFocusEffect } from "@react-navigation/native";
import { PUBLIC_DISCOVERY_RADIUS_METERS, useMapData } from "@/components/MapDataProvider";

const MARKER_JITTER_THRESHOLD_METERS = 2;
const MARKER_SNAP_THRESHOLD_METERS = 350;
const MARKER_ANIMATION_DURATION_MS = 900;
const OVERLAP_THRESHOLD_METERS = 1.5;
const OVERLAP_SPREAD_RADIUS_METERS = 7;
const CLUSTER_CURRENT_USER_OVERLAP_THRESHOLD_METERS = 18;
const CLUSTER_MIN_SIZE = 4;
const CLUSTER_MAX_ZOOM_LATITUDE_DELTA = 0.012;
const DEFAULT_MARKER_BORDER_COLOR = colors.primary;
const OTHER_USER_MARKER_Z_INDEX = 100;
const MY_USER_MARKER_Z_INDEX = 900;
const MEET_MARKER_Z_INDEX = 1000;
const CLUSTER_MARKER_Z_INDEX = 1200;
const FOCUS_ME_CAMERA_ZOOM = 17;


type UserMarkerItem = {
  type: "user";
  loc: LiveLoc;
  adjLat: number;
  adjLng: number;
};

type ClusterMarkerItem = {
  type: "cluster";
  key: string;
  lat: number;
  lng: number;
  count: number;
  members: { userId: string; latitude: number; longitude: number }[];
};

type RenderedMapMarker = UserMarkerItem | ClusterMarkerItem;

type MeetMarkerItem = ReturnType<typeof useMapData>["meets"][number] & {
  latitude: number;
  longitude: number;
};

type MarkerAvatarData = {
  userId: string;
  uri: string | null;
  initials: string;
  borderColor?: string;
};

function getMarkerInitials(name: string) {
  return name
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getProfileMarkerName(profile: Profile | undefined, userId: string) {
  return profile?.display_name || profile?.username || userId.slice(0, 8);
}

function getProfileMarkerBorderColor(profile: Profile | undefined) {
  return profile?.is_active_premium && profile?.accent_color
    ? profile.accent_color
    : DEFAULT_MARKER_BORDER_COLOR;
}

function getProfileMarkerAvatar(profile: Profile | undefined, userId: string): MarkerAvatarData {
  const markerName = getProfileMarkerName(profile, userId);

  return {
    userId,
    uri: profile?.photo_url ?? null,
    initials: getMarkerInitials(markerName),
    borderColor: getProfileMarkerBorderColor(profile),
  };
}

function isPubliclyDiscoverableProfile(profile: Profile | undefined) {
  if (!profile) return false;

  const locationVisibility = (profile.location_visibility ?? "everyone").toLowerCase();
  const profileVisibility = (profile.profile_visibility ?? "public").toLowerCase();

  return (
    locationVisibility === "everyone" &&
    (profileVisibility === "public" || profileVisibility === "everyone")
  );
}


function getMeetRowStatusLabel(
  status?: string | null,
  startTime?: string | null,
  endTime?: string | null,
  nowMs = Date.now()
) {
  const normalizedStatus = (status ?? "").toLowerCase();

  if (normalizedStatus === "cancelled") return "CANCELLED";
  if (normalizedStatus === "completed") return "COMPLETED";

  const startMs = startTime ? new Date(startTime).getTime() : Number.NaN;
  const endMs = endTime ? new Date(endTime).getTime() : Number.NaN;
  const comparisonMs = Number.isFinite(endMs) ? endMs : startMs;

  if (Number.isFinite(comparisonMs) && comparisonMs < nowMs) return "PAST";

  if (normalizedStatus === "upcoming") return "UPCOMING";

  return formatMeetStatus(status).toUpperCase();
}

function formatMeetRowTime(startTime?: string | null) {
  if (!startTime) return "TBD";
  const start = new Date(startTime);
  if (!Number.isFinite(start.getTime())) return "TBD";

  return start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

type AnimatedUserMarkerProps = {
  tracksViewChanges?: boolean;
  userId: string;
  zIndex: number;
  coordinate: AnimatedRegion;
  title: string;
  description: string;
  fresh: boolean;
  markerUri: string | null;
  markerInitials: string;
  markerBorderColor: string;
  onPress: (userId: string) => void;
  onRef: (userId: string, marker: any) => void;
};

const UserPinAvatar = React.memo(function UserPinAvatar({
  uri,
  initials,
  borderColor,
  fresh = true,
}: {
  uri: string | null;
  initials: string;
  borderColor: string;
  fresh?: boolean;
}) {
  return (
    <View style={[styles.userPinMarker, { opacity: fresh ? 1 : 0.45 }]}>
      <View style={[styles.userPinTail, { borderTopColor: borderColor }]} />
      <View style={[styles.userPinAvatarRing, { borderColor }]}>
        {uri ? (
          <Image source={{ uri }} style={styles.userPinAvatarImage} />
        ) : (
          <View style={styles.userPinAvatarFallback}>
            <Text style={styles.userPinAvatarInitials}>{initials}</Text>
          </View>
        )}
      </View>
    </View>
  );
});

const ClusterMarker = React.memo(function ClusterMarker({
  avatars,
  count,
  offsetAboveCurrentUser = false,
}: {
  avatars: MarkerAvatarData[];
  count: number;
  offsetAboveCurrentUser?: boolean;
}) {
  return (
    <View
      style={[
        styles.clusterPinMarker,
        offsetAboveCurrentUser ? styles.clusterPinMarkerOffsetAboveUser : null,
      ]}
    >
      <View
        style={[
          styles.clusterAvatarFan,
          offsetAboveCurrentUser ? styles.clusterAvatarFanOffsetAboveUser : null,
        ]}
      >
        {avatars.slice(0, 3).map((avatar, index) => (
          <View
            key={`${avatar.userId}-${index}`}
            style={[
              styles.clusterAvatarRing,
              index === 0
                ? styles.clusterAvatarLeft
                : index === 1
                  ? styles.clusterAvatarCenter
                  : styles.clusterAvatarRight,
              { borderColor: avatar.borderColor ?? DEFAULT_MARKER_BORDER_COLOR },
            ]}
          >
            {avatar.uri ? (
              <Image source={{ uri: avatar.uri }} style={styles.clusterAvatarImage} />
            ) : (
              <View style={styles.clusterAvatarFallback}>
                <Text style={styles.clusterAvatarInitials}>{avatar.initials}</Text>
              </View>
            )}
          </View>
        ))}
        {count > 3 ? (
          <View style={styles.clusterAvatarCountBadge}>
            <Text style={styles.clusterAvatarCountText}>{count}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const AnimatedUserMarker = React.memo(function AnimatedUserMarker({
  userId,
  coordinate,
  title,
  description,
  fresh,
  markerUri,
  markerInitials,
  markerBorderColor,
  onPress,
  onRef,
  zIndex,
  tracksViewChanges = false,
}: AnimatedUserMarkerProps) {
  return (
    <MarkerAnimated
      ref={(marker: any) => onRef(userId, marker)}
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      title={title}
      description={description}
      zIndex={zIndex}
      onPress={() => onPress(userId)}
      tracksViewChanges={tracksViewChanges}
      stopPropagation
    >
      <UserPinAvatar
        uri={markerUri}
        initials={markerInitials}
        borderColor={markerBorderColor}
        fresh={fresh}
      />
    </MarkerAnimated>
  );
});

const UserMarkerLayer = React.memo(function UserMarkerLayer({
  userMarkerItems,
  profilesById,
  effectiveMyUserId,
  clusterModeVersion,
  getOrCreateAnimatedUserCoordinate,
  onUserMarkerPress,
  onUserMarkerRef,
}: {
  userMarkerItems: UserMarkerItem[];
  profilesById: Record<string, Profile>;
  effectiveMyUserId: string | null | undefined;
  clusterModeVersion: number;
  getOrCreateAnimatedUserCoordinate: (
    userId: string,
    latitude: number,
    longitude: number
  ) => AnimatedRegion;
  onUserMarkerPress: (userId: string) => void;
  onUserMarkerRef: (userId: string, marker: any) => void;
}) {
  return (
    <>
      {userMarkerItems.map((item) => {
        const { loc, adjLat, adjLng } = item;
        const p = profilesById[loc.user_id];

        const markerName = getProfileMarkerName(p, loc.user_id);
        const markerAvatar = getProfileMarkerAvatar(p, loc.user_id);

        const fresh = isFresh(loc.updated_at, 2 * 60 * 1000);
        const lastSeen = formatLastSeen(loc.updated_at);
        const markerUri = markerAvatar.uri;
        const markerInitials = markerAvatar.initials;
        const markerBorderColor = markerAvatar.borderColor ?? DEFAULT_MARKER_BORDER_COLOR;

        const animatedCoordinate = getOrCreateAnimatedUserCoordinate(
          loc.user_id,
          adjLat,
          adjLng
        );

        return (
          <AnimatedUserMarker
            key={`user-mode-${clusterModeVersion}-${loc.user_id}`}
            userId={loc.user_id}
            zIndex={loc.user_id === effectiveMyUserId ? MY_USER_MARKER_Z_INDEX : OTHER_USER_MARKER_Z_INDEX}
            coordinate={animatedCoordinate}
            title={markerName}
            description={fresh ? "Live" : `Last seen ${lastSeen}`}
            fresh={fresh}
            markerUri={markerUri}
            markerInitials={markerInitials}
            markerBorderColor={markerBorderColor}
            onPress={onUserMarkerPress}
            onRef={onUserMarkerRef}
          />
        );
      })}
    </>
  );
});

const MeetMarkerLayer = React.memo(function MeetMarkerLayer({
  showMeetPins,
  meetMarkers,
  selectedMeetId,
  onMeetMarkerPress,
}: {
  showMeetPins: boolean;
  meetMarkers: MeetMarkerItem[];
  selectedMeetId: string | null;
  onMeetMarkerPress: (meetId: string) => void;
}) {
  if (!showMeetPins) return null;

  return (
    <>
      {meetMarkers.map((meet) => {
        const isSelected = meet.id === selectedMeetId;

        return (
          <Marker
            key={`meet-${meet.id}`}
            coordinate={{ latitude: meet.latitude, longitude: meet.longitude }}
            zIndex={MEET_MARKER_Z_INDEX}
            onPress={(event) => {
              event.stopPropagation?.();
              onMeetMarkerPress(meet.id);
            }}
            stopPropagation
          >
            <View style={[styles.meetMarkerWrap, isSelected ? styles.meetMarkerWrapSelected : null]}>
              <Text style={styles.meetMarkerIcon}>📍</Text>
            </View>
          </Marker>
        );
      })}
    </>
  );
});

const ClusterMarkerLayer = React.memo(function ClusterMarkerLayer({
  clusterMarkerItems,
  profilesById,
  currentUserLocation,
  clusterModeVersion,
  clusterMarkerRedrawVersion,
  clusterMarkersTrackViewChanges,
  onClusterMarkerPress,
}: {
  clusterMarkerItems: ClusterMarkerItem[];
  profilesById: Record<string, Profile>;
  currentUserLocation: LiveLoc | null;
  clusterModeVersion: number;
  clusterMarkerRedrawVersion: number;
  clusterMarkersTrackViewChanges: boolean;
  onClusterMarkerPress: (item: ClusterMarkerItem) => void;
}) {
  return (
    <>
      {clusterMarkerItems.map((item) => {
        const offsetAboveCurrentUser = currentUserLocation
          ? distanceBetweenCoordsMeters(
              { latitude: item.lat, longitude: item.lng },
              { latitude: currentUserLocation.lat, longitude: currentUserLocation.lng }
            ) <= CLUSTER_CURRENT_USER_OVERLAP_THRESHOLD_METERS
          : false;
        const clusterAvatars = item.members
          .slice(0, 3)
          .map((member) =>
            getProfileMarkerAvatar(profilesById[member.userId], member.userId)
          );

        const clusterMarkerKey = `cluster-mode-${clusterModeVersion}-${clusterMarkerRedrawVersion}-${item.key}`;

        return (
          <Marker
            key={clusterMarkerKey}
            identifier={clusterMarkerKey}
            coordinate={{ latitude: item.lat, longitude: item.lng }}
            anchor={{ x: 0.5, y: 1 }}
            title="Nearby group"
            description={`${item.count} people nearby`}
            zIndex={CLUSTER_MARKER_Z_INDEX}
            tracksViewChanges={clusterMarkersTrackViewChanges}
            onPress={(event) => {
              event.stopPropagation?.();
              onClusterMarkerPress(item);
            }}
            stopPropagation
          >
            <ClusterMarker
              avatars={clusterAvatars}
              count={item.count}
              offsetAboveCurrentUser={offsetAboveCurrentUser}
            />
          </Marker>
        );
      })}
    </>
  );
});

export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focusMeetId?: string; latitude?: string; longitude?: string }>();
  const hasRequestedMeetTarget = useMemo(() => {
    const hasMeetId = typeof params.focusMeetId === "string" && params.focusMeetId.length > 0;
    const latitude = Number(params.latitude);
    const longitude = Number(params.longitude);
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
    return hasMeetId || hasCoordinates;
  }, [params.focusMeetId, params.latitude, params.longitude]);
  const mapRef = useRef<MapView | null>(null);
  const hasUserMovedMapRef = useRef(false);
  const isProgrammaticCameraMoveRef = useRef(false);
  const selectedMeetIdRef = useRef<string | null>(null);
  const { height: screenHeight } = useWindowDimensions();
  const profileCardMaxHeight = Math.min(screenHeight * 0.78, 640);
  const collapsedSheetHeight = Math.round(screenHeight * 0.33);
  const expandedSheetHeight = Math.round(screenHeight * 0.76);
  const sheetHeightAnim = useRef(new Animated.Value(collapsedSheetHeight)).current;
  const sheetDragStartHeightRef = useRef(collapsedSheetHeight);

  const {
    profilesById,
    locationsById,
    friendIds,
    meets,
    meetAttendeeSummaryByMeetId,
    loading: mapDataLoading,
    myUserId: mapDataUserId,
    setMyLiveLocation,
  } = useMapData();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [, setCheckingProfileReady] = useState(true);
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
  const [selectedUserCars, setSelectedUserCars] = useState<Car[]>([]);
  const [friendRelationshipState, setFriendRelationshipState] =
    useState<FriendRelationshipState>("none");

  const [selectedMeetId, setSelectedMeetId] = useState<string | null>(null);
  const [meetSearchQuery, setMeetSearchQuery] = useState("");
  const [showMeetPins, setShowMeetPins] = useState(true);
  const [clusterMarkerRedrawVersion, setClusterMarkerRedrawVersion] = useState(0);
  const [clusterMarkersTrackViewChanges, setClusterMarkersTrackViewChanges] =
    useState(false);
  const previousMeetMarkerRedrawStateRef = useRef({
    selectedMeetId,
    showMeetPins,
  });

  useEffect(() => {
    selectedMeetIdRef.current = selectedMeetId;
  }, [selectedMeetId]);

  useEffect(() => {
    const previous = previousMeetMarkerRedrawStateRef.current;
    const meetMarkerStateChanged =
      previous.selectedMeetId !== selectedMeetId ||
      previous.showMeetPins !== showMeetPins;

    if (!meetMarkerStateChanged) return;

    previousMeetMarkerRedrawStateRef.current = {
      selectedMeetId,
      showMeetPins,
    };
    setClusterMarkerRedrawVersion((version) => version + 1);
    setClusterMarkersTrackViewChanges(true);

    const timeout = setTimeout(() => {
      setClusterMarkersTrackViewChanges(false);
    }, 350);

    return () => clearTimeout(timeout);
  }, [selectedMeetId, showMeetPins]);
  const [focusedClusterKey, setFocusedClusterKey] = useState<string | null>(null);
  const animatedUserCoordsRef = useRef<Record<string, AnimatedRegion>>({});
  const markerRefs = useRef<Record<string, any>>({});
  const lastAnimatedTargetsRef = useRef<
    Record<string, { latitude: number; longitude: number }>
  >({});

  useEffect(() => {
    let mounted = true;

    (async () => {
      const user = await getCurrentAuthUser();
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
      const user = await getCurrentAuthUser();
      if (!user) return;

      const { error } = await upsertLocation({
        userId: user.id,
        lat,
        lng,
        heading,
        speed,
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

      const applyLocationToMap = async (
        position: Location.LocationObject,
        options: { animateIfAllowed: boolean }
      ) => {
        if (cancelled) return;

        const uid = myUserId ?? (await getCurrentAuthUser())?.id ?? null;
        if (cancelled) return;

        if (uid) {
          setMyLiveLocation({
            user_id: uid,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            heading: position.coords.heading ?? undefined,
            speed: position.coords.speed ?? undefined,
            updated_at: new Date().toISOString(),
          });
        }

        setRegion((r) => ({
          ...r,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }));

        const canAnimateToMe =
          options.animateIfAllowed &&
          !hasRequestedMeetTarget &&
          !hasUserMovedMapRef.current &&
          !selectedMeetIdRef.current;

        if (canAnimateToMe && mapRef.current) {
          isProgrammaticCameraMoveRef.current = true;
          mapRef.current.animateCamera({
            center: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            zoom: 15,
          });
        }

        setGotFix(true);
      };

      (async () => {
        try {
          const lastKnown = await Location.getLastKnownPositionAsync();
          if (lastKnown) {
            await applyLocationToMap(lastKnown, { animateIfAllowed: true });
          }
        } catch (e: any) {
          console.warn("Last-known location error:", e?.message ?? e);
        }

        try {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });

          if (cancelled) return;

          await applyLocationToMap(current, { animateIfAllowed: true });

          await upsertMyLocation(
            current.coords.latitude,
            current.coords.longitude,
            current.coords.heading ?? undefined,
            current.coords.speed ?? undefined
          );
        } catch (e: any) {
          console.warn("Current location error:", e?.message ?? e);
        }

        if (cancelled) return;

        try {
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
      hasRequestedMeetTarget,
    ])
  );

  const locationsByIdKeys = useMemo(() => Object.keys(locationsById), [locationsById]);
  const profilesByIdKeys = useMemo(() => Object.keys(profilesById), [profilesById]);
  const effectiveMyUserId = myUserId ?? mapDataUserId;

  const sourceLocations = useMemo(
    () =>
      Object.values(locationsById).filter(
        (loc) => Number.isFinite(loc.lat) && Number.isFinite(loc.lng)
      ),
    [locationsById]
  );

  const shouldShowClusters =
    region.latitudeDelta > CLUSTER_MAX_ZOOM_LATITUDE_DELTA;
  const previousClusterModeRef = useRef<boolean>(shouldShowClusters);
  const [clusterModeVersion, setClusterModeVersion] = useState(0);

  const debugTrackedDistantUserIds = useMemo(() => {
    return sourceLocations
      .map((loc) => ({
        userId: loc.user_id,
        distanceFromCenter: distanceBetweenCoordsMeters(
          { latitude: region.latitude, longitude: region.longitude },
          { latitude: loc.lat, longitude: loc.lng }
        ),
      }))
      .sort((a, b) => b.distanceFromCenter - a.distanceFromCenter)
      .slice(0, 2)
      .map((item) => item.userId);
  }, [region.latitude, region.longitude, sourceLocations]);

  const markerDataSignature = useMemo(() => {
    const locationSignature = Object.values(locationsById)
      .map(
        (loc) =>
          `${loc.user_id}:${loc.lat}:${loc.lng}:${loc.updated_at ?? ""}`
      )
      .sort()
      .join("|");
    const profileSignature = Object.values(profilesById)
      .map(
        (profile) =>
          `${profile.id}:${profile.photo_url ?? ""}:${profile.display_name ?? ""}:${profile.username ?? ""}:${profile.is_active_premium ? "1" : "0"}:${profile.accent_color ?? ""}`
      )
      .sort()
      .join("|");
    const friendSignature = [...friendIds].sort().join("|");

    return `${effectiveMyUserId ?? ""}::${friendSignature}::${locationSignature}::${profileSignature}`;
  }, [effectiveMyUserId, friendIds, locationsById, profilesById]);

  const mapMarkers = useMemo(() => {
    // Include the map-data signature so marker generation reruns when refreshes
    // update friends/profiles/location rows even if the region has not changed.
    void markerDataSignature;

    const nearbyThresholdMeters = Math.max(
      20,
      Math.min(120, 40 * (region.latitudeDelta / 0.05))
    );
    // Always derive marker output from the full live-location dataset.
    // Profile availability only changes marker presentation, never inclusion.
    const friendIdSet = new Set(friendIds);
    const baseLocationsById = new Map<string, LiveLoc>();
    const myLocation =
      effectiveMyUserId && locationsById[effectiveMyUserId]
        ? locationsById[effectiveMyUserId]
        : null;

    friendIds.forEach((friendId) => {
      const friendLocation = locationsById[friendId];
      if (
        friendLocation &&
        Number.isFinite(friendLocation.lat) &&
        Number.isFinite(friendLocation.lng)
      ) {
        baseLocationsById.set(friendId, friendLocation);
      }
    });

    sourceLocations.forEach((loc) => {
      if (!baseLocationsById.has(loc.user_id)) {
        baseLocationsById.set(loc.user_id, loc);
      }
    });

    const baseLocations = Array.from(baseLocationsById.values()).filter((loc) => {
      if (loc.user_id === effectiveMyUserId || friendIdSet.has(loc.user_id)) {
        return true;
      }

      if (!myLocation) return false;
      const profile = profilesById[loc.user_id];
      if (!isPubliclyDiscoverableProfile(profile)) return false;

      return distanceInMeters(myLocation, loc) <= PUBLIC_DISCOVERY_RADIUS_METERS;
    });
    const clusterableLocations = baseLocations.filter(
      (loc) => loc.user_id !== effectiveMyUserId && !friendIdSet.has(loc.user_id)
    );
    const alwaysRenderedLocations = baseLocations.filter(
      (loc) => loc.user_id === effectiveMyUserId || friendIdSet.has(loc.user_id)
    );

    const visited = new Set<string>();
    const groups: LiveLoc[][] = [];

    for (const loc of clusterableLocations) {
      if (visited.has(loc.user_id)) continue;

      const queue: LiveLoc[] = [loc];
      const group: LiveLoc[] = [];
      visited.add(loc.user_id);

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;

        group.push(current);

        clusterableLocations.forEach((candidate) => {
          if (visited.has(candidate.user_id)) return;

          if (distanceInMeters(current, candidate) <= nearbyThresholdMeters) {
            visited.add(candidate.user_id);
            queue.push(candidate);
          }
        });
      }

      groups.push(group);
    }

    const renderedMarkers: RenderedMapMarker[] = [];
    const individualLocations: LiveLoc[] = [...alwaysRenderedLocations];

    groups.forEach((group, groupIdx) => {
      if (shouldShowClusters && group.length >= CLUSTER_MIN_SIZE) {
        const centerLat =
          group.reduce((sum, loc) => sum + loc.lat, 0) / group.length;
        const centerLng =
          group.reduce((sum, loc) => sum + loc.lng, 0) / group.length;

        renderedMarkers.push({
          type: "cluster",
          key: `cluster-${group
            .map((loc) => loc.user_id)
            .sort()
            .join("-")}-${groupIdx}`,
          lat: centerLat,
          lng: centerLng,
          count: group.length,
          members: group.map((loc) => ({
            userId: loc.user_id,
            latitude: loc.lat,
            longitude: loc.lng,
          })),
        });
        return;
      }

      individualLocations.push(...group);
    });

    const overlapVisited = new Set<string>();
    const overlapGroups: LiveLoc[][] = [];

    individualLocations.forEach((loc) => {
      if (overlapVisited.has(loc.user_id)) return;

      const overlapMembers = individualLocations.filter(
        (candidate) =>
          !overlapVisited.has(candidate.user_id) &&
          distanceInMeters(loc, candidate) <= OVERLAP_THRESHOLD_METERS
      );

      overlapMembers.forEach((member) => overlapVisited.add(member.user_id));
      overlapGroups.push(overlapMembers);
    });

    overlapGroups.forEach((overlapGroup) => {
      if (overlapGroup.length <= 1) {
        const [loc] = overlapGroup;
        if (!loc) return;
        renderedMarkers.push({
          type: "user",
          loc,
          adjLat: loc.lat,
          adjLng: loc.lng,
        });
        return;
      }

      overlapGroup.forEach((loc, i) => {
        const angle = (2 * Math.PI * i) / overlapGroup.length;
        const latRad = (loc.lat * Math.PI) / 180;
        const metersPerDegLat = 111_111;
        const metersPerDegLng = 111_111 * Math.cos(latRad);

        const dx = OVERLAP_SPREAD_RADIUS_METERS * Math.cos(angle);
        const dy = OVERLAP_SPREAD_RADIUS_METERS * Math.sin(angle);

        renderedMarkers.push({
          type: "user",
          loc,
          adjLat: loc.lat + dy / metersPerDegLat,
          adjLng: loc.lng + dx / metersPerDegLng,
        });
      });
    });

    return renderedMarkers;
  }, [
    effectiveMyUserId,
    friendIds,
    locationsById,
    markerDataSignature,
    profilesById,
    region.latitudeDelta,
    shouldShowClusters,
    sourceLocations,
  ]);

  useEffect(() => {
    const previousMode = previousClusterModeRef.current;
    if (previousMode !== shouldShowClusters) {
      previousClusterModeRef.current = shouldShowClusters;
      setClusterModeVersion((v) => v + 1);
      console.log("[Map][ClusterThreshold] mode-cross", {
        previousMode,
        nextMode: shouldShowClusters,
        latitudeDelta: region.latitudeDelta,
        threshold: CLUSTER_MAX_ZOOM_LATITUDE_DELTA,
      });
    }
  }, [region.latitudeDelta, shouldShowClusters]);

  useEffect(() => {
    const renderedUserIds = mapMarkers
      .filter((item): item is UserMarkerItem => item.type === "user")
      .map((item) => item.loc.user_id);

    const renderedClusterMemberIds = mapMarkers
      .filter((item): item is ClusterMarkerItem => item.type === "cluster")
      .flatMap((item) => item.members.map((member) => member.userId));

    const allRenderedIds = new Set([
      ...renderedUserIds,
      ...renderedClusterMemberIds,
    ]);

    const acceptedFriendDiagnostics = friendIds.map((id) => ({
      userId: id,
      hasLocation: Boolean(locationsById[id]),
      hasValidLocation: sourceLocations.some((loc) => loc.user_id === id),
      hasProfile: Boolean(profilesById[id]),
      renderedAsUser: renderedUserIds.includes(id),
      renderedInClusterMembers: renderedClusterMemberIds.includes(id),
      renderedAnywhere: allRenderedIds.has(id),
    }));

    console.log("[Map][Markers] render-snapshot", {
      acceptedFriendCount: friendIds.length,
      friendIds,
      locationsByIdKeys,
      profilesByIdKeys,
      finalRenderedUserMarkerIds: renderedUserIds,
      finalRenderedClusterMemberIds: renderedClusterMemberIds,
      acceptedFriendDiagnostics,
      shouldShowClusters,
      latitudeDelta: region.latitudeDelta,
      threshold: CLUSTER_MAX_ZOOM_LATITUDE_DELTA,
      sourceCount: sourceLocations.length,
      renderedMarkerCount: mapMarkers.length,
      renderedUserMarkerCount: renderedUserIds.length,
      renderedClusterCount: mapMarkers.length - renderedUserIds.length,
      debugTrackedDistantUserIds,
      debugTrackedPresence: debugTrackedDistantUserIds.map((id) => ({
        userId: id,
        inSource: sourceLocations.some((loc) => loc.user_id === id),
        renderedAsUser: renderedUserIds.includes(id),
        renderedInClusterMembers: renderedClusterMemberIds.includes(id),
        renderedAnywhere: allRenderedIds.has(id),
      })),
    });
  }, [
    debugTrackedDistantUserIds,
    friendIds,
    locationsById,
    locationsByIdKeys,
    mapMarkers,
    profilesById,
    profilesByIdKeys,
    region.latitudeDelta,
    shouldShowClusters,
    sourceLocations,
  ]);

  const handleRegionChangeComplete = useCallback(
    (nextRegion: Region, details?: { isGesture?: boolean }) => {
      setRegion(nextRegion);

      if (isProgrammaticCameraMoveRef.current) {
        isProgrammaticCameraMoveRef.current = false;
      } else if (details?.isGesture !== false) {
        hasUserMovedMapRef.current = true;
      }

      if (focusedClusterKey !== null) {
        setFocusedClusterKey(null);
      }
    },
    [focusedClusterKey]
  );

  const meetMarkers = useMemo(() => {
    return meets
      .filter((meet) => Number.isFinite(meet.latitude) && Number.isFinite(meet.longitude))
      .map((meet) => ({
        ...meet,
        latitude: Number(meet.latitude),
        longitude: Number(meet.longitude),
      }));
  }, [meets]);


  useEffect(() => {
    const focusMeetId = params.focusMeetId;
    if (!focusMeetId || typeof focusMeetId !== "string" || meetMarkers.length === 0) return;

    const fallbackLatitude = Number(params.latitude);
    const fallbackLongitude = Number(params.longitude);

    const requestedMeet = meetMarkers.find((meet) => meet.id === focusMeetId);
    const targetLatitude = requestedMeet?.latitude ?? fallbackLatitude;
    const targetLongitude = requestedMeet?.longitude ?? fallbackLongitude;

    if (!Number.isFinite(targetLatitude) || !Number.isFinite(targetLongitude)) return;

    setSelectedUserId(null);
    setSelectedProfile(null);
    setSelectedUserCars([]);
    setProfileError(null);
    setProfileLoading(false);
    setSelectedMeetId(focusMeetId);

    if (!mapRef.current) return;

    isProgrammaticCameraMoveRef.current = true;
    mapRef.current.animateToRegion(
      {
        latitude: targetLatitude,
        longitude: targetLongitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      },
      700
    );
  }, [meetMarkers, params.focusMeetId, params.latitude, params.longitude]);

  const userMarkerItems = useMemo(
    () =>
      mapMarkers.filter(
        (item): item is UserMarkerItem => item.type === "user"
      ),
    [mapMarkers]
  );

  const clusterMarkerItems = useMemo(
    () =>
      mapMarkers.filter(
        (item): item is ClusterMarkerItem => item.type === "cluster"
      ),
    [mapMarkers]
  );

  const currentUserLocation = useMemo(() => {
    if (!effectiveMyUserId) return null;

    const loc = locationsById[effectiveMyUserId];
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;

    return loc;
  }, [effectiveMyUserId, locationsById]);

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
      const nextAnimatedRegion = {
        ...nextCoordinate,
        latitudeDelta: 0,
        longitudeDelta: 0,
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
        animatedCoord.setValue(nextAnimatedRegion);
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
          ...nextAnimatedRegion,
          duration: MARKER_ANIMATION_DURATION_MS,
          useNativeDriver: false,
          easing: Easing.linear,
        } as any)
        .start();
    });
  }, [getOrCreateAnimatedUserCoordinate, userMarkerItems]);

  const selectedMeet = useMemo(() => {
    if (!selectedMeetId) return null;
    return meetMarkers.find((meet) => meet.id === selectedMeetId) ?? null;
  }, [selectedMeetId, meetMarkers]);
  const selectedMeetHasCoordinates = useMemo(() => {
    if (!selectedMeet) return false;
    return Number.isFinite(selectedMeet.latitude) && Number.isFinite(selectedMeet.longitude);
  }, [selectedMeet]);
  const filteredMeetMarkers = useMemo(() => {
    const normalized = meetSearchQuery.trim().toLowerCase();
    if (!normalized) return meetMarkers;
    return meetMarkers.filter((meet) => {
      const title = (meet.title ?? "").toLowerCase();
      const location = (meet.location_name ?? meet.address ?? "").toLowerCase();
      return title.includes(normalized) || location.includes(normalized);
    });
  }, [meetMarkers, meetSearchQuery]);

  useEffect(() => {
    sheetHeightAnim.setValue(collapsedSheetHeight);
    sheetDragStartHeightRef.current = collapsedSheetHeight;
  }, [collapsedSheetHeight, sheetHeightAnim]);

  const animateSheetTo = useCallback(
    (nextHeight: number) => {
      Animated.spring(sheetHeightAnim, {
        toValue: Math.max(collapsedSheetHeight, Math.min(expandedSheetHeight, nextHeight)),
        useNativeDriver: false,
        bounciness: 0,
        speed: 18,
      }).start(({ finished }) => {
        if (finished) {
          sheetHeightAnim.stopAnimation((value) => {
            sheetDragStartHeightRef.current = value;
          });
        }
      });
    },
    [collapsedSheetHeight, expandedSheetHeight, sheetHeightAnim]
  );

  const meetsSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: () => {
          sheetHeightAnim.stopAnimation((value) => {
            sheetDragStartHeightRef.current = value;
          });
        },
        onPanResponderMove: (_evt, gestureState) => {
          const nextHeight = sheetDragStartHeightRef.current - gestureState.dy;
          sheetHeightAnim.setValue(
            Math.max(collapsedSheetHeight, Math.min(expandedSheetHeight, nextHeight))
          );
        },
        onPanResponderRelease: (_evt, gestureState) => {
          const draggedHeight = sheetDragStartHeightRef.current - gestureState.dy;
          const velocityAdjustedHeight = draggedHeight - gestureState.vy * 120;
          const midpoint = (collapsedSheetHeight + expandedSheetHeight) / 2;
          animateSheetTo(velocityAdjustedHeight > midpoint ? expandedSheetHeight : collapsedSheetHeight);
        },
        onPanResponderTerminate: () => {
          animateSheetTo(collapsedSheetHeight);
        },
      }),
    [animateSheetTo, collapsedSheetHeight, expandedSheetHeight, sheetHeightAnim]
  );

  const focusMyLocation = useCallback(async () => {
    let target = currentUserLocation
      ? { latitude: currentUserLocation.lat, longitude: currentUserLocation.lng }
      : null;

    if (!target) {
      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        target = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        };

        if (effectiveMyUserId) {
          setMyLiveLocation({
            user_id: effectiveMyUserId,
            lat: current.coords.latitude,
            lng: current.coords.longitude,
            heading: current.coords.heading ?? undefined,
            speed: current.coords.speed ?? undefined,
            updated_at: new Date().toISOString(),
          });
        }

        setGotFix(true);
      } catch (e: any) {
        console.warn("Focus location error:", e?.message ?? e);
        return;
      }
    }

    if (!mapRef.current || !target) return;

    closeProfileCard();
    isProgrammaticCameraMoveRef.current = true;
    mapRef.current.animateCamera(
      {
        center: target,
        zoom: FOCUS_ME_CAMERA_ZOOM,
      },
      { duration: 700 }
    );
  }, [currentUserLocation, effectiveMyUserId, setMyLiveLocation]);

  const toggleMeetMarkers = useCallback(() => {
    setShowMeetPins((visible) => !visible);
  }, []);

  const handleGetDirections = useCallback(async () => {
    if (!selectedMeetHasCoordinates || !selectedMeet) return;

    const destination = `${selectedMeet.latitude},${selectedMeet.longitude}`;
    const directionsUrl = `http://maps.apple.com/?daddr=${encodeURIComponent(destination)}`;

    if (selectedMeet.title) {
      const labeledDestination = `${selectedMeet.title}@${destination}`;
      const labeledDirectionsUrl = `http://maps.apple.com/?daddr=${encodeURIComponent(labeledDestination)}`;
      await ExpoLinking.openURL(labeledDirectionsUrl);
      return;
    }

    await ExpoLinking.openURL(directionsUrl);
  }, [selectedMeet, selectedMeetHasCoordinates]);

  const handleMarkerPress = useCallback(
    async (userId: string) => {
      if (!userId || userId === myUserId) return;

      setSelectedMeetId(null);
      setSelectedUserId(userId);
      setProfileError(null);

      setProfileLoading(true);
      setSelectedUserCars([]);
      setFriendRelationshipState("none");
      setSelectedProfile(profilesById[userId] ?? null);

      const [
        { data: profileData, error: profileErrorRaw },
        { data: carsData, error: carsError },
        { data: friendshipData, error: friendshipError },
        { data: outgoingRequestData, error: outgoingRequestError },
        { data: incomingRequestData, error: incomingRequestError },
      ] = await fetchUserMarkerCardData(userId, myUserId);

      if (profileErrorRaw) {
        setProfileError(profileErrorRaw.message);
      } else if (!profileData) {
        setProfileError("No profile found for this user.");
      } else {
        const cached = profilesById[userId];
        const merged: Profile = {
          ...cached,
          ...profileData,
          membership_plan: cached?.membership_plan ?? null,
          membership_status: cached?.membership_status ?? null,
          accent_color: cached?.accent_color ?? null,
          is_active_premium:
            cached?.is_active_premium ??
            (cached?.membership_plan === "premium" && cached?.membership_status === "active"),
        };
        setSelectedProfile(merged);
        setProfileError(null);
      }

      if (carsError) setProfileError((prev) => prev ?? carsError.message);
      else setSelectedUserCars(carsData ?? []);

      const relationshipQueryError =
        friendshipError || outgoingRequestError || incomingRequestError;
      if (relationshipQueryError) {
        setProfileError((prev) => prev ?? relationshipQueryError.message);
      }

      if (friendshipData) {
        setFriendRelationshipState("friends");
      } else if (outgoingRequestData) {
        setFriendRelationshipState("request_sent");
      } else if (incomingRequestData) {
        setFriendRelationshipState("request_received");
      } else {
        setFriendRelationshipState("none");
      }

      setProfileLoading(false);
    },
    [myUserId, profilesById]
  );

  const closeProfileCard = () => {
    setSelectedUserId(null);
    setSelectedProfile(null);
    setProfileError(null);
    setProfileLoading(false);
    setSelectedUserCars([]);
    setFriendRelationshipState("none");
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
    if (friendRelationshipState !== "none") return;
    const canProceed = await canUseProfileGatedActions();
    if (!canProceed) return;

    try {
      setSendingRequest(true);
      const { error } = await insertFriendRequest(myUserId, selectedUserId);

      if (error) {
        setProfileError(error.message);
      } else {
        setProfileError(null);
        setFriendRelationshipState("request_sent");
      }
    } finally {
      setSendingRequest(false);
    }
  }, [myUserId, selectedUserId, canUseProfileGatedActions, friendRelationshipState]);

  const handleUserMarkerRef = useCallback((userId: string, marker: any) => {
    markerRefs.current[userId] = marker;
  }, []);

  const handleMeetMarkerPress = useCallback((meetId: string) => {
    setSelectedUserId(null);
    setSelectedProfile(null);
    setProfileError(null);
    setProfileLoading(false);
    setSelectedUserCars([]);
    setFriendRelationshipState("none");
    setSelectedMeetId(meetId);
  }, []);

  const handleClusterMarkerPress = useCallback((item: ClusterMarkerItem) => {
    setSelectedUserId(null);
    setSelectedProfile(null);
    setProfileError(null);
    setProfileLoading(false);
    setSelectedUserCars([]);
    setFriendRelationshipState("none");
    setSelectedMeetId(null);
    setFocusedClusterKey(item.key);

    if (mapRef.current) {
      isProgrammaticCameraMoveRef.current = true;
      mapRef.current.fitToCoordinates(
        item.members.map((member) => ({
          latitude: member.latitude,
          longitude: member.longitude,
        })),
        {
          edgePadding: {
            top: 110,
            right: 110,
            bottom: 110,
            left: 110,
          },
          animated: true,
        }
      );
    }
  }, []);

  if (checkingAuth) {
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
        <Pressable
          onPress={() => router.navigate("/auth?redirectTo=/map")}
          style={({ pressed }) => [
            styles.friendBtn,
            { paddingHorizontal: 18 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.friendBtnText}>Sign in or create account</Text>
        </Pressable>
      </View>
    );
  }

  const showBlockingLoader = !authed || hasPermission === null;
  const showLocationOverlay = hasPermission === true && !gotFix;
  const showMapDataOverlay = mapDataLoading;

  if (showBlockingLoader) {
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
  const locationLabel = [selectedProfile?.city, selectedProfile?.state]
    .filter(Boolean)
    .join(", ");
  const hasCars = selectedUserCars.length > 0;
  const socialEntries = [
    selectedProfile?.instagram_handle
      ? { key: "instagram", label: "Instagram", url: `https://instagram.com/${selectedProfile.instagram_handle.replace(/^@/, "")}` }
      : null,
    selectedProfile?.tiktok_handle
      ? { key: "tiktok", label: "TikTok", url: `https://www.tiktok.com/@${selectedProfile.tiktok_handle.replace(/^@/, "")}` }
      : null,
    selectedProfile?.twitter_handle
      ? { key: "twitter", label: "X", url: `https://x.com/${selectedProfile.twitter_handle.replace(/^@/, "")}` }
      : null,
    selectedProfile?.snapchat_handle
      ? { key: "snapchat", label: "Snapchat", url: `https://www.snapchat.com/add/${selectedProfile.snapchat_handle.replace(/^@/, "")}` }
      : null,
  ].filter((entry): entry is { key: string; label: string; url: string } => Boolean(entry));

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        <UserMarkerLayer
          userMarkerItems={userMarkerItems}
          profilesById={profilesById}
          effectiveMyUserId={effectiveMyUserId}
          clusterModeVersion={clusterModeVersion}
          getOrCreateAnimatedUserCoordinate={getOrCreateAnimatedUserCoordinate}
          onUserMarkerPress={handleMarkerPress}
          onUserMarkerRef={handleUserMarkerRef}
        />

        <MeetMarkerLayer
          showMeetPins={showMeetPins}
          meetMarkers={meetMarkers}
          selectedMeetId={selectedMeetId}
          onMeetMarkerPress={handleMeetMarkerPress}
        />

        <ClusterMarkerLayer
          clusterMarkerItems={clusterMarkerItems}
          profilesById={profilesById}
          currentUserLocation={currentUserLocation}
          clusterModeVersion={clusterModeVersion}
          clusterMarkerRedrawVersion={clusterMarkerRedrawVersion}
          clusterMarkersTrackViewChanges={clusterMarkersTrackViewChanges}
          onClusterMarkerPress={handleClusterMarkerPress}
        />
      </MapView>

      <Animated.View
        style={[
          styles.mapControlsContainer,
          { bottom: Animated.add(sheetHeightAnim, 16) },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Focus Me"
          onPress={focusMyLocation}
          style={({ pressed }) => [
            styles.mapControlButton,
            pressed && styles.mapControlButtonPressed,
          ]}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={30} color="#fff" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showMeetPins ? "Hide meet pins" : "Show meet pins"}
          accessibilityState={{ selected: showMeetPins }}
          onPress={toggleMeetMarkers}
          style={({ pressed }) => [
            styles.mapControlButton,
            showMeetPins ? styles.mapControlButtonActive : styles.mapControlButtonInactive,
            pressed && styles.mapControlButtonPressed,
          ]}
        >
          <MaterialCommunityIcons
            name="map-marker"
            size={34}
            color={showMeetPins ? "#ef4444" : "#8a8a8a"}
            style={showMeetPins ? undefined : styles.mapControlMeetIconInactive}
          />
        </Pressable>
      </Animated.View>

      {(showLocationOverlay || showMapDataOverlay) && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 14,
            left: 14,
            right: 14,
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "rgba(0,0,0,0.62)",
              borderRadius: 999,
              paddingHorizontal: 14,
              paddingVertical: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ActivityIndicator size="small" color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "600" }}>
              {showLocationOverlay ? "Getting your location…" : "Loading map data…"}
            </Text>
          </View>
        </View>
      )}

      <Animated.View style={[styles.meetsSheetContainer, { height: sheetHeightAnim }]}>
        <View style={styles.meetsSheet} {...meetsSheetPanResponder.panHandlers}>
          <View style={styles.meetsSheetHandleWrap}>
            <View style={styles.meetsSheetHandle} />
          </View>
          <View style={styles.meetsSearchBar}>
            <TextInput
              value={meetSearchQuery}
              onChangeText={setMeetSearchQuery}
              placeholder="Search upcoming meets"
              placeholderTextColor="#8a8a8a"
              style={styles.meetsSearchInput}
            />
            <View pointerEvents="none" style={styles.meetsSearchIconWrap}>
              <MaterialCommunityIcons name="magnify" style={styles.meetsSearchIcon} />
            </View>
          </View>
          <ScrollView
            style={styles.meetsListScroll}
            contentContainerStyle={styles.meetsListContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredMeetMarkers.map((meet) => {
              const day = meet.start_time ? new Date(meet.start_time) : null;
              const dateTop = day && Number.isFinite(day.getTime()) ? String(day.getDate()).padStart(2, "0") : "--";
              const dateBottom = day && Number.isFinite(day.getTime()) ? day.toLocaleString(undefined, { month: "short" }).toUpperCase() : "TBD";
              const meetTime = formatMeetRowTime(meet.start_time);
              const rowStatus = getMeetRowStatusLabel(meet.status, meet.start_time, meet.end_time);
              const goingCount = meetAttendeeSummaryByMeetId[meet.id]?.going ?? 0;
              const interestedCount = meetAttendeeSummaryByMeetId[meet.id]?.interested ?? 0;
              return (
                <Pressable
                  key={`sheet-meet-${meet.id}`}
                  onPress={() => {
                    setSelectedMeetId(meet.id);
                    if (mapRef.current) {
                      isProgrammaticCameraMoveRef.current = true;
                      mapRef.current.animateCamera({
                        center: { latitude: meet.latitude, longitude: meet.longitude },
                        zoom: 14,
                      });
                    }
                  }}
                  style={({ pressed }) => [styles.meetRowCard, pressed && { opacity: 0.88 }]}
                >
                  <View style={styles.meetLeftColumn}>
                    <View style={styles.meetDateBlock}>
                      <Text style={styles.meetDateDay}>{dateTop}</Text>
                      <Text style={styles.meetDateMonth}>{dateBottom}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.meetDateTime}>{meetTime}</Text>
                  </View>
                  <View style={styles.meetRightColumn}>
                    <Text numberOfLines={2} style={styles.meetRowTitle}>{meet.title || "Meet"}</Text>
                    <Text numberOfLines={1} style={styles.meetRowMeta}>
                      {meet.location_name || meet.address || "Location TBD"}
                    </Text>
                    <View style={styles.meetActionsRow}>
                      <Text style={styles.meetActionText}>✓ {goingCount}</Text>
                      <Text style={styles.meetActionDot}>◦</Text>
                      <Text style={styles.meetActionText}>◔ {interestedCount}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.meetRowStatusText}>
                      {rowStatus}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Animated.View>

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

            {selectedMeetHasCoordinates ? (
              <Pressable style={styles.getDirectionsBtn} onPress={handleGetDirections}>
                <Text style={styles.getDirectionsBtnText}>
                  {selectedMeet.title ? `Get Directions to ${selectedMeet.title}` : "Get Directions"}
                </Text>
              </Pressable>
            ) : null}

          </View>
        </View>
      )}

      {selectedUserId && !selectedMeetId && (
        <View style={styles.cardContainer}>
          <View
            style={[
              styles.card,
              styles.publicProfileCard,
              { maxHeight: profileCardMaxHeight },
              selectedProfile?.is_active_premium && selectedProfile?.accent_color
                ? { borderColor: selectedProfile.accent_color }
                : null,
            ]}
          >
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
                <View style={styles.profileNameRow}>
                  <Text style={styles.cardName}>{displayName}</Text>
                  {selectedProfile?.is_active_premium ? (
                    <View style={styles.premiumBadge}>
                      <Text style={styles.premiumBadgeText}>PREMIUM</Text>
                    </View>
                  ) : null}
                </View>
                {selectedProfile?.username && (
                  <Text style={styles.cardSub}>@{selectedProfile.username}</Text>
                )}
                {locationLabel ? <Text style={styles.cardSubSmall}>{locationLabel}</Text> : null}

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
            <ScrollView
              style={styles.publicProfileScroll}
              contentContainerStyle={styles.publicProfileScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {selectedProfile?.bio ? (
                <Text style={styles.profileBio}>{selectedProfile.bio}</Text>
              ) : (
                <Text style={styles.cardSubSmall}>No bio added.</Text>
              )}

              {socialEntries.length > 0 && (
                <View style={styles.socialRow}>
                  {socialEntries.map((social) => (
                    <Pressable
                      key={social.key}
                      onPress={() => ExpoLinking.openURL(social.url)}
                      style={({ pressed }) => [styles.socialPill, pressed && { opacity: 0.85 }]}
                    >
                      <Text style={styles.socialPillText}>{social.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.carsSection}>
                <Text style={styles.carsTitle}>Cars</Text>
                {!hasCars ? (
                  <Text style={styles.cardSubSmall}>No cars listed.</Text>
                ) : (
                  selectedUserCars.map((car) => {
                    const title = [car.year, car.make, car.model].filter(Boolean).join(" ");
                    const subtitle = [car.color, car.trim].filter(Boolean).join(" • ");
                    return (
                      <View key={car.id} style={styles.carRow}>
                        {car.photo_url ? (
                          <Image source={{ uri: car.photo_url }} style={styles.carPhoto} />
                        ) : (
                          <View style={[styles.carPhoto, styles.carPhotoFallback]}>
                            <Text style={styles.carPhotoFallbackText}>No Photo</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <View style={styles.carNameRow}>
                            <Text style={styles.carName}>{title || "Unknown car"}</Text>
                            {car.is_primary ? <Text style={styles.primaryTag}>Primary</Text> : null}
                          </View>
                          {subtitle ? <Text style={styles.cardSubSmall}>{subtitle}</Text> : null}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>

            <View style={styles.cardActions}>
              {friendRelationshipState !== "friends" ? (
                <Pressable
                  onPress={friendRelationshipState === "none" ? sendFriendRequest : undefined}
                  disabled={
                    sendingRequest ||
                    !!profileError ||
                    profileLoading ||
                    friendRelationshipState !== "none"
                  }
                  style={({ pressed }) => [
                    styles.friendBtn,
                    friendRelationshipState !== "none" && styles.friendBtnDisabled,
                    (pressed || sendingRequest) && { opacity: 0.8 },
                  ]}
                >
                  {sendingRequest ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.friendBtnText}>
                      {friendRelationshipState === "request_sent"
                        ? "Request Sent"
                        : friendRelationshipState === "request_received"
                          ? "Respond"
                          : "Send Friend Request"}
                    </Text>
                  )}
                </Pressable>
              ) : (
                <View style={styles.friendBadge}>
                  <Text style={styles.friendBadgeText}>Friends</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
