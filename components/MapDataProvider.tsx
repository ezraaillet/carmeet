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
};

type MapDataState = {
  loading: boolean;
  error: string | null;
  myUserId: string | null;
  ids: string[];
  profilesById: Record<string, Profile>;
  locationsById: Record<string, LiveLoc>;
  refresh: (uidOverride?: string | null) => Promise<void>;
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

export function MapDataProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, Profile>>({});
  const [locationsById, setLocationsById] = useState<Record<string, LiveLoc>>(
    {}
  );

  const didSubscribeRef = useRef(false);

  const fetchFriendIds = useCallback(async (uid: string) => {
    // Pull accepted friendships where I’m either side
    const { data, error } = await supabase
      .from("friendships")
      .select("user_id, friend_id, status")
      .eq("status", "accepted")
      .or(`user_id.eq.${uid},friend_id.eq.${uid}`);

    console.log("friends rows:", data?.length, "friend err:", error?.message);

    if (error) throw error;

    const rows = (data ?? []) as Array<{
      user_id: string;
      friend_id: string;
      status: string;
    }>;

    // Return the "other person" for each row
    return rows.map((r) => (r.user_id === uid ? r.friend_id : r.user_id));
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
      console.log("data: ", data);
      return (data ?? [])
        .filter(
          (r) => metersBetween(myLat, myLng, r.lat, r.lng) <= radiusMeters
        )
        .map((r) => r.user_id);
    },
    []
  );

  const refresh = useCallback(
    async (uidOverride?: string | null) => {
      // helper: load profiles + locations for a set of ids and merge into state
      const loadForIds = async (idsToLoad: string[]) => {
        if (!idsToLoad.length) return;

        const uniq = Array.from(new Set(idsToLoad));

        const [
          { data: locRows, error: locErr },
          { data: profRows, error: profErr },
        ] = await Promise.all([
          supabase.from("locations").select("*").in("user_id", uniq),
          supabase
            .from("profiles")
            .select(
              "id, username, display_name, photo_url, location_visibility"
            )
            .in("id", uniq),
        ]);

        console.log("loc rows:", locRows?.length, "locErr:", locErr?.message);
        console.log(
          "prof rows:",
          profRows?.length,
          "profErr:",
          profErr?.message
        );

        if (locErr) throw locErr;
        if (profErr) throw profErr;

        // merge profiles
        const profMap: Record<string, Profile> = {};
        (profRows ?? []).forEach((p: any) => (profMap[p.id] = p as Profile));
        setProfilesById((prev) => ({ ...prev, ...profMap }));

        // prefetch photos
        (profRows ?? [])
          .map((p: any) => p.photo_url as string | null)
          .filter(Boolean)
          .forEach((uri) => Image.prefetch(uri!));

        // merge locations
        const locMap: Record<string, LiveLoc> = {};
        (locRows ?? []).forEach((l: any) => (locMap[l.user_id] = l as LiveLoc));
        setLocationsById((prev) => ({ ...prev, ...locMap }));
      };

      try {
        setLoading(true);
        setError(null);

        // ✅ Use uid from layout if provided (avoids auth race)
        let uid = uidOverride ?? null;

        console.log("MAP REFRESH uid:", uid);

        if (!uid) {
          const { data: auth } = await supabase.auth.getUser();
          uid = auth.user?.id ?? null;
        }

        setMyUserId(uid);

        if (!uid) {
          setIds([]);
          setProfilesById({});
          setLocationsById({});
          return;
        }

        // ✅ Always load friends (even without location permission)
        const friendIds = await fetchFriendIds(uid);
        const baseIds = Array.from(new Set([uid, ...friendIds]));
        setIds(baseIds);
        await loadForIds(baseIds);

        // ✅ Subscribe once to location updates (and fetch missing profiles as they appear)
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

                // If we don't have this user's profile yet, fetch it so marker can render
                setProfilesById((prev) => {
                  if (prev[row.user_id]) return prev;
                  return prev; // unchanged; actual fetch below
                });

                if (!profilesById[row.user_id]) {
                  const { data: p } = await supabase
                    .from("profiles")
                    .select(
                      "id, username, display_name, photo_url, location_visibility"
                    )
                    .eq("id", row.user_id)
                    .maybeSingle<Profile>();

                  if (p) {
                    setProfilesById((prev) => ({ ...prev, [p.id]: p }));
                    if (p.photo_url) Image.prefetch(p.photo_url);
                  }
                }
              }
            )
            .subscribe();

          // no cleanup needed for now; provider lives for app session
          void channel;
        }

        // ✅ Add "nearby within 1 mile" ONLY if permission is granted
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status === Location.PermissionStatus.GRANTED) {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });

          const myLat = pos.coords.latitude;
          const myLng = pos.coords.longitude;

          const nearbyIds = await fetchNearbyUserIds(myLat, myLng, 1609.34);
          const combined = Array.from(new Set([...baseIds, ...nearbyIds]));
          setIds(combined);

          // Load any new ids we didn't already load
          const missing = combined.filter((id) => !baseIds.includes(id));
          await loadForIds(missing);
        }
      } catch (e: any) {
        setError(e?.message ?? "Failed to load map data.");
      } finally {
        setLoading(false);
      }
    },
    [fetchFriendIds, fetchNearbyUserIds]
  );

  const setMyLiveLocation = useCallback((loc: LiveLoc) => {
    setLocationsById((prev) => ({ ...prev, [loc.user_id]: loc }));
  }, []);

  const value = useMemo(
    () => ({
      loading,
      error,
      myUserId,
      ids,
      profilesById,
      locationsById,
      refresh,
      setMyLiveLocation,
    }),
    [
      loading,
      error,
      myUserId,
      ids,
      profilesById,
      locationsById,
      refresh,
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
