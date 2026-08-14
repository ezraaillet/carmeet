import * as ExpoLinking from "expo-linking";
import * as Location from "expo-location";

import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
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
import {
  Car,
  FriendRelationshipState,
  LiveLoc,
  Profile,
} from "@/features/map/mapTypes";
import MapView, {
  Marker,
  PROVIDER_GOOGLE,
  Region,
} from "react-native-maps";
import {
  PUBLIC_DISCOVERY_RADIUS_METERS,
  useMapData,
} from "@/components/MapDataProvider";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  distanceBetweenCoordsMeters,
  distanceInMeters,
  formatLastSeen,
  formatMeetStatus,
  isFresh,
} from "@/features/map/mapHelpers";
import {
  ensureMinimalProfileExists,
  hasMapProfileData,
} from "@/utils/profileReadiness";
import {
  fetchUserMarkerCardData,
  getCurrentAuthUser,
  deleteMyLocation,
  insertFriendRequest,
  blockUser,
  unblockUser,
  upsertLocation,
} from "@/features/map/mapService";
import {
  getLocationTrackingMode,
  setLocationTrackingMode,
} from "@/features/location/locationTracking";
import { useLocalSearchParams, useRouter } from "expo-router";

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/styles/themes";
import styles from "@/styles/mapstyles";
import { supabase } from "../database/supabase";
import { useFocusEffect } from "@react-navigation/native";

const OVERLAP_THRESHOLD_METERS = 1.5;
const OVERLAP_SPREAD_RADIUS_METERS = 7;
const CLUSTER_CURRENT_USER_OVERLAP_THRESHOLD_METERS = 18;
const CLUSTER_MIN_SIZE = 4;
const CLUSTER_MAX_ZOOM_LATITUDE_DELTA = 0.012;
const DEFAULT_MARKER_BORDER_COLOR = colors.primary;
const OTHER_USER_MARKER_Z_INDEX = 100;
const MY_USER_MARKER_Z_INDEX = 1300;
const MEET_MARKER_Z_INDEX = 1000;
const CLUSTER_MARKER_Z_INDEX = 1200;
const INITIAL_LOCATION_LATITUDE_DELTA = 0.0725;
const FOLLOW_LOCATION_LATITUDE_DELTA = 0.0145;

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

type MeetAttendeeListStatus = "going" | "interested";

