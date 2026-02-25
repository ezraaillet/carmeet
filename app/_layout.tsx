import { MapDataProvider, useMapData } from "@/components/MapDataProvider";
import { Pressable, Text, View } from "react-native";
import { Tabs, usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { Ionicons } from "@expo/vector-icons";
import NotificationsOverlay from "../components/NotificationsOverlay";
import { colors } from "../styles/themes";
import styles from "../styles/homestyles";
import { supabase } from "../database/supabase";
import { hasMapProfileData } from "@/utils/profileReadiness";

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

  const [mapProfileReady, setMapProfileReady] = useState<boolean>(false);
  const [checkingProfileReady, setCheckingProfileReady] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);

  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchProfileReadiness = useCallback(
    async (
      uid: string,
      options?: { redirectIfNotReady?: boolean }
    ): Promise<boolean> => {
      const redirectIfNotReady = options?.redirectIfNotReady ?? true;
      setCheckingProfileReady(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("username, display_name, location_visibility")
        .eq("id", uid)
        .maybeSingle<{
          username: string | null;
          display_name: string | null;
          location_visibility: string | null;
        }>();

      if (error) {
        console.warn("fetch profile readiness error:", error.message);
        setMapProfileReady(false);
        setCheckingProfileReady(false);
        if (redirectIfNotReady) {
          router.navigate("/profile?onboarding=1");
        }
        return false;
      }

      const ready = hasMapProfileData(data);
      setMapProfileReady(ready);
      setCheckingProfileReady(false);

      if (!ready && redirectIfNotReady) {
        router.navigate("/profile?onboarding=1");
      }

      return ready;
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
        await fetchProfileReadiness(user.id);
      } else {
        setMapProfileReady(false);
        setCheckingProfileReady(false);
      }

      setCheckingAuth(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthedEmail(user?.email ?? null);
      setUserId(user?.id ?? null);

      if (user?.id) fetchProfileReadiness(user.id);
      else {
        setMapProfileReady(false);
        setCheckingProfileReady(false);
      }

      setCheckingAuth(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [fetchProfileReadiness]);

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

  // realtime profile readiness watch
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel("profile-readiness-watch")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as any;
          setMapProfileReady(hasMapProfileData(next));
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


  // Re-check map profile data when returning to Profile so tab gating updates immediately
  useEffect(() => {
    if (checkingAuth || !userId) return;
    if (pathname !== "/profile") return;

    fetchProfileReadiness(userId);
  }, [checkingAuth, userId, pathname, fetchProfileReadiness]);


  useEffect(() => {
    if (checkingAuth || checkingProfileReady) return;

    if (!userId) {
      if (pathname === "/map") router.navigate("/");
      return;
    }

    if (!mapProfileReady && pathname === "/map") {
      router.navigate("/profile?onboarding=1");
    }
  }, [checkingAuth, checkingProfileReady, userId, mapProfileReady, pathname, router]);

  const canAccessMap = !!userId && mapProfileReady && !checkingAuth && !checkingProfileReady;

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
              tabBarIcon: ({ color, size }) => (
                <Ionicons
                  name="map"
                  size={size}
                  color={canAccessMap ? color : colors.gunmetal}
                />
              ),
            }}
            listeners={{
              tabPress: (e) => {
                if (!userId) {
                  e.preventDefault();
                  router.push("/");
                  return;
                }

                if (checkingProfileReady) {
                  e.preventDefault();
                  return;
                }

                if (!mapProfileReady) {
                  e.preventDefault();

                  void (async () => {
                    const ready = await fetchProfileReadiness(userId, {
                      redirectIfNotReady: false,
                    });

                    if (ready) {
                      router.push("/map");
                    } else {
                      router.push("/profile?onboarding=1");
                    }
                  })();
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
