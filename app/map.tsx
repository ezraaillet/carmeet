// app/map.tsx

import * as Location from "expo-location";

import {
  ActivityIndicator,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export default function MapScreen() {
  const mapRef = useRef<MapView | null>(null);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);

  const [region, setRegion] = useState<Region>({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  // Everyone we’re allowed to see (RLS-enforced)
  const [all, setAll] = useState<Record<string, LiveLoc>>({});

  // ---------------- Auth state ----------------
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setAuthed(!!user);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setAuthed(!!session?.user);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // -------------- Seed + realtime --------------
  useEffect(() => {
    if (!authed) return;

    let removed = false;

    (async () => {
      const { data, error } = await supabase.from("locations").select("*");
      if (!error && data && !removed) {
        const seed: Record<string, LiveLoc> = {};
        (data as LiveLoc[]).forEach((row) => (seed[row.user_id] = row));
        setAll(seed);
      }

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
      removed = true;
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
      const { data: { user } } = await supabase.auth.getUser();
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
              center: { latitude: coords.latitude, longitude: coords.longitude },
            });

            // NOTE: throttle for production; fine for dev
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

  // -------------- Anti-collision: spread overlapping pins --------------
  // Round lat/lng to 5 decimals (~1.1 m) to detect "same spot"
  const spread = useMemo(() => {
    const groups = new Map<string, LiveLoc[]>();
    const round = (v: number) => Math.round(v * 1e5) / 1e5;

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

      // Spread in a small ring (radius ~8m)
      const radiusMeters = 8;
      arr.forEach((loc, i) => {
        const angle = (2 * Math.PI * i) / arr.length; // even distribution
        const latRad = (loc.lat * Math.PI) / 180;
        const metersPerDegLat = 111_111; // ~m/deg
        const metersPerDegLng = 111_111 * Math.cos(latRad);

        const dx = radiusMeters * Math.cos(angle); // east-west
        const dy = radiusMeters * Math.sin(angle); // north-south

        const dLat = dy / metersPerDegLat;
        const dLng = dx / metersPerDegLng;

        results.push({
          loc,
          adjLat: loc.lat + dLat,
          adjLng: loc.lng + dLng,
        });
      });
    }

    return results;
  }, [all]);

  // -------------- UI states --------------
  if (!authed) {
    return (
      <View style={styles.center}>
        <Text style={{ fontSize: 16, textAlign: "center", paddingHorizontal: 24 }}>
          Please sign in on the Home tab to share and view locations.
        </Text>
      </View>
    );
  }

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
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

  // -------------- Map --------------
  return (
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
          zIndex={999} // keep on top if overlapping other content
        >
          <Image
            source={require("../assets/images/racing-car-with-side-skirts.png")}
            style={{ width: 44, height: 44 }}
            resizeMode="contain"
          />
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
