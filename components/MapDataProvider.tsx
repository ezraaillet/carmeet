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
  location_visibility?: string | null;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  onboarded?: boolean | null;
  membership_plan?: string | null;
  membership_status?: string | null;
  accent_color?: string | null;
  is_active_premium?: boolean;
};

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
};

type MapDataState = {
  loading: boolean;
  error: string | null;
  myUserId: string | null;
  friendIds: string[];
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

export function MapDataProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<string[]>([]);
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

  const fetchNearbyUserIds = useCallback(
    async (myLat: number, myLng: number, radiusMeters = 1609.34) => {
      const deltaLat = radiusMeters / 111_111;
      const deltaLng =
        radiusMeters / (111_111 * Math.cos((myLat * Math.PI) / 180));

      const minLat = myLat - deltaLat;
      const maxLat = myLat + deltaLat;
      const minLng = myLng - deltaLng;
      const maxLng = myLng + deltaLng;

      const { data, error } = await supabase
        .from("locations")
        .select("user_id, lat, lng")
        .gte("lat", minLat)
        .lte("lat", maxLat)
        .gte("lng", minLng)
        .lte("lng", maxLng);

      if (error) throw error;

      return (data ?? [])
        .filter(
          (r) => metersBetween(myLat, myLng, r.lat, r.lng) <= radiusMeters
        )
        .map((r) => r.user_id);
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
            acc[meetId] = { going: 0 };
          }

          if (status === "going") {
            acc[meetId].going += 1;
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
      const loadForIds = async (idsToLoad: string[]) => {
        if (!idsToLoad.length) return;

        const uniq = Array.from(new Set(idsToLoad));

        const [
          { data: locRows, error: locErr },
          { data: profRows, error: profErr },
          { data: membershipRows, error: membershipErr },
          { data: customizationRows, error: customizationErr },
        ] = await Promise.all([
          supabase.from("locations").select("*").in("user_id", uniq),
          supabase
            .from("profiles")
            .select(
              "id, username, display_name, photo_url, location_visibility, bio, city, state, onboarded"
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

        if (locErr) throw locErr;
        if (profErr) throw profErr;
        if (membershipErr) throw membershipErr;
        if (customizationErr) throw customizationErr;
        if (refreshSeqRef.current !== requestId) return;

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
        (profRows ?? []).forEach((p: any) => {
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

        (profRows ?? [])
          .map((p: any) => p.photo_url as string | null)
          .filter(Boolean)
          .forEach((uri) => Image.prefetch(uri!));

        const locMap: Record<string, LiveLoc> = {};
        (locRows ?? []).forEach((l: any) => (locMap[l.user_id] = l as LiveLoc));
        setLocationsById((prev) => ({ ...prev, ...locMap }));
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
          setFriendIds([]);
          setIds([]);
          setProfilesById({});
          setLocationsById({});
          setMeets([]);
          setMyMeetAttendanceByMeetId({});
          setMeetAttendeeSummaryByMeetId({});
        }

        if (!uid) {
          setFriendIds([]);
          return;
        }

        const friendIds = await fetchFriendIds(uid);
        if (refreshSeqRef.current !== requestId || currentUserIdRef.current !== uid) return;
        setFriendIds(friendIds);
        const baseIds = Array.from(new Set([uid, ...friendIds]));
        setIds(baseIds);

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

                setLocationsById((prev) => ({ ...prev, [row.user_id]: row }));

                const { data: p } = await supabase
                  .from("profiles")
                  .select(
                    "id, username, display_name, photo_url, location_visibility, bio, city, state, onboarded"
                  )
                  .eq("id", row.user_id)
                  .maybeSingle<Profile>();

                if (p) {
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

          const nearbyIds = await fetchNearbyUserIds(myLat, myLng, 1609.34);
          if (refreshSeqRef.current !== requestId || currentUserIdRef.current !== uid) return;
          const combined = Array.from(new Set([...baseIds, ...nearbyIds]));
          setIds(combined);

          const missing = combined.filter((id) => !baseIds.includes(id));
          await loadForIds(missing);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load map data.");
      } finally {
        setLoading(false);
      }
    },
    [fetchFriendIds, fetchMeets, fetchNearbyUserIds]
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
      error,
      myUserId,
      friendIds,
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
      error,
      myUserId,
      friendIds,
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
