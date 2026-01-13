import { MapDataProvider, useMapData } from "@/components/MapDataProvider";
// app/_layout.tsx
import { Pressable, Text, View } from "react-native";
import { useCallback, useEffect, useState } from "react";

import { Ionicons } from "@expo/vector-icons";
import NotificationsOverlay from "../components/NotificationsOverlay";
import { Tabs } from "expo-router";
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

  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Track auth
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setAuthedEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setAuthedEmail(user?.email ?? null);
      setUserId(user?.id ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

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
    // (your MapDataProvider refresh currently accepts userId)
    // @ts-ignore
    refresh(userId);
  }, [userId, fetchPendingRequests, refresh]);

  // ✅ Realtime updates for friend requests
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

      // Optimistic UI update
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

      {/* Everything below header */}
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
            options={{ title: "Map", tabBarLabel: "Map" }}
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
