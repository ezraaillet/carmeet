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

import { colors } from "@/styles/themes";
import styles from "@/styles/mapstyles";
import { supabase } from "../database/supabase";
import { useFocusEffect } from "@react-navigation/native";
import { useMapData } from "@/components/MapDataProvider";

const MARKER_JITTER_THRESHOLD_METERS = 2;
const MARKER_SNAP_THRESHOLD_METERS = 350;
const MARKER_ANIMATION_DURATION_MS = 900;
const OVERLAP_THRESHOLD_METERS = 1.5;
const OVERLAP_SPREAD_RADIUS_METERS = 7;
const CLUSTER_MIN_SIZE = 4;
const CLUSTER_MAX_ZOOM_LATITUDE_DELTA = 0.012;
const DEFAULT_MARKER_BORDER_COLOR = colors.primary;

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
      ref={(marker) => onRef(userId, marker)}
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 0.5 }}
      title={title}
      description={description}
      zIndex={zIndex}
      onPress={() => onPress(userId)}
      tracksViewChanges={tracksViewChanges}
      stopPropagation
    >
      {markerUri ? (
        <Image
          source={{ uri: markerUri }}
          style={[
            styles.icon,
            { opacity: fresh ? 1 : 0.45, borderColor: markerBorderColor },
          ]}
        />
      ) : (
        <View
          style={[
            styles.iconInitials,
            { opacity: fresh ? 1 : 0.45, borderColor: markerBorderColor },
          ]}
        >
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
  const params = useLocalSearchParams<{ focusMeetId?: string; latitude?: string; longitude?: string }>();
  const hasRequestedMeetTarget = useMemo(() => {
    const hasMeetId = typeof params.focusMeetId === "string" && params.focusMeetId.length > 0;
    const latitude = Number(params.latitude);
    const longitude = Number(params.longitude);
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
    return hasMeetId || hasCoordinates;
  }, [params.focusMeetId, params.latitude, params.longitude]);
  const mapRef = useRef<MapView | null>(null);
  const { height: screenHeight } = useWindowDimensions();
  const profileCardMaxHeight = Math.min(screenHeight * 0.78, 640);
  const collapsedSheetHeight = Math.round(screenHeight * 0.33);
  const expandedSheetHeight = Math.round(screenHeight * 0.76);
  const sheetHeightAnim = useRef(new Animated.Value(collapsedSheetHeight)).current;
  const sheetDragStartHeightRef = useRef(collapsedSheetHeight);

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

      (async () => {
        try {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.BestForNavigation,
          });

          if (cancelled) return;

          const uid =
            myUserId ?? (await getCurrentAuthUser())?.id ?? null;
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

          if (!hasRequestedMeetTarget) {
            mapRef.current?.animateCamera({
              center: {
                latitude: current.coords.latitude,
                longitude: current.coords.longitude,
              },
              zoom: 15,
            });
          }

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

  const sourceLocations = useMemo(
    () => Object.values(locationsById),
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

  const mapMarkers = useMemo(() => {
    const nearbyThresholdMeters = Math.max(
      20,
      Math.min(120, 40 * (region.latitudeDelta / 0.05))
    );
    // Always derive marker output from the full live-location dataset.
    // Profile availability only changes marker presentation, never inclusion.
    const baseLocations = sourceLocations;

    const visited = new Set<string>();
    const groups: LiveLoc[][] = [];

    for (const loc of baseLocations) {
      if (visited.has(loc.user_id)) continue;

      const queue: LiveLoc[] = [loc];
      const group: LiveLoc[] = [];
      visited.add(loc.user_id);

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;

        group.push(current);

        baseLocations.forEach((candidate) => {
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
          members: { userId: string; latitude: number; longitude: number }[];
        }
    )[] = [];

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

      const overlapVisited = new Set<string>();
      const overlapGroups: LiveLoc[][] = [];

      group.forEach((loc) => {
        if (overlapVisited.has(loc.user_id)) return;

        const overlapMembers = group.filter(
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
    });

    return renderedMarkers;
  }, [region.latitudeDelta, shouldShowClusters, sourceLocations]);


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
      .filter((item): item is { type: "user"; loc: LiveLoc; adjLat: number; adjLng: number } => item.type === "user")
      .map((item) => item.loc.user_id);

    const renderedClusterMemberIds = mapMarkers
      .filter((item): item is {
        type: "cluster";
        key: string;
        lat: number;
        lng: number;
        count: number;
        members: { userId: string; latitude: number; longitude: number }[];
      } => item.type === "cluster")
      .flatMap((item) => item.members.map((member) => member.userId));

    const allRenderedIds = new Set([
      ...renderedUserIds,
      ...renderedClusterMemberIds,
    ]);

    console.log("[Map][ClusterThreshold] render-snapshot", {
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
    mapMarkers,
    region.latitudeDelta,
    shouldShowClusters,
    sourceLocations,
  ]);

  const handleRegionChangeComplete = useCallback(
    (nextRegion: Region) => {
      setRegion(nextRegion);
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

    mapRef.current?.animateToRegion(
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
        {meetMarkers.map((meet) => (
          <Marker
            key={`meet-${meet.id}`}
            coordinate={{ latitude: meet.latitude, longitude: meet.longitude }}
            title={meet.title || "Meet"}
            description={meet.location_name || "Car meet"}
            zIndex={400}
            onPress={() => {
              closeProfileCard();
              setSelectedMeetId(meet.id);
            }}
          >
            <View style={styles.meetMarkerWrap}>
              <Text style={styles.meetMarkerIcon}>📍</Text>
            </View>
          </Marker>
        ))}

        {mapMarkers.map((item) => {
          if (item.type === "cluster") {
            return (
              <Marker
                key={`cluster-mode-${clusterModeVersion}-${item.key}`}
                coordinate={{ latitude: item.lat, longitude: item.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                title="Nearby group"
                description={`${item.count} people nearby`}
                zIndex={1000}
                onPress={() => {
                  closeProfileCard();
                  setSelectedMeetId(null);
                  setFocusedClusterKey(item.key);
                  mapRef.current?.fitToCoordinates(
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
                }}
              >
                <View style={styles.clusterBubble}>
                  <Text style={styles.clusterBubbleText}>{item.count}</Text>
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
          const markerBorderColor =
            p?.is_active_premium && p?.accent_color
              ? p.accent_color
              : DEFAULT_MARKER_BORDER_COLOR;

          const animatedCoordinate = getOrCreateAnimatedUserCoordinate(
            loc.user_id,
            adjLat,
            adjLng
          );

          return (
            <AnimatedUserMarker
              key={`user-mode-${clusterModeVersion}-${loc.user_id}`}
              userId={loc.user_id}
              zIndex={loc.user_id === myUserId ? 1100 : 900}
              coordinate={animatedCoordinate}
              title={markerName}
              description={fresh ? "Live" : `Last seen ${lastSeen}`}
              fresh={fresh}
              markerUri={markerUri}
              markerInitials={markerInitials}
              markerBorderColor={markerBorderColor}
              onPress={handleMarkerPress}
              onRef={(userId, marker) => {
                markerRefs.current[userId] = marker;
              }}
            />
          );
        })}
      </MapView>

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
          <TextInput
            value={meetSearchQuery}
            onChangeText={setMeetSearchQuery}
            placeholder="Search upcoming meets"
            placeholderTextColor="#8a8a8a"
            style={styles.meetsSearchInput}
          />
          <View pointerEvents="none" style={styles.meetsSearchIconWrap}>
            <Text style={styles.meetsSearchIcon}>⌕</Text>
          </View>
          <ScrollView
            style={styles.meetsListScroll}
            contentContainerStyle={styles.meetsListContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredMeetMarkers.map((meet) => {
              const when = formatMeetWhen(meet.start_time, meet.end_time);
              const day = meet.start_time ? new Date(meet.start_time) : null;
              const dateTop = day && Number.isFinite(day.getTime()) ? String(day.getDate()).padStart(2, "0") : "--";
              const dateBottom = day && Number.isFinite(day.getTime()) ? day.toLocaleString(undefined, { month: "short" }) : "TBD";
              const goingCount = meetAttendeeSummaryByMeetId[meet.id]?.going ?? 0;
              const interestedCount = meetAttendeeSummaryByMeetId[meet.id]?.interested ?? 0;
              return (
                <Pressable
                  key={`sheet-meet-${meet.id}`}
                  onPress={() => {
                    setSelectedMeetId(meet.id);
                    mapRef.current?.animateCamera({
                      center: { latitude: meet.latitude, longitude: meet.longitude },
                      zoom: 14,
                    });
                  }}
                  style={({ pressed }) => [styles.meetRowCard, pressed && { opacity: 0.88 }]}
                >
                  <View style={styles.meetLeftColumn}>
                    <View style={styles.meetDateBlock}>
                      <Text style={styles.meetDateDay}>{dateTop}</Text>
                      <Text style={styles.meetDateMonth}>{dateBottom}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.meetDateTime}>{when}</Text>
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
                      {formatMeetStatus(meet.status)}
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
