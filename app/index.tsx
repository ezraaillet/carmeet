import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useMemo, useState } from "react";

import styles from "@/styles/homestyles";
import { useMapData } from "@/components/MapDataProvider";
import { supabase } from "../database/supabase";
import { useRouter } from "expo-router";
import { hasMapProfileData } from "@/utils/profileReadiness";

type HomeTab = "friends" | "meets";
type AuthMode = "signin" | "signup" | null;
type FriendProfile = NonNullable<ReturnType<typeof useFriendProfiles>[number]>;

function useFriendProfiles(
  authedEmail: string | null,
  myUserId: string | null,
  ids: string[],
  profilesById: ReturnType<typeof useMapData>["profilesById"]
) {
  return useMemo(() => {
    if (!authedEmail || !myUserId) return [];

    return ids
      .filter((id) => id !== myUserId)
      .map((id) => profilesById[id])
      .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile))
      .sort((a, b) => {
        const aName = a.display_name || a.username || "";
        const bName = b.display_name || b.username || "";
        return aName.localeCompare(bName);
      });
  }, [authedEmail, ids, myUserId, profilesById]);
}

export default function Home() {
  const router = useRouter();
  const { ids, profilesById, myUserId, loading: mapLoading, refresh } = useMapData();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<HomeTab>("friends");
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<FriendProfile | null>(null);
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);

  // choose which auth flow (prevents empty signups)
  const [authMode, setAuthMode] = useState<AuthMode>(null);

  const cleanEmail = useMemo(() => (email ?? "").trim(), [email]);
  const canSubmit = useMemo(
    () => cleanEmail.length > 0 && (password ?? "").length >= 6,
    [cleanEmail, password]
  );
  const friendProfiles = useFriendProfiles(authedEmail, myUserId, ids, profilesById);

  async function routeAfterAuth(uid: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("username, display_name, location_visibility")
      .eq("id", uid)
      .maybeSingle<{
        username: string | null;
        display_name: string | null;
        location_visibility: string | null;
      }>();

    if (error || !hasMapProfileData(data)) {
      router.navigate("/profile?onboarding=1");
      return;
    }

    router.navigate("/map");
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      setAuthedEmail(user?.email ?? null);
      setCheckingAuth(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthedEmail(session?.user?.email ?? null);
      setCheckingAuth(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!selectedFriend) return;

    const nextSelectedFriend = friendProfiles.find(
      (friend) => friend.id === selectedFriend.id
    );

    if (!nextSelectedFriend) {
      setSelectedFriend(null);
      return;
    }

    if (nextSelectedFriend !== selectedFriend) {
      setSelectedFriend(nextSelectedFriend);
    }
  }, [friendProfiles, selectedFriend]);

  async function handleSignIn() {
    setLoading(true);
    setError(null);

    if (!cleanEmail) {
      setError("Email is required.");
      setLoading(false);
      return;
    }
    if ((password ?? "").length < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const uid = data.user?.id;
    if (uid) {
      await routeAfterAuth(uid);
    }

    setAuthMode(null);
    setEmail("");
    setPassword("");

    setLoading(false);
  }

  async function handleSignUp() {
    setLoading(true);
    setError(null);

    const passLen = (password ?? "").length;

    console.log("SIGNUP INPUT:", {
      rawEmail: email,
      cleanEmail,
      passLen,
      hasAt: cleanEmail.includes("@"),
    });

    if (!cleanEmail) {
      setError("Email is required.");
      setLoading(false);
      return;
    }
    if (passLen < 6) {
      setError("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    });

    console.log("SIGNUP DATA:", data);
    console.log("SIGNUP ERROR:", error);

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data?.user && !data?.session) {
      const { data: signInData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (signInError || !signInData.user?.id) {
        setError("Check your email to confirm your account, then sign in.");
        setAuthMode(null);
        setEmail("");
        setPassword("");
        setLoading(false);
        return;
      }

      await routeAfterAuth(signInData.user.id);
      setAuthMode(null);
      setEmail("");
      setPassword("");
      setLoading(false);
      return;
    }

    const uid = data?.user?.id;
    if (uid) {
      await routeAfterAuth(uid);
    } else {
      router.navigate("/profile?onboarding=1");
    }

    setAuthMode(null);
    setEmail("");
    setPassword("");
    setLoading(false);
  }

  function openAuth(mode: Exclude<AuthMode, null>) {
    setAuthMode(mode);
    setError(null);
    setEmail("");
    setPassword("");
  }

  function closeAuth() {
    if (loading) return;
    setAuthMode(null);
    setError(null);
    setEmail("");
    setPassword("");
  }

  async function handleRefreshFriends() {
    await refresh(myUserId);
  }

  async function confirmRemoveFriend(friend: FriendProfile) {
    if (!myUserId || removingFriendId) return;

    Alert.alert(
      "Remove friend?",
      `Remove ${friend.display_name || friend.username || "this friend"} from your friends list?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              setRemovingFriendId(friend.id);
              const { error: deleteError } = await supabase
                .from("friendships")
                .delete()
                .eq("status", "accepted")
                .or(
                  `and(user_id.eq.${myUserId},friend_id.eq.${friend.id}),and(user_id.eq.${friend.id},friend_id.eq.${myUserId})`
                );

              if (deleteError) throw deleteError;

              if (selectedFriend?.id === friend.id) {
                setSelectedFriend(null);
              }

              await refresh(myUserId);
            } catch (err: any) {
              Alert.alert(
                "Could not remove friend",
                err?.message ?? "Please try again."
              );
            } finally {
              setRemovingFriendId(null);
            }
          },
        },
      ]
    );
  }

  const renderFriendAvatar = (friend: FriendProfile, large = false) => {
    const avatarStyle = large ? styles.friendModalAvatar : styles.friendAvatar;
    const fallbackStyle = large
      ? styles.friendModalAvatarFallback
      : styles.friendAvatarFallback;
    const fallbackTextStyle = large
      ? styles.friendModalAvatarFallbackText
      : styles.friendAvatarFallbackText;

    if (friend.photo_url) {
      return <Image source={{ uri: friend.photo_url }} style={avatarStyle} />;
    }

    return (
      <View style={fallbackStyle}>
        <Text style={fallbackTextStyle}>
          {(friend.display_name || friend.username || "?").charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  };

  if (checkingAuth) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <Text style={styles.loadingIcon}>CarMeet</Text>
        <ActivityIndicator style={{ marginTop: 20 }} size="large" />
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.container, { width: "100%" }]}
      >
        <View
          style={[styles.homeBody, !authedEmail && styles.homeBodyCentered]}
        >
          {authedEmail ? (
            <>
              <View style={styles.homeTabsContainer}>
                {["friends", "meets"].map((tab) => {
                  const t = tab as HomeTab;
                  const selected = activeTab === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setActiveTab(t)}
                      style={[
                        styles.homeTabButton,
                        selected && styles.homeTabButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.homeTabButtonText,
                          selected && styles.homeTabButtonTextActive,
                        ]}
                      >
                        {t === "friends" ? "Friends" : "Meets"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.homeTabContent}>
                {activeTab === "friends" ? (
                  <View style={styles.friendsPanel}>
                    <View style={styles.friendsHeaderRow}>
                      <View>
                        <Text style={styles.friendsTitle}>Your friends</Text>
                        <Text style={styles.friendsSubtitle}>
                          {friendProfiles.length === 0
                            ? "Add people from the map to see them here."
                            : `${friendProfiles.length} friend${friendProfiles.length === 1 ? "" : "s"} in your crew.`}
                        </Text>
                      </View>

                      <Pressable
                        onPress={handleRefreshFriends}
                        style={({ pressed }) => [
                          styles.friendsRefreshButton,
                          pressed && styles.friendsRefreshButtonPressed,
                        ]}
                      >
                        <Text style={styles.friendsRefreshButtonText}>Refresh</Text>
                      </Pressable>
                    </View>

                    {mapLoading ? (
                      <View style={styles.friendsEmptyState}>
                        <ActivityIndicator />
                        <Text style={styles.homeTabContentText}>
                          Loading friends…
                        </Text>
                      </View>
                    ) : friendProfiles.length === 0 ? (
                      <View style={styles.friendsEmptyState}>
                        <Text style={styles.friendsEmptyTitle}>No friends yet</Text>
                        <Text style={styles.homeTabContentText}>
                          Once you send or accept friend requests, your list will
                          show up here.
                        </Text>
                      </View>
                    ) : (
                      <ScrollView
                        contentContainerStyle={styles.friendsList}
                        showsVerticalScrollIndicator={false}
                      >
                        {friendProfiles.map((friend) => {
                          const isRemoving = removingFriendId === friend.id;

                          return (
                            <Pressable
                              key={friend.id}
                              onPress={() => setSelectedFriend(friend)}
                              style={({ pressed }) => [
                                styles.friendCard,
                                pressed && styles.friendCardPressed,
                              ]}
                            >
                              {renderFriendAvatar(friend)}

                              <View style={styles.friendMeta}>
                                <Text style={styles.friendName}>
                                  {friend.display_name || friend.username || "Unnamed user"}
                                </Text>
                                <Text style={styles.friendHandle}>
                                  {friend.username
                                    ? `@${friend.username}`
                                    : "Username coming soon"}
                                </Text>
                                <Text style={styles.friendVisibility}>
                                  Visibility:{" "}
                                  {friend.location_visibility || "Not configured"}
                                </Text>
                              </View>

                              <Pressable
                                hitSlop={10}
                                accessibilityRole="button"
                                accessibilityLabel={`Remove ${friend.display_name || friend.username || "friend"}`}
                                disabled={isRemoving}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  void confirmRemoveFriend(friend);
                                }}
                                style={({ pressed }) => [
                                  styles.friendRemoveButton,
                                  pressed && styles.friendRemoveButtonPressed,
                                  isRemoving && styles.friendRemoveButtonDisabled,
                                ]}
                              >
                                <Text style={styles.friendRemoveButtonText}>
                                  {isRemoving ? "…" : "✕"}
                                </Text>
                              </Pressable>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                ) : (
                  <Text style={styles.homeTabContentText}>
                    Meets feed goes here
                  </Text>
                )}
              </View>
            </>
          ) : (
            <>
              {authMode === null ? (
                <View style={styles.homeAuthCard}>
                  <Pressable
                    onPress={() => openAuth("signin")}
                    style={({ pressed }) => [
                      styles.button,
                      pressed && styles.buttonPressed,
                      { width: "100%" },
                    ]}
                  >
                    <Text style={styles.buttonText}>Sign In</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => openAuth("signup")}
                    style={({ pressed }) => [
                      styles.homeSecondaryBtn,
                      pressed && styles.homeSecondaryBtnPressed,
                      { width: "100%", marginTop: 12 },
                    ]}
                  >
                    <Text style={styles.homeSecondaryBtnText}>
                      Create Account
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.homeAuthCard}>
                  <Text style={styles.homeAuthTitle}>
                    {authMode === "signin"
                      ? "Sign in to CarMeet"
                      : "Create your CarMeet account"}
                  </Text>

                  <TextInput
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    placeholderTextColor="#8A8A8A"
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                    style={[
                      styles.homeInput,
                      focusedField === "email" && styles.homeInputFocused,
                    ]}
                  />

                  <TextInput
                    secureTextEntry
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholderTextColor="#8A8A8A"
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    style={[
                      styles.homeInput,
                      focusedField === "password" && styles.homeInputFocused,
                    ]}
                  />

                  {error ? <Text style={styles.homeErrorText}>{error}</Text> : null}

                  <Pressable
                    disabled={loading || !canSubmit}
                    onPress={authMode === "signin" ? handleSignIn : handleSignUp}
                    style={({ pressed }) => [
                      styles.button,
                      (loading || !canSubmit) && { opacity: 0.6 },
                      pressed && canSubmit && !loading && styles.buttonPressed,
                      { width: "100%" },
                    ]}
                  >
                    <Text style={styles.buttonText}>
                      {loading
                        ? authMode === "signin"
                          ? "Signing In..."
                          : "Creating Account..."
                        : authMode === "signin"
                        ? "Continue"
                        : "Create Account"}
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={loading}
                    onPress={closeAuth}
                    style={({ pressed }) => [
                      styles.homeSecondaryBtn,
                      pressed && !loading && styles.homeSecondaryBtnPressed,
                      { width: "100%", marginTop: 12 },
                    ]}
                  >
                    <Text style={styles.homeSecondaryBtnText}>Back</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(selectedFriend)}
        onRequestClose={() => setSelectedFriend(null)}
      >
        <Pressable
          style={styles.friendModalBackdrop}
          onPress={() => setSelectedFriend(null)}
        >
          <Pressable
            style={styles.friendModalCard}
            onPress={(event) => event.stopPropagation()}
          >
            {selectedFriend ? (
              <>
                <View style={styles.friendModalHeader}>
                  {renderFriendAvatar(selectedFriend, true)}
                  <Pressable
                    hitSlop={10}
                    onPress={() => setSelectedFriend(null)}
                    style={({ pressed }) => [
                      styles.friendModalCloseButton,
                      pressed && styles.friendModalCloseButtonPressed,
                    ]}
                  >
                    <Text style={styles.friendModalCloseButtonText}>✕</Text>
                  </Pressable>
                </View>

                <Text style={styles.friendModalName}>
                  {selectedFriend.display_name ||
                    selectedFriend.username ||
                    "Unnamed user"}
                </Text>
                <Text style={styles.friendModalHandle}>
                  {selectedFriend.username
                    ? `@${selectedFriend.username}`
                    : "Username coming soon"}
                </Text>

                <View style={styles.friendModalInfoGroup}>
                  <Text style={styles.friendModalLabel}>Location visibility</Text>
                  <Text style={styles.friendModalValue}>
                    {selectedFriend.location_visibility || "Not configured"}
                  </Text>
                </View>

                <View style={styles.friendModalInfoGroup}>
                  <Text style={styles.friendModalLabel}>Profile photo</Text>
                  <Text style={styles.friendModalValue}>
                    {selectedFriend.photo_url ? "Added" : "Not added yet"}
                  </Text>
                </View>

                <Text style={styles.friendModalHint}>
                  Tap outside this card whenever you want to jump back to your list.
                </Text>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
