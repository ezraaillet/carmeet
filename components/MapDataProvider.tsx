import * as Location from "expo-location";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { Image } from "react-native";
import { supabase } from "../database/supabase";

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
  profile_visibility?: string | null;
  location_visibility?: string | null;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  instagram_handle?: string | null;
  tiktok_handle?: string | null;
  twitter_handle?: string | null;
  snapchat_handle?: string | null;
  onboarded?: boolean | null;
  membership_plan?: string | null;
  membership_status?: string | null;
  accent_color?: string | null;
  is_active_premium?: boolean;
};

export const PUBLIC_DISCOVERY_RADIUS_METERS = 100;

type Meet = {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  location_name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  start_time: string;
  end_time: string | null;
  created_by: string;
  is_public: boolean;
  max_attendees: number | null;
  status: "upcoming" | "cancelled" | "completed";
  created_at: string;
  updated_at: string;
};

type MeetAttendance = {
  id: string;
  meet_id: string;
  user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type MeetAttendeeSummary = {
  going: number;
  interested: number;
};

type MapDataState = {
  loading: boolean;
  friendsLoaded: boolean;
  error: string | null;
  myUserId: string | null;
  friendIds: string[];
  blockedUserIds: string[];
  ids: string[];
  profilesById: Record<string, Profile>;
  locationsById: Record<string, LiveLoc>;
  meets: Meet[];
  myMeetAttendanceByMeetId: Record<string, string>;
  meetAttendeeSummaryByMeetId: Record<string, MeetAttendeeSummary>;
  refresh: (uidOverride?: string | null) => Promise<void>;
  refreshMeets: (uidOverride?: string | null) => Promise<void>;
  setMyLiveLocation: (loc: LiveLoc) => void;
};

const MapDataContext = createContext<MapDataState | null>(null);

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;

  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(x));
}

function dedupeMeets(rows: Meet[]) {
  const map = new Map<string, Meet>();
  rows.forEach((row) => {
    if (!row?.id) return;
    map.set(row.id, row);
  });

  return Array.from(map.values()).sort((a, b) => {
    const aTime = a.start_time ? new Date(a.start_time).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.start_time ? new Date(b.start_time).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });
}

function isPubliclyDiscoverableProfile(profile: Profile | null | undefined) {
  if (!profile) return false;

  const locationVisibility = (profile.location_visibility ?? "everyone").toLowerCase();
  const profileVisibility = (profile.profile_visibility ?? "public").toLowerCase();

  return (
    locationVisibility === "everyone" &&
    (profileVisibility === "public" || profileVisibility === "everyone")
  );
}

