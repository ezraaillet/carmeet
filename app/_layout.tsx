import { MapDataProvider, useMapData } from "@/components/MapDataProvider";
import { UserAccountProvider } from "@/components/UserAccountProvider";
import { Pressable, Text, View } from "react-native";
import { Tabs, router } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { Ionicons } from "@expo/vector-icons";
import NotificationsOverlay from "../components/NotificationsOverlay";
import { colors } from "../styles/themes";
import styles from "../styles/homestyles";
import { supabase } from "../database/supabase";
import { ensureProfileAndMembershipExists } from "@/utils/profileReadiness";

export type FriendRequest = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: string;
  created_at: string;
};

function RootLayoutInner() {
  const { refresh } = useMapData();


  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const ensureProfileAndMembership = useCallback(async (uid: string, email?: string | null) => {
    try {
      await ensureProfileAndMembershipExists(uid, email);
    } catch (error: any) {
      console.warn("ensure profile/membership exists error:", error?.message ?? error);
    }
  }, []);

  // Track auth
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setAuthedEmail(user?.email ?? null);
      setUserId(user?.id ?? null);

      if (user?.id) {
        await ensureProfileAndMembership(user.id, user.email ?? null);
      }

    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthedEmail(user?.email ?? null);
      setUserId(user?.id ?? null);

      if (user?.id) {
        void ensureProfileAndMembership(user.id, user.email ?? null);
      }

    });

    return () => sub.subscription.unsubscribe();
  }, [ensureProfileAndMembership]);

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
      // Clear user-scoped map/profile caches on logout.
      // @ts-ignore
      void refresh(null);
      return;
    }

    fetchPendingRequests();

    // preload friends + nearby + profiles
    // @ts-ignore
    refresh(userId);
  }, [userId, fetchPendingRequests, refresh]);

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


  function openNotifications() {
    if (!userId) return;
    setNotifOpen(true);
    fetchPendingRequests();
  }

  function keepSignedOutUserOnMap() {
    router.replace("/map");
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
    <View style={{ flex: 1, backgroundColor: colors.black }}>
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

      <View style={{ flex: 1, backgroundColor: colors.black }}>
        <Tabs
          initialRouteName="map"
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.offwhite,
            tabBarStyle: {
              backgroundColor: colors.black,
              borderTopColor: colors.gunmetal,
              borderTopWidth: 1,
            },
            sceneStyle: {
              backgroundColor: colors.black,
            },
            tabBarIcon: ({ color, size }) => {
              const name =
                route.name === "map"
                  ? "map"
                  : route.name === "create"
                  ? "add-circle"
                  : "person";
              return <Ionicons name={name as any} size={size} color={color} />;
            },
          })}
        >
          <Tabs.Screen name="map" options={{ title: "Map", tabBarLabel: "Map" }} />
          <Tabs.Screen
            name="create"
            options={{
              title: "Create",
              tabBarLabel: "Create",
              tabBarItemStyle: !userId ? { opacity: 0.45 } : undefined,
            }}
            listeners={{
              tabPress: (event) => {
                if (userId) return;
                event.preventDefault();
                keepSignedOutUserOnMap();
              },
            }}
          />
          <Tabs.Screen name="index" options={{ href: null }} />
          <Tabs.Screen name="auth" options={{ href: null, title: "Sign In" }} />

          <Tabs.Screen
            name="profile"
            options={{
              title: "Profile",
              tabBarLabel: "Profile",
              tabBarItemStyle: !userId ? { opacity: 0.45 } : undefined,
            }}
            listeners={{
              tabPress: (event) => {
                if (userId) return;
                event.preventDefault();
                keepSignedOutUserOnMap();
              },
            }}
          />
          <Tabs.Screen
            name="edit-profile"
            options={{ href: null, title: "Edit Profile" }}
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
    <UserAccountProvider>
      <MapDataProvider>
        <RootLayoutInner />
      </MapDataProvider>
    </UserAccountProvider>
  );
}
