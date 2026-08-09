import { MapDataProvider, useMapData } from "@/components/MapDataProvider";
import { UserAccountProvider, useUserAccount } from "@/components/UserAccountProvider";
import { Animated, Easing, Pressable, Text, View, useWindowDimensions } from "react-native";
import { Tabs, router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import NotificationsOverlay from "../components/NotificationsOverlay";
import { colors } from "../styles/themes";
import styles from "../styles/homestyles";
import { supabase } from "../database/supabase";
import { ensureProfileAndMembershipExists } from "@/utils/profileReadiness";

export type FriendRequestProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  photo_url: string | null;
};

export type FriendRequest = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: string;
  created_at: string;
  requester_profile?: FriendRequestProfile | null;
};

function StartupSplash() {
  const { width } = useWindowDimensions();
  const carProgress = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(carProgress, {
            toValue: 1,
            duration: 1350,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(620),
            Animated.parallel([
              Animated.timing(titleOpacity, {
                toValue: 1,
                duration: 360,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(titleTranslateY, {
                toValue: 0,
                duration: 360,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
            ]),
          ]),
        ]),
        Animated.delay(620),
        Animated.parallel([
          Animated.timing(titleOpacity, {
            toValue: 0,
            duration: 180,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(titleTranslateY, {
            toValue: 8,
            duration: 180,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(carProgress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [carProgress, titleOpacity, titleTranslateY]);

  const carTranslateX = carProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-width * 0.58, width * 0.58],
  });

  return (
    <View style={styles.startupOverlay}>
      <View style={styles.startupAnimationStage}>
        <View style={styles.startupRoadLine} />
        <Animated.View
          style={[
            styles.startupCar,
            { transform: [{ translateX: carTranslateX }] },
          ]}
        >
          <MaterialCommunityIcons
            name="car-sports"
            size={70}
            color={colors.primary}
          />
        </Animated.View>
      </View>
      <Animated.Text
        style={[
          styles.startupWordmark,
          {
            opacity: titleOpacity,
            transform: [{ translateY: titleTranslateY }],
          },
        ]}
      >
        Cruizr
      </Animated.Text>
    </View>
  );
}
function RootLayoutInner() {
  const { refresh } = useMapData();
  const { hydrated: accountHydrated } = useUserAccount();


  const [authChecked, setAuthChecked] = useState(false);
  const [initialAppReady, setInitialAppReady] = useState(false);
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

      setAuthChecked(true);

    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setInitialAppReady(false);

      void (async () => {
        setAuthedEmail(user?.email ?? null);
        setUserId(user?.id ?? null);

        if (user?.id) {
          await ensureProfileAndMembership(user.id, user.email ?? null);
        }

        setAuthChecked(true);
      })();

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
      const requesterIds = Array.from(
        new Set(list.map((request) => request.from_user_id).filter(Boolean)),
      );
      let profilesByRequesterId: Record<string, FriendRequestProfile> = {};

      if (requesterIds.length > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from("profiles")
          .select("id, username, display_name, photo_url")
          .in("id", requesterIds);

        if (profileError) {
          setNotifError(profileError.message);
        } else {
          profilesByRequesterId = ((profileRows ?? []) as FriendRequestProfile[]).reduce<
            Record<string, FriendRequestProfile>
          >((acc, profile) => {
            acc[profile.id] = profile;
            return acc;
          }, {});
        }
      }

      const enrichedList = list.map((request) => ({
        ...request,
        requester_profile: profilesByRequesterId[request.from_user_id] ?? null,
      }));

      setPendingRequests(enrichedList);
      setPendingCount(enrichedList.length);
    }

    setNotifLoading(false);
  }, [userId]);

  // Bootstrap account, map data, meets, profiles, and pending requests before showing the app.
  useEffect(() => {
    let cancelled = false;

    async function bootstrapInitialAppData() {
      if (!authChecked || !accountHydrated) return;

      setInitialAppReady(false);

      if (!userId) {
        setPendingRequests([]);
        setPendingCount(0);
        setNotifOpen(false);
        await refresh(null);
        if (!cancelled) setInitialAppReady(true);
        return;
      }

      await Promise.all([fetchPendingRequests(), refresh(userId)]);
      if (!cancelled) setInitialAppReady(true);
    }

    void bootstrapInitialAppData();

    return () => {
      cancelled = true;
    };
  }, [accountHydrated, authChecked, userId, fetchPendingRequests, refresh]);

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

  function openRequesterProfile(requesterId: string) {
    setNotifOpen(false);
    setNotifError(null);
    router.navigate({
      pathname: "/map",
      params: { focusUserId: requesterId },
    });
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
        <Text style={styles.headerTitle}>Cruizr</Text>

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
          <Tabs.Screen
            name="edit-meet"
            options={{ href: null, title: "Edit Meet" }}
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
          onOpenProfile={openRequesterProfile}
        />
      </View>

      {!initialAppReady ? <StartupSplash /> : null}
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