export function MapDataProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
  const [locationsById, setLocationsById] = useState<Record<string, LiveLoc>>(
    {}
  );
  const [meets, setMeets] = useState<Meet[]>([]);
  const [myMeetAttendanceByMeetId, setMyMeetAttendanceByMeetId] = useState<
    Record<string, string>
  >({});
  const [meetAttendeeSummaryByMeetId, setMeetAttendeeSummaryByMeetId] = useState<
    Record<string, MeetAttendeeSummary>
  >({});
  const currentUserIdRef = useRef<string | null>(null);
  const currentUserLocationRef = useRef<LiveLoc | null>(null);
  const refreshSeqRef = useRef(0);

  const didSubscribeRef = useRef(false);
  const didSubscribeMeetsRef = useRef(false);

  const fetchFriendIds = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("friendships")
      .select("user_id, friend_id, status")
      .eq("status", "accepted")
      .or(`user_id.eq.${uid},friend_id.eq.${uid}`);

    if (error) throw error;

    const rows = (data ?? []) as {
      user_id: string | null;
      friend_id: string | null;
      status: string;
    }[];

    return Array.from(
      new Set(
        rows
          .map((r) => (r.user_id === uid ? r.friend_id : r.user_id))
          .filter((id): id is string => Boolean(id))
      )
    );
  }, []);

  const fetchBlockedUserIds = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("user_blocks")
      .select("blocked_id")
      .eq("blocker_id", uid);
    if (error) throw error;
    return (data ?? [])
      .map((row) => row.blocked_id)
      .filter((id): id is string => Boolean(id));
  }, []);

  const fetchNearbyPublicLocations = useCallback(
    async (myLat: number, myLng: number, radiusMeters = PUBLIC_DISCOVERY_RADIUS_METERS) => {
      const { data, error } = await supabase.rpc("get_nearby_public_locations", {
        p_lat: myLat,
        p_lng: myLng,
        p_radius_m: radiusMeters,
      });

      if (error) throw error;

      return (data ?? []) as LiveLoc[];
    },
    []
  );

  const fetchMeets = useCallback(async (uid: string) => {
    const meetColumns =
      "id, title, description, cover_image_url, location_name, address, latitude, longitude, start_time, end_time, created_by, is_public, max_attendees, status, created_at, updated_at";

    const [{ data: membershipRows, error: membershipError }, baseMeets] = await Promise.all([
      supabase
        .from("meet_attendees")
        .select("id, meet_id, user_id, status, created_at, updated_at")
        .eq("user_id", uid),
      (async () => {
        const { data, error } = await supabase
          .from("meets")
          .select(meetColumns)
          .or(`is_public.eq.true,created_by.eq.${uid}`)
          .order("start_time", { ascending: true })
          .limit(100);
        if (error) throw error;
        return (data ?? []) as Meet[];
      })(),
    ]);

    if (membershipError) throw membershipError;

    const myMemberships = (membershipRows ?? []) as MeetAttendance[];
    const myMeetAttendance = myMemberships.reduce<Record<string, string>>((acc, row) => {
      acc[row.meet_id] = row.status;
      return acc;
    }, {});

    const meetIdsFromMembership = Array.from(
      new Set(myMemberships.map((row) => row.meet_id).filter(Boolean))
    );

    let extraMeets: Meet[] = [];
    if (meetIdsFromMembership.length > 0) {
      const { data, error } = await supabase
        .from("meets")
        .select(meetColumns)
        .in("id", meetIdsFromMembership);
      if (error) throw error;
      extraMeets = (data ?? []) as Meet[];
    }

    const mergedMeets = dedupeMeets([...(baseMeets ?? []), ...extraMeets] as Meet[]);
    const mergedMeetIds = mergedMeets.map((meet) => meet.id);

    let summaryByMeetId: Record<string, MeetAttendeeSummary> = {};

    if (mergedMeetIds.length > 0) {
      const { data: attendeeRows, error: attendeeError } = await supabase
        .from("meet_attendees")
        .select("meet_id, status")
        .in("meet_id", mergedMeetIds);

      if (attendeeError) throw attendeeError;

      summaryByMeetId = (attendeeRows ?? []).reduce<Record<string, MeetAttendeeSummary>>(
        (acc, row) => {
          const meetId = row.meet_id;
          const status = (row.status ?? "").toLowerCase();

          if (!acc[meetId]) {
            acc[meetId] = { going: 0, interested: 0 };
          }

          if (status === "going") {
            acc[meetId].going += 1;
          } else if (status === "interested") {
            acc[meetId].interested += 1;
          }

          return acc;
        },
        {}
      );
    }

    setMeets(mergedMeets);
    setMyMeetAttendanceByMeetId(myMeetAttendance);
    setMeetAttendeeSummaryByMeetId(summaryByMeetId);
  }, []);

  const refresh = useCallback(
    async (uidOverride?: string | null) => {
      const requestId = ++refreshSeqRef.current;
        const loadForIds = async (
          idsToLoad: string[],
          options: { loadLocations?: boolean } = {},
        ) => {
          if (!idsToLoad.length) return;

          const uniq = Array.from(new Set(idsToLoad));
          const loadLocations = options.loadLocations ?? true;

          let locRows: LiveLoc[] = [];
          if (loadLocations) {
            const { data, error: locErr } = await supabase
              .from("locations")
              .select("*")
              .in("user_id", uniq);

            if (locErr) throw locErr;
            locRows = (data ?? []) as LiveLoc[];
          }

        if (refreshSeqRef.current !== requestId) return;

        const locMap: Record<string, LiveLoc> = {};
        locRows.forEach((l) => (locMap[l.user_id] = l));
        if (loadLocations) {
          setLocationsById((prev) => {
            const next = { ...prev };
            uniq.forEach((id) => {
              if (!locMap[id]) delete next[id];
            });
            return { ...next, ...locMap };
          });
        }
        const activeUid = currentUserIdRef.current;
        if (activeUid && locMap[activeUid]) {
          currentUserLocationRef.current = locMap[activeUid];
        }

        const locationIds = Object.keys(locMap);
        console.log("[MapData] loadForIds locations", {
          requestedCount: uniq.length,
          requestedIds: uniq,
          locationCount: locationIds.length,
          locationIds,
          missingLocationIds: uniq.filter((id) => !locMap[id]),
        });

        const [profileResult, membershipResult, customizationResult] = await Promise.all([
          supabase
            .from("profiles")
            .select(
              "id, username, display_name, photo_url, profile_visibility, location_visibility, bio, city, state, instagram_handle, tiktok_handle, twitter_handle, snapchat_handle, onboarded"
            )
            .in("id", uniq),
          supabase
            .from("user_memberships")
            .select("user_id, plan, status")
            .in("user_id", uniq),
          supabase
            .from("profile_customizations")
            .select("user_id, accent_color")
            .in("user_id", uniq),
        ]);

        if (refreshSeqRef.current !== requestId) return;

        if (profileResult.error) {
          console.warn("[MapData] profile load failed; keeping location markers visible", {
            requestedIds: uniq,
            message: profileResult.error.message,
          });
          return;
        }

        if (membershipResult.error) {
          console.warn("[MapData] membership load failed; using marker fallbacks", {
            requestedIds: uniq,
            message: membershipResult.error.message,
          });
        }

        if (customizationResult.error) {
          console.warn("[MapData] customization load failed; using marker fallbacks", {
            requestedIds: uniq,
            message: customizationResult.error.message,
          });
        }

        const membershipRows = membershipResult.error ? [] : membershipResult.data;
        const customizationRows = customizationResult.error ? [] : customizationResult.data;
        const profRows = profileResult.data ?? [];

        const membershipByUserId = new Map<
          string,
          { plan: string | null; status: string | null }
        >();
        (membershipRows ?? []).forEach((row: any) => {
          membershipByUserId.set(row.user_id, {
            plan: row.plan ?? null,
            status: row.status ?? null,
          });
        });

        const customizationByUserId = new Map<string, string | null>();
        (customizationRows ?? []).forEach((row: any) => {
          customizationByUserId.set(row.user_id, row.accent_color ?? null);
        });

        const profMap: Record<string, Profile> = {};
        profRows.forEach((p: any) => {
          const membership = membershipByUserId.get(p.id);
          const accentColor = customizationByUserId.get(p.id) ?? null;
          const plan = membership?.plan ?? null;
          const status = membership?.status ?? null;

          profMap[p.id] = {
            ...(p as Profile),
            membership_plan: plan,
            membership_status: status,
            accent_color: accentColor,
            is_active_premium: plan === "premium" && status === "active",
          };
        });
        setProfilesById((prev) => ({ ...prev, ...profMap }));

        profRows
          .map((p: any) => p.photo_url as string | null)
          .filter(Boolean)
          .forEach((uri) => Image.prefetch(uri!));

        const profileIds = Object.keys(profMap);
        console.log("[MapData] loadForIds profiles", {
          requestedCount: uniq.length,
          requestedIds: uniq,
          profileCount: profileIds.length,
          profileIds,
          missingProfileIds: uniq.filter((id) => !profMap[id]),
          locationIds,
        });
      };

      try {
        setLoading(true);
        setError(null);

        let uid = uidOverride ?? null;

        if (!uid) {
          const { data: auth } = await supabase.auth.getUser();
          uid = auth.user?.id ?? null;
        }

        if (refreshSeqRef.current !== requestId) return;

        const previousUid = currentUserIdRef.current;
        setMyUserId(uid);
        currentUserIdRef.current = uid;

        if (previousUid !== uid) {
          setFriendsLoaded(false);
          setFriendIds([]);
          setBlockedUserIds([]);
          setIds([]);
          setProfilesById({});
          setLocationsById({});
          setMeets([]);
          setMyMeetAttendanceByMeetId({});
          setMeetAttendeeSummaryByMeetId({});
        }

        if (!uid) {
          setFriendsLoaded(false);
          setFriendIds([]);
          return;
        }

        setFriendsLoaded(false);
        const [friendIds, blockedUserIds] = await Promise.all([
          fetchFriendIds(uid),
          fetchBlockedUserIds(uid),
        ]);
        if (refreshSeqRef.current !== requestId || currentUserIdRef.current !== uid) return;
        console.log("[MapData] accepted friends", {
          acceptedFriendCount: friendIds.length,
          friendIds,
        });
        const blockedIdSet = new Set(blockedUserIds);
        const visibleFriendIds = friendIds.filter((id) => !blockedIdSet.has(id));
        setBlockedUserIds(blockedUserIds);
        setFriendIds(visibleFriendIds);
        setLocationsById((previous) => {
          const next = { ...previous };
          blockedUserIds.forEach((id) => delete next[id]);
          return next;
        });
        setProfilesById((previous) => {
          const next = { ...previous };
          blockedUserIds.forEach((id) => delete next[id]);
          return next;
        });
        setFriendsLoaded(true);
        const baseIds = Array.from(new Set([uid, ...visibleFriendIds]));
        const baseIdSet = new Set(baseIds);
        setIds(baseIds);

        const loadNearbyPublicUsers = async (lat: number, lng: number) => {
          const nearbyLocations = await fetchNearbyPublicLocations(
            lat,
            lng,
            PUBLIC_DISCOVERY_RADIUS_METERS,
          );
          if (refreshSeqRef.current !== requestId || currentUserIdRef.current !== uid) return;

          const visibleNearbyLocations = nearbyLocations.filter(
            (location) => !blockedIdSet.has(location.user_id),
          );
          const nearbyIds = visibleNearbyLocations.map(
            (location) => location.user_id,
          );
          const combined = Array.from(new Set([...baseIds, ...nearbyIds]));
          setIds(combined);

          setLocationsById((previous) => {
            const next = { ...previous };
            visibleNearbyLocations.forEach((location) => {
              next[location.user_id] = location;
            });
            return next;
          });

          const missing = combined.filter((id) => !baseIdSet.has(id));
          await loadForIds(missing, { loadLocations: false });
        };

        await Promise.all([loadForIds(baseIds), fetchMeets(uid)]);
        if (refreshSeqRef.current !== requestId || currentUserIdRef.current !== uid) return;

        if (!didSubscribeRef.current) {
          didSubscribeRef.current = true;

          const channel = supabase
            .channel("public:locations")
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "locations" },
              async (payload) => {
                const row = payload.new as LiveLoc;
                if (!row?.user_id || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return;

                const activeUid = currentUserIdRef.current;
                if (!activeUid) return;

                const isSelf = row.user_id === activeUid;
                const isFriend = friendIds.includes(row.user_id);
                const myLocation = isSelf ? row : currentUserLocationRef.current;

                if (isSelf) {
                  currentUserLocationRef.current = row;
                } else if (!isFriend) {
                  if (!myLocation) return;

                  const distanceFromMe = metersBetween(myLocation.lat, myLocation.lng, row.lat, row.lng);
                  if (distanceFromMe > PUBLIC_DISCOVERY_RADIUS_METERS) {
                    setLocationsById((prev) => {
                      const next = { ...prev };
                      delete next[row.user_id];
                      return next;
                    });
                    setProfilesById((prev) => {
                      const next = { ...prev };
                      delete next[row.user_id];
                      return next;
                    });
                    return;
                  }
                }

                setLocationsById((prev) => ({ ...prev, [row.user_id]: row }));

                if (isSelf) {
                  void loadNearbyPublicUsers(row.lat, row.lng);
                  return;
                }

                const { data: p } = await supabase
                  .from("profiles")
                  .select(
                    "id, username, display_name, photo_url, profile_visibility, location_visibility, bio, city, state, instagram_handle, tiktok_handle, twitter_handle, snapchat_handle, onboarded"
                  )
                  .eq("id", row.user_id)
                  .maybeSingle<Profile>();

                if (p) {
                  if (!isFriend && !isPubliclyDiscoverableProfile(p)) {
                    setLocationsById((prev) => {
                      const next = { ...prev };
                      delete next[row.user_id];
                      return next;
                    });
                    setProfilesById((prev) => {
                      const next = { ...prev };
                      delete next[row.user_id];
                      return next;
                    });
                    return;
                  }

                  const [{ data: membership }, { data: customization }] = await Promise.all([
                    supabase
                      .from("user_memberships")
                      .select("plan, status")
                      .eq("user_id", p.id)
                      .maybeSingle<{ plan: string | null; status: string | null }>(),
                    supabase
                      .from("profile_customizations")
                      .select("accent_color")
                      .eq("user_id", p.id)
                      .maybeSingle<{ accent_color: string | null }>(),
                  ]);

                  const plan = membership?.plan ?? null;
                  const status = membership?.status ?? null;
                  const enrichedProfile: Profile = {
                    ...p,
                    membership_plan: plan,
                    membership_status: status,
                    accent_color: customization?.accent_color ?? null,
                    is_active_premium: plan === "premium" && status === "active",
                  };

                  setProfilesById((prev) => ({ ...prev, [p.id]: enrichedProfile }));
                  if (p.photo_url) Image.prefetch(p.photo_url);
                }
              }
            )
            .subscribe();

          void channel;
        }

        if (!didSubscribeMeetsRef.current) {
          didSubscribeMeetsRef.current = true;

          const meetsChannel = supabase
            .channel("public:meets-watch")
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "meets" },
              () => {
                const activeUid = currentUserIdRef.current;
                if (!activeUid) return;
                void fetchMeets(activeUid);
              }
            )
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "meet_attendees" },
              (payload) => {
                const activeUid = currentUserIdRef.current;
                if (!activeUid) return;
                const next = payload.new as { user_id?: string | null } | null;
                const prev = payload.old as { user_id?: string | null } | null;
                if (next?.user_id === activeUid || prev?.user_id === activeUid) {
                  void fetchMeets(activeUid);
                }
              }
            )
            .subscribe();

          void meetsChannel;
        }

        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status === Location.PermissionStatus.GRANTED) {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

          const myLat = pos.coords.latitude;
          const myLng = pos.coords.longitude;

          currentUserLocationRef.current = {
            user_id: uid,
            lat: myLat,
            lng: myLng,
            heading: pos.coords.heading ?? undefined,
            speed: pos.coords.speed ?? undefined,
            updated_at: new Date().toISOString(),
          };
          await loadNearbyPublicUsers(myLat, myLng);
        }
      } catch (e: any) {
        setFriendsLoaded(false);
        setError(e?.message ?? "Failed to load map data.");
      } finally {
        setLoading(false);
      }
    },
    [fetchBlockedUserIds, fetchFriendIds, fetchMeets, fetchNearbyPublicLocations]
  );

  const refreshMeets = useCallback(
    async (uidOverride?: string | null) => {
      const uid = uidOverride ?? currentUserIdRef.current;
      if (!uid) {
        setMeets([]);
        setMyMeetAttendanceByMeetId({});
        setMeetAttendeeSummaryByMeetId({});
        return;
      }

      currentUserIdRef.current = uid;
      await fetchMeets(uid);
    },
    [fetchMeets]
  );

  const setMyLiveLocation = useCallback((loc: LiveLoc) => {
    setLocationsById((prev) => ({ ...prev, [loc.user_id]: loc }));
  }, []);

  const value = useMemo(
    () => ({
      loading,
      friendsLoaded,
      error,
      myUserId,
      friendIds,
      blockedUserIds,
      ids,
      profilesById,
      locationsById,
      meets,
      myMeetAttendanceByMeetId,
      meetAttendeeSummaryByMeetId,
      refresh,
      refreshMeets,
      setMyLiveLocation,
    }),
    [
      loading,
      friendsLoaded,
      error,
      myUserId,
      friendIds,
      blockedUserIds,
      ids,
      profilesById,
      locationsById,
      meets,
      myMeetAttendanceByMeetId,
      meetAttendeeSummaryByMeetId,
      refresh,
      refreshMeets,
      setMyLiveLocation,
    ]
  );

  return (
    <MapDataContext.Provider value={value}>{children}</MapDataContext.Provider>
  );
}

export function useMapData() {
  const ctx = useContext(MapDataContext);
  if (!ctx) throw new Error("useMapData must be used within MapDataProvider");
  return ctx;
}