type MeetAttendeeListItem = {
  userId: string;
  status: MeetAttendeeListStatus;
  updatedAt: string | null;
  profile: Profile | null;
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

function getProfileMarkerAvatar(
  profile: Profile | undefined,
  userId: string,
): MarkerAvatarData {
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

  const locationVisibility = (
    profile.location_visibility ?? "everyone"
  ).toLowerCase();
  const profileVisibility = (
    profile.profile_visibility ?? "public"
  ).toLowerCase();

  return (
    locationVisibility === "everyone" &&
    (profileVisibility === "public" || profileVisibility === "everyone")
  );
}

function getMeetRowStatusLabel(
  status?: string | null,
  startTime?: string | null,
  endTime?: string | null,
  nowMs = Date.now(),
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
      <View style={[styles.userPinAvatarRing, { borderColor }]}>
        {uri ? (
          <Image source={{ uri }} style={styles.userPinAvatarImage} />
        ) : (
          <View style={styles.userPinAvatarFallback}>
            <Text style={styles.userPinAvatarInitials}>{initials}</Text>
          </View>
        )}
      </View>
      <View style={[styles.userPinTail, { borderTopColor: borderColor }]} />
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
          offsetAboveCurrentUser
            ? styles.clusterAvatarFanOffsetAboveUser
            : null,
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
              {
                borderColor: avatar.borderColor ?? DEFAULT_MARKER_BORDER_COLOR,
              },
            ]}
          >
            {avatar.uri ? (
              <Image
                source={{ uri: avatar.uri }}
                style={styles.clusterAvatarImage}
              />
            ) : (
              <View style={styles.clusterAvatarFallback}>
                <Text style={styles.clusterAvatarInitials}>
                  {avatar.initials}
                </Text>
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

const UserMarkerLayer = React.memo(function UserMarkerLayer({
  userMarkerItems,
  profilesById,
  effectiveMyUserId,
  clusterModeVersion,
  onUserMarkerPress,
}: {
  userMarkerItems: UserMarkerItem[];
  profilesById: Record<string, Profile>;
  effectiveMyUserId: string | null | undefined;
  clusterModeVersion: number;
  onUserMarkerPress: (userId: string) => void;
}) {
  return (
    <>
      {userMarkerItems.map((item) => {
        const { loc, adjLat, adjLng } = item;
        const p = profilesById[loc.user_id];

        const markerAvatar = getProfileMarkerAvatar(p, loc.user_id);

        const fresh = isFresh(loc.updated_at, 2 * 60 * 1000);
        const markerUri = markerAvatar.uri;
        const markerInitials = markerAvatar.initials;
        const markerBorderColor =
          markerAvatar.borderColor ?? DEFAULT_MARKER_BORDER_COLOR;

        return (
          <Marker
            key={`user-mode-${clusterModeVersion}-${loc.user_id}`}
            identifier={`user-${loc.user_id}`}
            coordinate={{ latitude: adjLat, longitude: adjLng }}
            centerOffset={{ x: 0, y: -32 }}
            zIndex={
              loc.user_id === effectiveMyUserId
                ? MY_USER_MARKER_Z_INDEX
                : OTHER_USER_MARKER_Z_INDEX
            }
            onPress={() => onUserMarkerPress(loc.user_id)}
            tracksViewChanges={false}
            stopPropagation
          >
            <UserPinAvatar
              uri={markerUri}
              initials={markerInitials}
              borderColor={markerBorderColor}
              fresh={fresh}
            />
          </Marker>
        );
      })}
    </>
  );
});

const MeetMarkerLayer = React.memo(function MeetMarkerLayer({
  showMeetPins,
  meetMarkers,
  selectedMeetId,
  meetMarkerRedrawVersion,
  meetMarkersTrackViewChanges,
  onMeetMarkerPress,
}: {
  showMeetPins: boolean;
  meetMarkers: MeetMarkerItem[];
  selectedMeetId: string | null;
  meetMarkerRedrawVersion: number;
  meetMarkersTrackViewChanges: boolean;
  onMeetMarkerPress: (meetId: string) => void;
}) {
  if (!showMeetPins) return null;

  return (
    <>
      {meetMarkers.map((meet) => {
        const isSelected = meet.id === selectedMeetId;

        return (
          <Marker
            key={`meet-${meetMarkerRedrawVersion}-${meet.id}`}
            identifier={`meet-${meet.id}`}
            coordinate={{ latitude: meet.latitude, longitude: meet.longitude }}
            zIndex={MEET_MARKER_Z_INDEX}
            tracksViewChanges={meetMarkersTrackViewChanges}
            onPress={(event) => {
              event.stopPropagation?.();
              onMeetMarkerPress(meet.id);
            }}
            stopPropagation
          >
            <View
              style={[
                styles.meetMarkerWrap,
                isSelected ? styles.meetMarkerWrapSelected : null,
              ]}
            >
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
              {
                latitude: currentUserLocation.lat,
                longitude: currentUserLocation.lng,
              },
            ) <= CLUSTER_CURRENT_USER_OVERLAP_THRESHOLD_METERS
          : false;
        const clusterAvatars = item.members
          .slice(0, 3)
          .map((member) =>
            getProfileMarkerAvatar(profilesById[member.userId], member.userId),
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
  const params = useLocalSearchParams<{
    focusMeetId?: string;
    focusUserId?: string;
    latitude?: string;
    longitude?: string;
  }>();
  const hasRequestedMeetTarget = useMemo(() => {
    const hasMeetId =
      typeof params.focusMeetId === "string" && params.focusMeetId.length > 0;
    const latitude = Number(params.latitude);
    const longitude = Number(params.longitude);
    const hasCoordinates =
      Number.isFinite(latitude) && Number.isFinite(longitude);
    return hasMeetId || hasCoordinates;
  }, [params.focusMeetId, params.latitude, params.longitude]);
  const mapRef = useRef<MapView | null>(null);
  const hasUserMovedMapRef = useRef(false);
  const isProgrammaticCameraMoveRef = useRef(false);
  const selectedMeetIdRef = useRef<string | null>(null);
  const selectedUserIdRef = useRef<string | null>(null);
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const collapsedSheetHeight = Math.round(screenHeight * 0.33);
  const expandedSheetHeight = Math.round(screenHeight * 0.76);
  const sheetHeightAnim = useRef(
    new Animated.Value(collapsedSheetHeight),
  ).current;
  const sheetDragStartHeightRef = useRef(collapsedSheetHeight);
  const sheetVisibleHeightRef = useRef(collapsedSheetHeight);

  const {
    profilesById,
    locationsById,
    friendIds,
    blockedUserIds,
    meets,
    myMeetAttendanceByMeetId,
    meetAttendeeSummaryByMeetId,
    refresh,
    refreshMeets,
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
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [selectedUserCars, setSelectedUserCars] = useState<Car[]>([]);
  const [friendRelationshipState, setFriendRelationshipState] =
    useState<FriendRelationshipState>("none");

  const [selectedMeetId, setSelectedMeetId] = useState<string | null>(null);
  const [meetAttendanceSavingStatus, setMeetAttendanceSavingStatus] = useState<
    string | null
  >(null);
  const [meetOwnerActionLoading, setMeetOwnerActionLoading] = useState<
    "cancel" | "delete" | null
  >(null);
  const [attendeeListOpen, setAttendeeListOpen] = useState(false);
  const [attendeeListTab, setAttendeeListTab] =
    useState<MeetAttendeeListStatus>("going");
  const [attendeeListLoading, setAttendeeListLoading] = useState(false);
  const [attendeeListError, setAttendeeListError] = useState<string | null>(null);
  const [meetAttendees, setMeetAttendees] = useState<MeetAttendeeListItem[]>([]);
  const [meetSearchQuery, setMeetSearchQuery] = useState("");
  const [showMeetPins, setShowMeetPins] = useState(true);
  const [clusterMarkerRedrawVersion, setClusterMarkerRedrawVersion] =
    useState(0);
  const [clusterMarkersTrackViewChanges, setClusterMarkersTrackViewChanges] =
    useState(false);
  const previousMeetMarkerRedrawStateRef = useRef({
    selectedMeetId,
    showMeetPins,
    meetIdsKey: "",
  });

  useEffect(() => {
    selectedMeetIdRef.current = selectedMeetId;
  }, [selectedMeetId]);

  useEffect(() => {
    selectedUserIdRef.current = selectedUserId;
  }, [selectedUserId]);

  useEffect(() => {
    const previous = previousMeetMarkerRedrawStateRef.current;
    const meetIdsKey = meets.map((meet) => meet.id).join("|");
    const meetMarkerStateChanged =
      previous.selectedMeetId !== selectedMeetId ||
      previous.showMeetPins !== showMeetPins ||
      previous.meetIdsKey !== meetIdsKey;

    if (!meetMarkerStateChanged) return;

    previousMeetMarkerRedrawStateRef.current = {
      selectedMeetId,
      showMeetPins,
      meetIdsKey,
    };
    setClusterMarkerRedrawVersion((version) => version + 1);
    setClusterMarkersTrackViewChanges(true);

    const timeout = setTimeout(() => {
      setClusterMarkersTrackViewChanges(false);
    }, 350);

    return () => clearTimeout(timeout);
  }, [meets, selectedMeetId, showMeetPins]);
  const [focusedClusterKey, setFocusedClusterKey] = useState<string | null>(
    null,
  );
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
      if (!authed) return;

      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== "granted") {
        setHasPermission(false);
        return;
      }

      if ((await getLocationTrackingMode()) === "always") {
        await setLocationTrackingMode("always");
      }

      setHasPermission(true);
    })();
  }, [authed]);

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
    [],
  );

  const followMyLocationOnMap = useCallback(
    (
      target: { latitude: number; longitude: number },
      options: {
        duration?: number;
        latitudeDelta?: number;
        respectSheetOffset?: boolean;
      } = {},
    ) => {
      if (!mapRef.current) return;

      const latitudeDelta =
        options.latitudeDelta ?? FOLLOW_LOCATION_LATITUDE_DELTA;
      const respectSheetOffset = options.respectSheetOffset ?? true;
      const sheetHeight = respectSheetOffset
        ? Math.min(screenHeight, Math.max(0, sheetVisibleHeightRef.current))
        : 0;
      const visibleMapHeight = Math.max(1, screenHeight - sheetHeight);
      const latitudeOffset = respectSheetOffset
        ? (latitudeDelta * (screenHeight - visibleMapHeight)) /
          (2 * screenHeight)
        : 0;
      const longitudeDelta = latitudeDelta * (screenWidth / visibleMapHeight);

      isProgrammaticCameraMoveRef.current = true;
      mapRef.current.animateToRegion(
        {
          latitude: target.latitude - latitudeOffset,
          longitude: target.longitude,
          latitudeDelta,
          longitudeDelta,
        },
        options.duration ?? 650,
      );
    },
    [screenHeight, screenWidth],
  );

  useFocusEffect(
    useCallback(() => {
      if (!hasPermission || !authed) return;

      let sub: Location.LocationSubscription | null = null;
      let cancelled = false;

      const applyLocationToMap = async (
        position: Location.LocationObject,
        options: { animateIfAllowed: boolean },
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

        if (canAnimateToMe) {
          followMyLocationOnMap(
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            {
              duration: 700,
              latitudeDelta: INITIAL_LOCATION_LATITUDE_DELTA,
              respectSheetOffset: false,
            },
          );
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
            current.coords.speed ?? undefined,
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
              if (cancelled) return;

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

              const shouldFollowMyLocation =
                !hasRequestedMeetTarget &&
                !hasUserMovedMapRef.current &&
                !selectedMeetIdRef.current &&
                !selectedUserIdRef.current;

              if (shouldFollowMyLocation) {
                followMyLocationOnMap(
                  { latitude: coords.latitude, longitude: coords.longitude },
                  {
                    duration: 650,
                    latitudeDelta: FOLLOW_LOCATION_LATITUDE_DELTA,
                    respectSheetOffset: true,
                  },
                );
              }

              await upsertMyLocation(
                coords.latitude,
                coords.longitude,
                coords.heading ?? undefined,
                coords.speed ?? undefined,
              );
            },
          );
        } catch (e: any) {
          console.warn("Location watch error:", e?.message ?? e);
        }
      })();

      return () => {
        cancelled = true;
        sub?.remove();
        if (myUserId) {
          void deleteMyLocation(myUserId);
        }
      };
    }, [
      hasPermission,
      authed,
      upsertMyLocation,
      setMyLiveLocation,
      myUserId,
      hasRequestedMeetTarget,
      followMyLocationOnMap,
    ]),
  );

  const locationsByIdKeys = useMemo(
    () => Object.keys(locationsById),
    [locationsById],
  );
  const profilesByIdKeys = useMemo(
    () => Object.keys(profilesById),
    [profilesById],
  );
  const effectiveMyUserId = myUserId ?? mapDataUserId;

  const sourceLocations = useMemo(
    () =>
      Object.values(locationsById).filter(
        (loc) => Number.isFinite(loc.lat) && Number.isFinite(loc.lng),
      ),
    [locationsById],
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
          { latitude: loc.lat, longitude: loc.lng },
        ),
      }))
      .sort((a, b) => b.distanceFromCenter - a.distanceFromCenter)
      .slice(0, 2)
      .map((item) => item.userId);
  }, [region.latitude, region.longitude, sourceLocations]);

  const markerDataSignature = useMemo(() => {
    const locationSignature = Object.values(locationsById)
      .map(
        (loc) => `${loc.user_id}:${loc.lat}:${loc.lng}:${loc.updated_at ?? ""}`,
      )
      .sort()
      .join("|");
    const profileSignature = Object.values(profilesById)
      .map(
        (profile) =>
          `${profile.id}:${profile.photo_url ?? ""}:${profile.display_name ?? ""}:${profile.username ?? ""}:${profile.is_active_premium ? "1" : "0"}:${profile.accent_color ?? ""}`,
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
      Math.min(120, 40 * (region.latitudeDelta / 0.05)),
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

    const baseLocations = Array.from(baseLocationsById.values()).filter(
      (loc) => {
        if (loc.user_id === effectiveMyUserId || friendIdSet.has(loc.user_id)) {
          return true;
        }

        if (!myLocation) return false;
        const profile = profilesById[loc.user_id];
        if (!isPubliclyDiscoverableProfile(profile)) return false;

        return (
          distanceInMeters(myLocation, loc) <= PUBLIC_DISCOVERY_RADIUS_METERS
        );
      },
    );
    const clusterableLocations = baseLocations.filter(
      (loc) =>
        loc.user_id !== effectiveMyUserId && !friendIdSet.has(loc.user_id),
    );
    const alwaysRenderedLocations = baseLocations.filter(
      (loc) =>
        loc.user_id === effectiveMyUserId || friendIdSet.has(loc.user_id),
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
          distanceInMeters(loc, candidate) <= OVERLAP_THRESHOLD_METERS,
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

  const handleRegionChange = useCallback(
    (_nextRegion: Region, details?: { isGesture?: boolean }) => {
      if (details?.isGesture) {
        hasUserMovedMapRef.current = true;
        isProgrammaticCameraMoveRef.current = false;
      }
    },
    [],
  );

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
    [focusedClusterKey],
  );

  const meetMarkers = useMemo(() => {
    return meets
      .filter(
        (meet) =>
          Number.isFinite(meet.latitude) && Number.isFinite(meet.longitude),
      )
      .map((meet) => ({
        ...meet,
        latitude: Number(meet.latitude),
        longitude: Number(meet.longitude),
      }));
  }, [meets]);

  useEffect(() => {
    const focusMeetId = params.focusMeetId;
    if (
      !focusMeetId ||
      typeof focusMeetId !== "string" ||
      meetMarkers.length === 0
    )
      return;

    const fallbackLatitude = Number(params.latitude);
    const fallbackLongitude = Number(params.longitude);

    const requestedMeet = meetMarkers.find((meet) => meet.id === focusMeetId);
    const targetLatitude = requestedMeet?.latitude ?? fallbackLatitude;
    const targetLongitude = requestedMeet?.longitude ?? fallbackLongitude;

    if (!Number.isFinite(targetLatitude) || !Number.isFinite(targetLongitude))
      return;

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
      700,
    );
  }, [meetMarkers, params.focusMeetId, params.latitude, params.longitude]);

  const userMarkerItems = useMemo(
    () =>
      mapMarkers.filter(
        (item): item is UserMarkerItem => item.type === "user",
      ),
    [mapMarkers],
  );

  const clusterMarkerItems = useMemo(
    () =>
      mapMarkers.filter(
        (item): item is ClusterMarkerItem => item.type === "cluster",
      ),
    [mapMarkers],
  );

  const currentUserLocation = useMemo(() => {
    if (!effectiveMyUserId) return null;

    const loc = locationsById[effectiveMyUserId];
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng))
      return null;

    return loc;
  }, [effectiveMyUserId, locationsById]);

  const selectedMeet = useMemo(() => {
    if (!selectedMeetId) return null;
    return meetMarkers.find((meet) => meet.id === selectedMeetId) ?? null;
  }, [selectedMeetId, meetMarkers]);
  const selectedMeetHasCoordinates = useMemo(() => {
    if (!selectedMeet) return false;
    return (
      Number.isFinite(selectedMeet.latitude) &&
      Number.isFinite(selectedMeet.longitude)
    );
  }, [selectedMeet]);
  const selectedMeetDate = useMemo(() => {
    if (!selectedMeet?.start_time) return null;
    const date = new Date(selectedMeet.start_time);
    if (!Number.isFinite(date.getTime())) return null;

    return {
      day: String(date.getDate()).padStart(2, "0"),
      month: date.toLocaleString(undefined, { month: "short" }),
      time: date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
    };
  }, [selectedMeet?.start_time]);
  const selectedMeetAttendanceStatus = selectedMeet
    ? (myMeetAttendanceByMeetId[selectedMeet.id] ?? null)
    : null;
  const selectedMeetAttendanceSummary = selectedMeet
    ? (meetAttendeeSummaryByMeetId[selectedMeet.id] ?? {
        going: 0,
        interested: 0,
      })
    : { going: 0, interested: 0 };
  const isSelectedMeetOwner = Boolean(
    selectedMeet && effectiveMyUserId && selectedMeet.created_by === effectiveMyUserId,
  );
  const visibleMeetAttendees = useMemo(
    () => meetAttendees.filter((attendee) => attendee.status === attendeeListTab),
    [attendeeListTab, meetAttendees],
  );
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
    setAttendeeListOpen(false);
    setMeetAttendees([]);
    setAttendeeListError(null);
  }, [selectedMeetId]);
  useEffect(() => {
    sheetHeightAnim.setValue(collapsedSheetHeight);
    sheetDragStartHeightRef.current = collapsedSheetHeight;
    sheetVisibleHeightRef.current = collapsedSheetHeight;
  }, [collapsedSheetHeight, sheetHeightAnim]);

  const animateSheetTo = useCallback(
    (nextHeight: number) => {
      const clampedHeight = Math.max(
        collapsedSheetHeight,
        Math.min(expandedSheetHeight, nextHeight),
      );
      sheetVisibleHeightRef.current = clampedHeight;
      Animated.spring(sheetHeightAnim, {
        toValue: clampedHeight,
        useNativeDriver: false,
        bounciness: 0,
        speed: 18,
      }).start(({ finished }) => {
        if (finished) {
          sheetHeightAnim.stopAnimation((value) => {
            sheetDragStartHeightRef.current = value;
            sheetVisibleHeightRef.current = value;
          });
        }
      });
    },
    [collapsedSheetHeight, expandedSheetHeight, sheetHeightAnim],
  );

  const meetsSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx) &&
          Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: () => {
          sheetHeightAnim.stopAnimation((value) => {
            sheetDragStartHeightRef.current = value;
            sheetVisibleHeightRef.current = value;
          });
        },
        onPanResponderMove: (_evt, gestureState) => {
          const nextHeight = sheetDragStartHeightRef.current - gestureState.dy;
          const clampedHeight = Math.max(
            collapsedSheetHeight,
            Math.min(expandedSheetHeight, nextHeight),
          );
          sheetHeightAnim.setValue(clampedHeight);
          sheetVisibleHeightRef.current = clampedHeight;
        },
        onPanResponderRelease: (_evt, gestureState) => {
          const draggedHeight =
            sheetDragStartHeightRef.current - gestureState.dy;
          const velocityAdjustedHeight = draggedHeight - gestureState.vy * 120;
          const midpoint = (collapsedSheetHeight + expandedSheetHeight) / 2;
          animateSheetTo(
            velocityAdjustedHeight > midpoint
              ? expandedSheetHeight
              : collapsedSheetHeight,
          );
        },
        onPanResponderTerminate: () => {
          animateSheetTo(collapsedSheetHeight);
        },
      }),
    [
      animateSheetTo,
      collapsedSheetHeight,
      expandedSheetHeight,
      sheetHeightAnim,
    ],
  );

  const focusMyLocation = useCallback(async () => {
    let target = currentUserLocation
      ? {
          latitude: currentUserLocation.lat,
          longitude: currentUserLocation.lng,
        }
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

    if (!target) return;

    closeProfileCard();
    hasUserMovedMapRef.current = false;
    followMyLocationOnMap(target, {
      duration: 700,
      latitudeDelta: FOLLOW_LOCATION_LATITUDE_DELTA,
      respectSheetOffset: true,
    });
  }, [
    currentUserLocation,
    effectiveMyUserId,
    followMyLocationOnMap,
    setMyLiveLocation,
  ]);

  const toggleMeetMarkers = useCallback(() => {
    setShowMeetPins((visible) => !visible);
  }, []);

  const loadMeetAttendees = useCallback(
    async (meetId: string) => {
      setAttendeeListLoading(true);
      setAttendeeListError(null);

      try {
        const { data: attendanceRows, error: attendanceError } = await supabase
          .from("meet_attendees")
          .select("user_id, status, updated_at")
          .eq("meet_id", meetId)
          .in("status", ["going", "interested"])
          .order("updated_at", { ascending: false });

        if (attendanceError) throw attendanceError;

        const validAttendanceRows = (attendanceRows ?? []).filter(
          (row): row is {
            user_id: string;
            status: MeetAttendeeListStatus;
            updated_at: string | null;
          } =>
            Boolean(row.user_id) &&
            (row.status === "going" || row.status === "interested"),
        );
        const attendeeUserIds = Array.from(
          new Set(validAttendanceRows.map((row) => row.user_id)),
        );

        if (attendeeUserIds.length === 0) {
          setMeetAttendees([]);
          return;
        }

        const [profileResult, membershipResult, customizationResult] =
          await Promise.all([
            supabase
              .from("profiles")
              .select(
                "id, username, display_name, photo_url, profile_visibility, location_visibility, bio, city, state, instagram_handle, tiktok_handle, twitter_handle, snapchat_handle, onboarded",
              )
              .in("id", attendeeUserIds),
            supabase
              .from("user_memberships")
              .select("user_id, plan, status")
              .in("user_id", attendeeUserIds),
            supabase
              .from("profile_customizations")
              .select("user_id, accent_color")
              .in("user_id", attendeeUserIds),
          ]);

        if (profileResult.error) throw profileResult.error;

        if (membershipResult.error) {
          console.warn(
            "Meet attendee membership load failed:",
            membershipResult.error.message,
          );
        }

        if (customizationResult.error) {
          console.warn(
            "Meet attendee customization load failed:",
            customizationResult.error.message,
          );
        }

        const membershipByUserId = new Map<
          string,
          { plan: string | null; status: string | null }
        >();
        (membershipResult.error ? [] : membershipResult.data ?? []).forEach(
          (row: any) => {
            membershipByUserId.set(row.user_id, {
              plan: row.plan ?? null,
              status: row.status ?? null,
            });
          },
        );

        const customizationByUserId = new Map<string, string | null>();
        (customizationResult.error
          ? []
          : customizationResult.data ?? []
        ).forEach((row: any) => {
          customizationByUserId.set(row.user_id, row.accent_color ?? null);
        });

        const profileByUserId = new Map<string, Profile>();
        (profileResult.data ?? []).forEach((profile: any) => {
          const membership = membershipByUserId.get(profile.id);
          const plan = membership?.plan ?? null;
          const membershipStatus = membership?.status ?? null;
          profileByUserId.set(profile.id, {
            ...(profile as Profile),
            membership_plan: plan,
            membership_status: membershipStatus,
            accent_color: customizationByUserId.get(profile.id) ?? null,
            is_active_premium:
              plan === "premium" && membershipStatus === "active",
          });
        });

        const visibleAttendees = validAttendanceRows.reduce<
          MeetAttendeeListItem[]
        >((acc, row) => {
          const profile = profileByUserId.get(row.user_id) ?? null;
          const isSelf = row.user_id === effectiveMyUserId;
          const isFriend = friendIds.includes(row.user_id);
          const profileVisibility = (
            profile?.profile_visibility ?? "public"
          ).toLowerCase();
          const canShowProfile =
            isSelf ||
            isFriend ||
            profileVisibility === "public" ||
            profileVisibility === "everyone";

          if (!canShowProfile) return acc;

          acc.push({
            userId: row.user_id,
            status: row.status,
            updatedAt: row.updated_at,
            profile,
          });
          return acc;
        }, []);

        setMeetAttendees(visibleAttendees);
      } catch (e: any) {
        setMeetAttendees([]);
        setAttendeeListError(e?.message ?? "Could not load attendees.");
      } finally {
        setAttendeeListLoading(false);
      }
    },
    [effectiveMyUserId, friendIds],
  );

  const openMeetAttendeeList = useCallback(
    (status: MeetAttendeeListStatus) => {
      if (!selectedMeet) return;
      setAttendeeListTab(status);
      setAttendeeListOpen(true);
      void loadMeetAttendees(selectedMeet.id);
    },
    [loadMeetAttendees, selectedMeet],
  );
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

  const openEditSelectedMeet = useCallback(() => {
    if (!selectedMeet || !isSelectedMeetOwner) return;
    router.push({ pathname: "/edit-meet", params: { meetId: selectedMeet.id } });
  }, [isSelectedMeetOwner, router, selectedMeet]);

  const cancelSelectedMeet = useCallback(() => {
    if (!selectedMeet || !effectiveMyUserId || !isSelectedMeetOwner) return;

    Alert.alert(
      "Cancel meet?",
      "This keeps the meet visible but marks it as cancelled.",
      [
        { text: "Never mind", style: "cancel" },
        {
          text: "Cancel Meet",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setMeetOwnerActionLoading("cancel");
              const { error } = await supabase
                .from("meets")
                .update({ status: "cancelled" })
                .eq("id", selectedMeet.id)
                .eq("created_by", effectiveMyUserId);

              if (error) {
                Alert.alert("Could not cancel meet", error.message);
              } else {
                await refreshMeets(effectiveMyUserId);
              }

              setMeetOwnerActionLoading(null);
            })();
          },
        },
      ],
    );
  }, [effectiveMyUserId, isSelectedMeetOwner, refreshMeets, selectedMeet]);

  const deleteSelectedMeet = useCallback(() => {
    if (!selectedMeet || !effectiveMyUserId || !isSelectedMeetOwner) return;

    Alert.alert(
      "Delete meet?",
      "This removes the meet and its Going/Interested list. This cannot be undone.",
      [
        { text: "Never mind", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setMeetOwnerActionLoading("delete");
              const { error } = await supabase
                .from("meets")
                .delete()
                .eq("id", selectedMeet.id)
                .eq("created_by", effectiveMyUserId);

              if (error) {
                Alert.alert("Could not delete meet", error.message);
              } else {
                setSelectedMeetId(null);
                await refreshMeets(effectiveMyUserId);
              }

              setMeetOwnerActionLoading(null);
            })();
          },
        },
      ],
    );
  }, [effectiveMyUserId, isSelectedMeetOwner, refreshMeets, selectedMeet]);
  const updateSelectedMeetAttendance = useCallback(
    async (status: "going" | "interested") => {
      if (!selectedMeet || !effectiveMyUserId || meetAttendanceSavingStatus)
        return;

      try {
        setMeetAttendanceSavingStatus(status);
        const isUnselecting = selectedMeetAttendanceStatus === status;
        const { error } = await supabase.rpc("set_meet_attendance", {
          p_meet_id: selectedMeet.id,
          p_status: isUnselecting ? null : status,
        });

        if (error) {
          Alert.alert("Could not update meet", error.message);
          return;
        }

        await refreshMeets(effectiveMyUserId);
        if (attendeeListOpen) {
          void loadMeetAttendees(selectedMeet.id);
        }
      } finally {
        setMeetAttendanceSavingStatus(null);
      }
    },
    [
      attendeeListOpen,
      effectiveMyUserId,
      loadMeetAttendees,
      meetAttendanceSavingStatus,
      refreshMeets,
      selectedMeet,
      selectedMeetAttendanceStatus,
    ],
  );

  function renderSelectedMeetDetails() {
    if (!selectedMeet) return null;

    return (
      <View style={styles.meetDetailCard}>
        <View style={styles.meetDetailHeader}>
          <View style={styles.meetDetailTitleWrap}>
            <Text style={styles.meetDetailTitle}>
              {selectedMeet.title || "Meet"}
            </Text>
            <Text style={styles.meetDetailMeta}>
              {selectedMeetAttendanceSummary.going + selectedMeetAttendanceSummary.interested} Attendees •{" "}
              {selectedMeetAttendanceSummary.interested} Interested
            </Text>
          </View>
          <Pressable
            onPress={() => setSelectedMeetId(null)}
            style={styles.meetDetailCloseButton}
            accessibilityRole="button"
            accessibilityLabel="Close meet details"
          >
            <MaterialCommunityIcons name="close" size={16} color="#d6d6d6" />
          </Pressable>
        </View>

        {selectedMeet.cover_image_url ? (
          <Image
            source={{ uri: selectedMeet.cover_image_url }}
            style={styles.meetDetailCoverImage}
            resizeMode="cover"
          />
        ) : null}

        <View style={styles.meetDetailRsvpRow}>
          {(["going", "interested"] as const).map((status) => {
            const selected = selectedMeetAttendanceStatus === status;
            const saving = meetAttendanceSavingStatus === status;
            const icon =
              status === "going"
                ? "check-circle-outline"
                : "help-circle-outline";
            const label = status === "going" ? "Going" : "Interested";

            return (
              <Pressable
                key={status}
                onPress={() => {
                  void updateSelectedMeetAttendance(status);
                }}
                disabled={Boolean(meetAttendanceSavingStatus)}
                style={[
                  styles.meetDetailRsvpButton,
                  selected && styles.meetDetailRsvpButtonSelected,
                  status === "going" &&
                    selected &&
                    styles.meetDetailRsvpButtonGoing,
                  saving && { opacity: 0.75 },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name={icon}
                      size={18}
                      color={selected ? "#111" : "#fff"}
                    />
                    <Text
                      style={[
                        styles.meetDetailRsvpButtonText,
                        selected && styles.meetDetailRsvpButtonTextSelected,
                      ]}
                    >
                      {label}
                    </Text>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => openMeetAttendeeList("going")}
          style={({ pressed }) => [
            styles.meetAttendeesSummaryButton,
            pressed && { opacity: 0.84 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="View meet attendees"
        >
          <View style={styles.meetAttendeesSummaryIconWrap}>
            <MaterialCommunityIcons
              name="account-group-outline"
              size={18}
              color="#ef4444"
            />
          </View>
          <View style={styles.meetAttendeesSummaryTextWrap}>
            <Text style={styles.meetAttendeesSummaryTitle}>View attendees</Text>
            <Text style={styles.meetAttendeesSummarySubtitle}>
              {selectedMeetAttendanceSummary.going} Going / {" "}
              {selectedMeetAttendanceSummary.interested} Interested
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#aaa" />
        </Pressable>
        <View style={styles.meetDetailInfoPanel}>
          <View style={styles.meetDetailDateColumn}>
            <Text style={styles.meetDetailDateDay}>
              {selectedMeetDate?.day ?? "--"}
            </Text>
            <Text style={styles.meetDetailDateMonth}>
              {selectedMeetDate?.month ?? "TBD"}
            </Text>
            <Text style={styles.meetDetailDateTime}>
              {selectedMeetDate?.time ?? "TBD"}
            </Text>
          </View>
          <View style={styles.meetDetailAddressColumn}>
            <Text style={styles.meetDetailAddressText}>
              {selectedMeet.address ||
                selectedMeet.location_name ||
                "Location TBD"}
            </Text>
            <Text style={styles.meetDetailStatusText}>
              {formatMeetStatus(selectedMeet.status)}
            </Text>
          </View>
        </View>

        {selectedMeet.description ? (
          <Text style={styles.meetDetailDescription} numberOfLines={3}>
            {selectedMeet.description}
          </Text>
        ) : null}

        {isSelectedMeetOwner ? (
          <View style={styles.meetOwnerPanel}>
            <Text style={styles.meetOwnerLabel}>Host controls</Text>
            <View style={styles.meetOwnerActionsRow}>
              <Pressable
                onPress={openEditSelectedMeet}
                style={styles.meetOwnerEditButton}
              >
                <MaterialCommunityIcons name="pencil" size={16} color="#111" />
                <Text style={styles.meetOwnerEditButtonText}>Edit</Text>
              </Pressable>
              <Pressable
                onPress={cancelSelectedMeet}
                disabled={Boolean(meetOwnerActionLoading)}
                style={styles.meetOwnerSecondaryButton}
              >
                {meetOwnerActionLoading === "cancel" ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="calendar-remove"
                      size={16}
                      color="#fff"
                    />
                    <Text style={styles.meetOwnerSecondaryButtonText}>
                      Cancel
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={deleteSelectedMeet}
                disabled={Boolean(meetOwnerActionLoading)}
                style={styles.meetOwnerDangerButton}
              >
                {meetOwnerActionLoading === "delete" ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={16}
                      color="#fff"
                    />
                    <Text style={styles.meetOwnerDangerButtonText}>Delete</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.meetDetailActionRow}>
          <Pressable
            style={[
              styles.meetDetailDirectionsButton,
              !selectedMeetHasCoordinates && styles.meetDetailActionDisabled,
            ]}
            disabled={!selectedMeetHasCoordinates}
            onPress={handleGetDirections}
          >
            <MaterialCommunityIcons
              name="navigation-variant-outline"
              size={18}
              color="#111"
            />
            <Text style={styles.meetDetailDirectionsButtonText}>
              Directions
            </Text>
          </Pressable>
          <Pressable
            style={styles.meetDetailAddButton}
            onPress={() => {
              void updateSelectedMeetAttendance("interested");
            }}
            disabled={Boolean(meetAttendanceSavingStatus)}
          >
            <MaterialCommunityIcons
              name="calendar-plus"
              size={18}
              color="#fff"
            />
            <Text style={styles.meetDetailAddButtonText}>Add</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
            (cached?.membership_plan === "premium" &&
              cached?.membership_status === "active"),
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
    [myUserId, profilesById],
  );

  useEffect(() => {
    const focusUserId = params.focusUserId;
    if (typeof focusUserId !== "string" || focusUserId.length === 0) return;
    if (focusUserId === selectedUserIdRef.current) return;

    void handleMarkerPress(focusUserId);
  }, [handleMarkerPress, params.focusUserId]);

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
        {
          text: "Go to Profile",
          onPress: () => router.push("/profile?onboarding=1"),
        },
      ],
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
  }, [
    myUserId,
    selectedUserId,
    canUseProfileGatedActions,
    friendRelationshipState,
  ]);

  const toggleBlockUser = useCallback(() => {
    if (!myUserId || !selectedUserId || selectedUserId === myUserId) return;

    const isBlocked = blockedUserIds.includes(selectedUserId);
    const name =
      selectedProfile?.display_name || selectedProfile?.username || "this user";

    Alert.alert(
      isBlocked ? `Unblock ${name}?` : `Block ${name}?`,
      isBlocked
        ? "They will be able to appear in discovery and interact with you again."
        : "They will no longer appear in discovery or interact with you. Any friendship will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isBlocked ? "Unblock" : "Block",
          style: isBlocked ? "default" : "destructive",
          onPress: () => {
            void (async () => {
              setBlockActionLoading(true);
              const { error } = isBlocked
                ? await unblockUser(selectedUserId)
                : await blockUser(selectedUserId);

              if (error) {
                setProfileError(error.message);
              } else {
                setProfileError(null);
                await refresh(myUserId);
                if (!isBlocked) closeProfileCard();
              }
              setBlockActionLoading(false);
            })();
          },
        },
      ],
    );
  }, [blockedUserIds, myUserId, refresh, selectedProfile, selectedUserId]);

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
        },
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
    "Cruizr user";

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
  const primaryProfileCar =
    selectedUserCars.find((car) => car.is_primary) ??
    selectedUserCars[0] ??
    null;
  const publicProfileHeroUri =
    primaryProfileCar?.photo_url ?? selectedProfile?.photo_url ?? null;
  const socialEntries = [
    selectedProfile?.instagram_handle
      ? {
          key: "instagram",
          label: "Instagram",
          icon: "instagram",
          url: `https://instagram.com/${selectedProfile.instagram_handle.replace(/^@/, "")}`,
        }
      : null,
    selectedProfile?.tiktok_handle
      ? {
          key: "tiktok",
          label: "TikTok",
          icon: "music-note",
          url: `https://www.tiktok.com/@${selectedProfile.tiktok_handle.replace(/^@/, "")}`,
        }
      : null,
    selectedProfile?.twitter_handle
      ? {
          key: "twitter",
          label: "X",
          icon: "alpha-x",
          url: `https://x.com/${selectedProfile.twitter_handle.replace(/^@/, "")}`,
        }
      : null,
    selectedProfile?.snapchat_handle
      ? {
          key: "snapchat",
          label: "Snapchat",
          icon: "snapchat",
          url: `https://www.snapchat.com/add/${selectedProfile.snapchat_handle.replace(/^@/, "")}`,
        }
      : null,
  ].filter(
    (
      entry,
    ): entry is {
      key: string;
      label: string;
      icon: keyof typeof MaterialCommunityIcons.glyphMap;
      url: string;
    } => Boolean(entry),
  );

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        <UserMarkerLayer
          userMarkerItems={userMarkerItems}
          profilesById={profilesById}
          effectiveMyUserId={effectiveMyUserId}
          clusterModeVersion={clusterModeVersion}
          onUserMarkerPress={handleMarkerPress}
        />

        <MeetMarkerLayer
          showMeetPins={showMeetPins}
          meetMarkers={meetMarkers}
          selectedMeetId={selectedMeetId}
          meetMarkerRedrawVersion={clusterMarkerRedrawVersion}
          meetMarkersTrackViewChanges={clusterMarkersTrackViewChanges}
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
          <MaterialCommunityIcons
            name="crosshairs-gps"
            size={30}
            color="#fff"
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            showMeetPins ? "Hide meet pins" : "Show meet pins"
          }
          accessibilityState={{ selected: showMeetPins }}
          onPress={toggleMeetMarkers}
          style={({ pressed }) => [
            styles.mapControlButton,
            showMeetPins
              ? styles.mapControlButtonActive
              : styles.mapControlButtonInactive,
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
              {showLocationOverlay
                ? "Getting your location…"
                : "Loading map data…"}
            </Text>
          </View>
        </View>
      )}

      <Animated.View
        style={[styles.meetsSheetContainer, { height: sheetHeightAnim }]}
      >
        <View style={styles.meetsSheet} {...meetsSheetPanResponder.panHandlers}>
          <View style={styles.meetsSheetHandleWrap}>
            <View style={styles.meetsSheetHandle} />
          </View>
          {!selectedMeet ? (
            <View style={styles.meetsSearchBar}>
              <TextInput
                value={meetSearchQuery}
                onChangeText={setMeetSearchQuery}
                placeholder="Search upcoming meets"
                placeholderTextColor="#8a8a8a"
                style={styles.meetsSearchInput}
              />
              <View pointerEvents="none" style={styles.meetsSearchIconWrap}>
                <MaterialCommunityIcons
                  name="magnify"
                  style={styles.meetsSearchIcon}
                />
              </View>
            </View>
          ) : null}
          <ScrollView
            style={styles.meetsListScroll}
            contentContainerStyle={[
              styles.meetsListContent,
              selectedMeet && styles.meetsDetailSheetContent,
            ]}
            showsVerticalScrollIndicator={false}
          >
            {selectedMeet
              ? renderSelectedMeetDetails()
              : filteredMeetMarkers.map((meet) => {
                  const day = meet.start_time
                    ? new Date(meet.start_time)
                    : null;
                  const dateTop =
                    day && Number.isFinite(day.getTime())
                      ? String(day.getDate()).padStart(2, "0")
                      : "--";
                  const dateBottom =
                    day && Number.isFinite(day.getTime())
                      ? day
                          .toLocaleString(undefined, { month: "short" })
                          .toUpperCase()
                      : "TBD";
                  const meetTime = formatMeetRowTime(meet.start_time);
                  const rowStatus = getMeetRowStatusLabel(
                    meet.status,
                    meet.start_time,
                    meet.end_time,
                  );
                  const goingCount =
                    meetAttendeeSummaryByMeetId[meet.id]?.going ?? 0;
                  const interestedCount =
                    meetAttendeeSummaryByMeetId[meet.id]?.interested ?? 0;
                  return (
                    <Pressable
                      key={`sheet-meet-${meet.id}`}
                      onPress={() => {
                        setSelectedMeetId(meet.id);
                        if (mapRef.current) {
                          isProgrammaticCameraMoveRef.current = true;
                          mapRef.current.animateCamera({
                            center: {
                              latitude: meet.latitude,
                              longitude: meet.longitude,
                            },
                            zoom: 14,
                          });
                        }
                      }}
                      style={({ pressed }) => [
                        styles.meetRowCard,
                        pressed && { opacity: 0.88 },
                      ]}
                    >
                      <View style={styles.meetLeftColumn}>
                        <View style={styles.meetDateBlock}>
                          <Text style={styles.meetDateDay}>{dateTop}</Text>
                          <Text style={styles.meetDateMonth}>{dateBottom}</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.meetDateTime}>
                          {meetTime}
                        </Text>
                      </View>
                      <View style={styles.meetRightColumn}>
                        <Text numberOfLines={2} style={styles.meetRowTitle}>
                          {meet.title || "Meet"}
                        </Text>
                        <Text numberOfLines={1} style={styles.meetRowMeta}>
                          {meet.location_name || meet.address || "Location TBD"}
                        </Text>
                        <View style={styles.meetActionsRow}>
                          <Text style={styles.meetActionText}>
                            ✓ {goingCount}
                          </Text>
                          <Text style={styles.meetActionDot}>◦</Text>
                          <Text style={styles.meetActionText}>
                            ◔ {interestedCount}
                          </Text>
                        </View>
                        <Text
                          numberOfLines={1}
                          style={styles.meetRowStatusText}
                        >
                          {rowStatus}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
          </ScrollView>
        </View>
      </Animated.View>

      <Modal
        animationType="fade"
        transparent
        visible={attendeeListOpen}
        onRequestClose={() => setAttendeeListOpen(false)}
      >
        <View style={styles.meetAttendeesModalBackdrop}>
          <View style={styles.meetAttendeesModalCard}>
            <View style={styles.meetAttendeesModalHeader}>
              <View style={styles.meetAttendeesModalTitleWrap}>
                <Text style={styles.meetAttendeesModalTitle}>Attendees</Text>
                <Text numberOfLines={1} style={styles.meetAttendeesModalSubtitle}>
                  {selectedMeet?.title || "Meet"}
                </Text>
              </View>
              <Pressable
                onPress={() => setAttendeeListOpen(false)}
                style={styles.meetAttendeesModalCloseButton}
                accessibilityRole="button"
                accessibilityLabel="Close attendees"
              >
                <MaterialCommunityIcons name="close" size={18} color="#fff" />
              </Pressable>
            </View>

            <View style={styles.meetAttendeesTabsRow}>
              {(["going", "interested"] as const).map((tab) => {
                const selected = attendeeListTab === tab;
                const count = selectedMeetAttendanceSummary[tab];
                return (
                  <Pressable
                    key={tab}
                    onPress={() => setAttendeeListTab(tab)}
                    style={[
                      styles.meetAttendeesTabButton,
                      selected && styles.meetAttendeesTabButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.meetAttendeesTabText,
                        selected && styles.meetAttendeesTabTextActive,
                      ]}
                    >
                      {tab === "going" ? "Going" : "Interested"} ({count})
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {attendeeListLoading ? (
              <View style={styles.meetAttendeesStateBlock}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : attendeeListError ? (
              <Text style={styles.errorText}>{attendeeListError}</Text>
            ) : visibleMeetAttendees.length === 0 ? (
              <View style={styles.meetAttendeesStateBlock}>
                <Text style={styles.meetAttendeesEmptyText}>
                  No {attendeeListTab === "going" ? "going" : "interested"} attendees yet.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.meetAttendeesListScroll}
                contentContainerStyle={styles.meetAttendeesListContent}
                showsVerticalScrollIndicator={false}
              >
                {visibleMeetAttendees.map((attendee) => {
                  const profile = attendee.profile;
                  const name = getProfileMarkerName(profile ?? undefined, attendee.userId);
                  const avatar = getProfileMarkerAvatar(
                    profile ?? undefined,
                    attendee.userId,
                  );
                  const subtitle = profile?.username
                    ? `@${profile.username}`
                    : attendee.userId === myUserId
                      ? "You"
                      : "Cruizr member";

                  return (
                    <Pressable
                      key={`${attendee.status}-${attendee.userId}`}
                      onPress={() => {
                        setAttendeeListOpen(false);
                        if (attendee.userId === myUserId) {
                          setSelectedMeetId(null);
                          router.push("/profile");
                          return;
                        }
                        void handleMarkerPress(attendee.userId);
                      }}
                      style={({ pressed }) => [
                        styles.meetAttendeeRow,
                        pressed && { opacity: 0.84 },
                      ]}
                    >
                      {avatar.uri ? (
                        <Image
                          source={{ uri: avatar.uri }}
                          style={[
                            styles.meetAttendeeAvatar,
                            { borderColor: avatar.borderColor ?? colors.primary },
                          ]}
                        />
                      ) : (
                        <View
                          style={[
                            styles.meetAttendeeAvatar,
                            styles.meetAttendeeAvatarFallback,
                            { borderColor: avatar.borderColor ?? colors.primary },
                          ]}
                        >
                          <Text style={styles.meetAttendeeAvatarInitials}>
                            {avatar.initials}
                          </Text>
                        </View>
                      )}
                      <View style={styles.meetAttendeeTextWrap}>
                        <Text numberOfLines={1} style={styles.meetAttendeeName}>
                          {name}
                        </Text>
                        <Text numberOfLines={1} style={styles.meetAttendeeSubtitle}>
                          {subtitle}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={21}
                        color="#777"
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
      {selectedUserId && !selectedMeetId && (
        <View style={styles.publicProfileOverlay}>
          <View
            style={[
              styles.publicProfileFullCard,
              selectedProfile?.is_active_premium &&
              selectedProfile?.accent_color
                ? { borderColor: selectedProfile.accent_color }
                : null,
            ]}
          >
            <ScrollView
              style={styles.publicProfileFullScroll}
              contentContainerStyle={styles.publicProfileFullContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.publicProfileHero}>
                {publicProfileHeroUri ? (
                  <Image
                    source={{ uri: publicProfileHeroUri }}
                    style={styles.publicProfileHeroImage}
                  />
                ) : null}
                <View style={styles.publicProfileHeroScrim} />
                <Pressable
                  onPress={closeProfileCard}
                  style={styles.publicProfileCloseButton}
                >
                  <MaterialCommunityIcons name="close" size={22} color="#fff" />
                </Pressable>
              </View>

              <View style={styles.publicProfileHeaderBlock}>
                {selectedProfile?.photo_url ? (
                  <Image
                    source={{ uri: selectedProfile.photo_url }}
                    style={[
                      styles.publicProfileAvatar,
                      selectedProfile?.is_active_premium &&
                      selectedProfile?.accent_color
                        ? { borderColor: selectedProfile.accent_color }
                        : null,
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.publicProfileAvatar,
                      styles.publicProfileAvatarFallback,
                      selectedProfile?.is_active_premium &&
                      selectedProfile?.accent_color
                        ? { borderColor: selectedProfile.accent_color }
                        : null,
                    ]}
                  >
                    <Text style={styles.publicProfileAvatarInitials}>
                      {initials}
                    </Text>
                  </View>
                )}

                <View style={styles.publicProfileIdentityRow}>
                  <View style={styles.publicProfileNameWrap}>
                    <View style={styles.profileNameRow}>
                      <Text style={styles.publicProfileName}>
                        {displayName}
                      </Text>
                      {selectedProfile?.is_active_premium ? (
                        <View style={styles.premiumBadge}>
                          <Text style={styles.premiumBadgeText}>PREMIUM</Text>
                        </View>
                      ) : null}
                    </View>
                    {selectedProfile?.username ? (
                      <Text style={styles.publicProfileUsername}>
                        @{selectedProfile.username}
                      </Text>
                    ) : null}
                    {locationLabel ? (
                      <Text style={styles.publicProfileMeta}>
                        {locationLabel}
                      </Text>
                    ) : null}
                    {locationsById[selectedUserId]?.updated_at ? (
                      <Text style={styles.publicProfileMeta}>
                        Last seen{" "}
                        {formatLastSeen(
                          locationsById[selectedUserId]?.updated_at,
                        )}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {socialEntries.length > 0 ? (
                  <View style={styles.publicProfileSocialRow}>
                    {socialEntries.map((social) => (
                      <Pressable
                        key={social.key}
                        onPress={() => ExpoLinking.openURL(social.url)}
                        style={({ pressed }) => [
                          styles.publicProfileSocialButton,
                          pressed && { opacity: 0.82 },
                        ]}
                        accessibilityLabel={social.label}
                      >
                        <MaterialCommunityIcons
                          name={social.icon}
                          size={19}
                          color="#fff"
                        />
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {selectedProfile?.bio ? (
                  <Text style={styles.publicProfileBio}>
                    {selectedProfile.bio}
                  </Text>
                ) : (
                  <Text style={styles.publicProfileMutedText}>
                    No bio added.
                  </Text>
                )}

                {profileLoading ? (
                  <View style={styles.publicProfileLoadingRow}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : null}
                {profileError ? (
                  <Text style={styles.errorText}>{profileError}</Text>
                ) : null}

                {selectedUserId !== myUserId ? (
                  <View style={styles.publicProfileActionRow}>
                    {friendRelationshipState !== "friends" ? (
                      <Pressable
                        onPress={
                          friendRelationshipState === "none"
                            ? sendFriendRequest
                            : undefined
                        }
                        disabled={
                          sendingRequest ||
                          !!profileError ||
                          profileLoading ||
                          friendRelationshipState !== "none"
                        }
                        style={({ pressed }) => [
                          styles.publicProfileFriendButton,
                          friendRelationshipState !== "none" &&
                            styles.friendBtnDisabled,
                          (pressed || sendingRequest) && { opacity: 0.8 },
                        ]}
                      >
                        {sendingRequest ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <MaterialCommunityIcons
                              name={
                                friendRelationshipState === "request_sent"
                                  ? "clock-check-outline"
                                  : friendRelationshipState ===
                                      "request_received"
                                    ? "account-clock-outline"
                                    : "account-plus"
                              }
                              size={18}
                              color="#fff"
                            />
                            <Text style={styles.friendBtnText}>
                              {friendRelationshipState === "request_sent"
                                ? "Request Sent"
                                : friendRelationshipState === "request_received"
                                  ? "Respond"
                                  : "Send Friend Request"}
                            </Text>
                          </>
                        )}
                      </Pressable>
                    ) : (
                      <View style={styles.publicProfileFriendBadge}>
                        <MaterialCommunityIcons
                          name="account-check"
                          size={18}
                          color="#fff"
                        />
                        <Text style={styles.friendBadgeText}>Friends</Text>
                      </View>
                    )}
                    <Pressable
                      onPress={toggleBlockUser}
                      disabled={blockActionLoading || profileLoading}
                      style={({ pressed }) => [
                        styles.publicProfileFriendButton,
                        { backgroundColor: "#3a3a3a" },
                        (pressed || blockActionLoading) && { opacity: 0.8 },
                      ]}
                    >
                      {blockActionLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <MaterialCommunityIcons
                            name={blockedUserIds.includes(selectedUserId) ? "account-check" : "account-cancel"}
                            size={18}
                            color="#fff"
                          />
                          <Text style={styles.friendBtnText}>
                            {blockedUserIds.includes(selectedUserId) ? "Unblock" : "Block"}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                ) : null}
              </View>

              <View style={styles.publicProfileTabsRow}>
                <View style={styles.publicProfileTabActive}>
                  <MaterialCommunityIcons
                    name="car-sports"
                    size={19}
                    color="#ef4444"
                  />
                  <Text style={styles.publicProfileTabActiveText}>Cars</Text>
                </View>
                <View style={styles.publicProfileTab}>
                  <MaterialCommunityIcons
                    name="calendar-blank-outline"
                    size={19}
                    color="#bcbcbc"
                  />
                  <Text style={styles.publicProfileTabText}>Meets</Text>
                </View>
              </View>

              <View style={styles.publicProfileCarsList}>
                {!hasCars ? (
                  <Text style={styles.publicProfileMutedText}>
                    No cars listed.
                  </Text>
                ) : (
                  selectedUserCars.map((car) => {
                    const title = [car.year, car.make, car.model]
                      .filter(Boolean)
                      .join(" ");
                    const subtitle = [car.color, car.trim]
                      .filter(Boolean)
                      .join(" � ");
                    return (
                      <View key={car.id} style={styles.publicProfileCarCard}>
                        {car.photo_url ? (
                          <Image
                            source={{ uri: car.photo_url }}
                            style={styles.publicProfileCarImage}
                          />
                        ) : (
                          <View
                            style={[
                              styles.publicProfileCarImage,
                              styles.carPhotoFallback,
                            ]}
                          >
                            <Text style={styles.carPhotoFallbackText}>
                              No Photo
                            </Text>
                          </View>
                        )}
                        <View style={styles.publicProfileCarBody}>
                          <View style={styles.carNameRow}>
                            <Text style={styles.publicProfileCarTitle}>
                              {title || "Unknown car"}
                            </Text>
                            {car.is_primary ? (
                              <Text style={styles.primaryTag}>Primary</Text>
                            ) : null}
                          </View>
                          {subtitle ? (
                            <Text style={styles.publicProfileCarMeta}>
                              {subtitle}
                            </Text>
                          ) : null}
                          {car.description ? (
                            <Text style={styles.publicProfileCarDescription}>
                              {car.description}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}
