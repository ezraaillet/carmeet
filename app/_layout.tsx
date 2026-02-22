import { MapDataProvider, useMapData } from "@/components/MapDataProvider";
import { Pressable, Text, View } from "react-native";
import { Tabs, usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { Ionicons } from "@expo/vector-icons";
import NotificationsOverlay from "../components/NotificationsOverlay";
import { colors } from "../styles/themes";
import styles from "../styles/homestyles";
import { supabase } from "../database/supabase";

export type FriendRequest = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: string;
  created_at: string;
};

function RootLayoutInner() {
  const { refresh } = useMapData();
  const router = useRouter();
  const pathname = usePathname();

  const [onboarded, setOnboarded] = useState<boolean>(false);
  const [checkingOnboard, setCheckingOnboard] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);

  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchOnboarded = useCallback(
    async (uid: string) => {
      setCheckingOnboard(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", uid)
        .maybeSingle<{ onboarded: boolean }>();

      if (error) {
        console.warn("fetch onboarded error:", error.message);
        setOnboarded(false);
        setCheckingOnboard(false);
        // if profile row missing or query blocked, safest is send to profile
        router.replace("/profile");
        return;
      }

      const ok = !!data?.onboarded;
      setOnboarded(ok);
      setCheckingOnboard(false);

      // ✅ If signed in but not onboarded, force Profile
      if (!ok) {
        router.replace("/profile");
      }
    },
    [router]
  );

  // Track auth
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setAuthedEmail(user?.email ?? null);
      setUserId(user?.id ?? null);

      if (user?.id) {
        await fetchOnboarded(user.id);
      } else {
        setOnboarded(false);
        setCheckingOnboard(false);
      }

      setCheckingAuth(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthedEmail(user?.email ?? null);
      setUserId(user?.id ?? null);

      if (user?.id) fetchOnboarded(user.id);
      else {
        setOnboarded(false);
        setCheckingOnboard(false);
      }

      setCheckingAuth(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [fetchOnboarded]);

  // Fetch pending requests list + count
  const fetchPendingRequests = useCallback(async () => {
    if (!userId) {
      setPendingRequests([]);
      setPendingCount(0);
      return;
    }

    setNotifLoading(true);
    setNotifError(null);

    const { data, error } = await supabase
      .from("friend_requests")
      .select("*")
      .eq("to_user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      setNotifError(error.message);
      setPendingRequests([]);
      setPendingCount(0);
    } else {
      const list = (data ?? []) as FriendRequest[];
      setPendingRequests(list);
      setPendingCount(list.length);
    }

    setNotifLoading(false);
  }, [userId]);

  // Bootstrap map data + pending requests whenever user changes
  useEffect(() => {
    if (!userId) {
      setPendingRequests([]);
      setPendingCount(0);
      setNotifOpen(false);
      return;
    }

    fetchPendingRequests();

    // preload friends + nearby + profiles
    // @ts-ignore
    refresh(userId);
  }, [userId, fetchPendingRequests, refresh]);

  // realtime profile onboard watch
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("profile-onboarded-watch")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const next = (payload.new as any)?.onboarded;
          setOnboarded(!!next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Realtime updates for friend requests
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("friend-requests-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests" },
        (payload) => {
          const row = payload.new as FriendRequest;
          if (row.to_user_id !== userId) return;
          fetchPendingRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchPendingRequests]);

  useEffect(() => {
    if (checkingAuth || checkingOnboard) return;

    if (!userId) {
      if (pathname === "/map") router.replace("/");
      return;
    }

    if (!onboarded && pathname === "/map") {
      router.replace("/profile");
    }
  }, [checkingAuth, checkingOnboard, userId, onboarded, pathname, router]);

  const canAccessMap = !!userId && onboarded && !checkingAuth && !checkingOnboard;

  function openNotifications() {
    if (!userId) return;
    setNotifOpen(true);
    fetchPendingRequests();
  }

  function closeNotifications() {
    setNotifOpen(false);
    setNotifError(null);
  }

  async function handleRespond(
    requestId: string,
    newStatus: "accepted" | "rejected"
  ) {
    if (!userId) return;
    setActionLoadingId(requestId);
    setNotifError(null);

    try {
      const rpcName =
        newStatus === "accepted"
          ? "accept_friend_request"
          : "reject_friend_request";

      const { error } = await supabase.rpc(rpcName, {
        p_request_id: requestId,
      });

      if (error) {
        setNotifError(error.message);
        return;
      }

      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      setPendingCount((prev) => Math.max(0, prev - 1));

      // Refresh map caches so accepted friend appears immediately
      // @ts-ignore
      await refresh(userId);
    } finally {
      setActionLoadingId(null);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Header stays on top */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>CarMeet</Text>

        {authedEmail && (
          <Pressable
            onPress={openNotifications}
            style={styles.notifButton}
            hitSlop={8}
          >
            <Ionicons
              name="notifications-outline"
              size={24}
              color={colors.primary}
            />
            {pendingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {pendingCount > 9 ? "9+" : pendingCount}
                </Text>
              </View>
            )}
          </Pressable>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.offwhite,
            tabBarStyle: {
              backgroundColor: colors.black,
              borderTopColor: colors.gunmetal,
              borderTopWidth: 1,
            },
            tabBarIcon: ({ color, size }) => {
              const name =
                route.name === "index"
                  ? "home"
                  : route.name === "map"
                  ? "map"
                  : "person";
              return <Ionicons name={name as any} size={size} color={color} />;
            },
          })}
        >
          <Tabs.Screen
            name="index"
            options={{ title: "Home", tabBarLabel: "Home" }}
          />

          <Tabs.Screen
            name="map"
            options={{
              title: "Map",
              tabBarLabel: "Map",
              href: canAccessMap ? "/map" : null,
            }}
            listeners={{
              tabPress: (e) => {
                if (!userId) {
                  e.preventDefault();
                  router.push("/");
                  return;
                }

                if (checkingOnboard) {
                  e.preventDefault();
                  return;
                }

                if (!onboarded) {
                  e.preventDefault();
                  router.push("/profile");
                }
              },
            }}
          />

          <Tabs.Screen
            name="profile"
            options={{ title: "Profile", tabBarLabel: "Profile" }}
          />
        </Tabs>

        <NotificationsOverlay
          open={notifOpen}
          onClose={closeNotifications}
          pendingRequests={pendingRequests}
          loading={notifLoading}
          error={notifError}
          actionLoadingId={actionLoadingId}
          onRespond={handleRespond}
        />
      </View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <MapDataProvider>
      <RootLayoutInner />
    </MapDataProvider>
  );
}
