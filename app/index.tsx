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
import MapView, { Marker } from "react-native-maps";

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

function normalizeMeetTags(tags: unknown): string[] {
  if (!tags) return [];

  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof tags === "string") {
    const trimmed = tags.trim();

    if (!trimmed) return [];

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((tag) => String(tag).trim()).filter(Boolean);
        }
      } catch {
        return trimmed
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
      }
    }

    return trimmed
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function formatMeetWhen(startTime?: string | null, endTime?: string | null) {
  if (!startTime) return "Time TBD";

  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : null;

  if (!Number.isFinite(start.getTime())) return "Time TBD";

  const startLabel = start.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  if (!end || !Number.isFinite(end.getTime())) return startLabel;

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    const endClock = end.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });

    return `${startLabel} - ${endClock}`;
  }

  const endLabel = end.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return `${startLabel} → ${endLabel}`;
}

function formatMeetStatus(status?: string | null) {
  if (!status) return "Planned";
  return status
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseMeetDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}$/.test(trimmed)
    ? trimmed.replace(" ", "T")
    : trimmed;
  const parsed = new Date(normalized);

  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function formatMeetDateLabel(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return value;

  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatMeetTimeLabel(value: string) {
  const parsed = new Date(`2000-01-01T${value}:00`);
  if (!Number.isFinite(parsed.getTime())) return value;

  return parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Home() {
  const router = useRouter();
  const {
    ids,
    profilesById,
    myUserId,
    locationsById,
    loading: mapLoading,
    meets,
    myMeetAttendanceByMeetId,
    meetAttendeeSummaryByMeetId,
    refresh,
  } = useMapData();

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

  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [createMeetVisible, setCreateMeetVisible] = useState(false);
  const [creatingMeet, setCreatingMeet] = useState(false);
  const [meetTitleInput, setMeetTitleInput] = useState("");
  const [meetLocationInput, setMeetLocationInput] = useState("");
  const [meetDescriptionInput, setMeetDescriptionInput] = useState("");
  const [meetStartInput, setMeetStartInput] = useState("");
  const [meetDateInput, setMeetDateInput] = useState<string | null>(null);
  const [meetTimeInput, setMeetTimeInput] = useState<string | null>(null);
  const [meetLocationPin, setMeetLocationPin] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [meetEndDateInput, setMeetEndDateInput] = useState<string | null>(null);
  const [meetEndTimeInput, setMeetEndTimeInput] = useState<string | null>(null);
  const [meetMaxAttendeesInput, setMeetMaxAttendeesInput] = useState("");

  const meetDateOptions = useMemo(() => {
    const next14Days = Array.from({ length: 14 }, (_, idx) => {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + idx);
      return nextDate.toISOString().slice(0, 10);
    });
    return next14Days;
  }, []);

  const meetTimeOptions = useMemo(() => {
    return [
      "06:00",
      "07:00",
      "08:00",
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
      "19:00",
      "20:00",
      "21:00",
      "22:00",
      "23:00",
    ];
  }, []);

  const meetInitialRegion = useMemo(() => {
    const myLocation = myUserId ? locationsById[myUserId] : null;
    const fallbackLat = 37.7749;
    const fallbackLng = -122.4194;

    return {
      latitude: myLocation?.latitude ?? fallbackLat,
      longitude: myLocation?.longitude ?? fallbackLng,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }, [locationsById, myUserId]);

  const cleanEmail = useMemo(() => (email ?? "").trim(), [email]);
  const canSubmit = useMemo(
    () => cleanEmail.length > 0 && (password ?? "").length >= 6,
    [cleanEmail, password]
  );
  const friendProfiles = useFriendProfiles(authedEmail, myUserId, ids, profilesById);

  const meetCards = useMemo(() => {
    return meets.map((meet) => {
      const tags = normalizeMeetTags(meet.tags);
      const summary = meetAttendeeSummaryByMeetId[meet.id] ?? {
        total: 0,
        confirmed: 0,
      };
      const attendance = myMeetAttendanceByMeetId[meet.id] ?? null;

      return {
        ...meet,
        tags,
        summary,
        attendance,
      };
    });
  }, [meets, meetAttendeeSummaryByMeetId, myMeetAttendanceByMeetId]);

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

  function openCreateMeetModal() {
    setMeetTitleInput("");
    setMeetLocationInput("");
    setMeetDescriptionInput("");
    setMeetStartInput("");
    setMeetDateInput(null);
    setMeetTimeInput(null);
    setMeetEndDateInput(null);
    setMeetEndTimeInput(null);
    setMeetMaxAttendeesInput("");
    setMeetLocationPin(null);
    setCreateMeetVisible(true);
  }

  function closeCreateMeetModal() {
    if (creatingMeet) return;
    setCreateMeetVisible(false);
  }

  async function handleCreateMeet() {
    if (!myUserId || creatingMeet) return;

    const title = meetTitleInput.trim();
    const locationName = meetLocationInput.trim();
    const description = meetDescriptionInput.trim();
    const composedStartInput =
      meetDateInput && meetTimeInput ? `${meetDateInput} ${meetTimeInput}` : meetStartInput;
    const composedEndInput =
      meetEndDateInput && meetEndTimeInput ? `${meetEndDateInput} ${meetEndTimeInput}` : "";
    const parsedStart = parseMeetDateInput(composedStartInput);
    const parsedEnd = parseMeetDateInput(composedEndInput);
    const parsedMaxAttendees = Number.parseInt(meetMaxAttendeesInput.trim(), 10);
    const maxAttendees = Number.isFinite(parsedMaxAttendees) ? parsedMaxAttendees : null;

    if (!title) {
      Alert.alert("Meet title required", "Add a title to create your meet.");
      return;
    }

    if (!locationName || !meetLocationPin) {
      Alert.alert(
        "Location required",
        "Type an address/location name and drop a pin on the map."
      );
      return;
    }

    if (!meetDateInput || !meetTimeInput || !parsedStart) {
      Alert.alert(
        "Start time required",
        "Pick a date and time for when the meet starts."
      );
      return;
    }

    if (!meetEndDateInput || !meetEndTimeInput || !parsedEnd) {
      Alert.alert(
        "End time required",
        "Pick a date and time for when the meet ends."
      );
      return;
    }

    if (new Date(parsedEnd).getTime() <= new Date(parsedStart).getTime()) {
      Alert.alert(
        "End time must be later",
        "Choose an end time that is after the start time."
      );
      return;
    }

    if (!maxAttendees || maxAttendees < 1) {
      Alert.alert(
        "Max attendees required",
        "Enter a max attendee limit of at least 1."
      );
      return;
    }

    try {
      setCreatingMeet(true);

      const { data: createdMeet, error: createMeetError } = await supabase
        .from("meets")
        .insert({
          title,
          location_name: locationName || "Pinned location",
          address: locationName || null,
          latitude: meetLocationPin?.latitude ?? null,
          longitude: meetLocationPin?.longitude ?? null,
          description: description || null,
          start_time: parsedStart,
          end_time: parsedEnd,
          max_attendees: maxAttendees,
          created_by: myUserId,
          is_public: true,
          status: "upcoming",
        })
        .select("id")
        .single<{ id: string }>();

      if (createMeetError || !createdMeet?.id) {
        throw createMeetError || new Error("Could not create meet.");
      }

      await supabase.from("meet_attendees").insert({
        meet_id: createdMeet.id,
        user_id: myUserId,
        status: "host",
      });

      await refresh(myUserId);
      setCreateMeetVisible(false);
      setActiveTab("meets");
    } catch (err: any) {
      Alert.alert("Could not create meet", err?.message ?? "Please try again.");
    } finally {
      setCreatingMeet(false);
    }
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
                  <View style={styles.meetsPanel}>
                    <View style={styles.friendsHeaderRow}>
                      <View style={styles.friendsHeaderTextWrap}>
                        <Text style={styles.friendsTitle}>Upcoming meets</Text>
                        <Text style={styles.friendsSubtitle}>
                          {meetCards.length === 0
                            ? "No meets yet. Create one to get your crew together."
                            : `${meetCards.length} meet${meetCards.length === 1 ? "" : "s"} available.`}
                        </Text>
                      </View>

                      <View style={styles.meetHeaderActions}>
                        <Pressable
                          onPress={openCreateMeetModal}
                          style={({ pressed }) => [
                            styles.meetCreateButton,
                            pressed && styles.meetCreateButtonPressed,
                          ]}
                        >
                          <Text style={styles.meetCreateButtonText}>Create Meet</Text>
                        </Pressable>

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
                    </View>

                    {mapLoading ? (
                      <View style={styles.friendsEmptyState}>
                        <ActivityIndicator />
                        <Text style={styles.homeTabContentText}>Loading meets…</Text>
                      </View>
                    ) : meetCards.length === 0 ? (
                      <View style={styles.friendsEmptyState}>
                        <Text style={styles.friendsEmptyTitle}>No meets found</Text>
                        <Text style={styles.homeTabContentText}>
                          Public meets and your joined meets will appear here.
                        </Text>
                      </View>
                    ) : (
                      <ScrollView
                        contentContainerStyle={styles.friendsList}
                        showsVerticalScrollIndicator={false}
                      >
                        {meetCards.map((meet) => (
                          <View key={meet.id} style={styles.meetCard}>
                            <View style={styles.meetHeaderRow}>
                              <Text style={styles.meetTitle}>
                                {meet.title || "Untitled meet"}
                              </Text>
                              <Text style={styles.meetStatus}>
                                {formatMeetStatus(meet.status)}
                              </Text>
                            </View>

                            <Text style={styles.meetTimeText}>
                              {formatMeetWhen(meet.start_time, meet.end_time)}
                            </Text>

                            <Text style={styles.meetLocationText}>
                              📍 {meet.location_name || meet.address || "Location TBD"}
                            </Text>

                            {!!meet.description && (
                              <Text style={styles.meetDescription} numberOfLines={3}>
                                {meet.description}
                              </Text>
                            )}

                            <View style={styles.meetMetaRow}>
                              <Text style={styles.meetMetaText}>
                                {meet.summary.confirmed} confirmed · {meet.summary.total} attending
                              </Text>
                              {!!meet.max_attendees && (
                                <Text style={styles.meetMetaText}>
                                  Cap: {meet.max_attendees}
                                </Text>
                              )}
                            </View>

                            {meet.attendance && (
                              <Text style={styles.meetAttendanceText}>
                                Your status: {formatMeetStatus(meet.attendance)}
                              </Text>
                            )}

                            {meet.tags.length > 0 && (
                              <View style={styles.meetTagsRow}>
                                {meet.tags.map((tag) => (
                                  <View key={`${meet.id}-${tag}`} style={styles.meetTagPill}>
                                    <Text style={styles.meetTagPillText}>#{tag}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </View>
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
        animationType="slide"
        transparent
        visible={createMeetVisible}
        onRequestClose={closeCreateMeetModal}
      >
        <Pressable
          style={styles.friendModalBackdrop}
          onPress={closeCreateMeetModal}
        >
          <Pressable
            style={styles.createMeetModalCard}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={styles.createMeetModalTitle}>Create a meet</Text>
            <Text style={styles.createMeetModalSubtitle}>
              Share it publicly so your crew can join.
            </Text>

            <TextInput
              placeholder="Meet title"
              placeholderTextColor="#8A8A8A"
              style={styles.homeInput}
              value={meetTitleInput}
              onChangeText={setMeetTitleInput}
            />

            <TextInput
              placeholder="Address or location name"
              placeholderTextColor="#8A8A8A"
              style={styles.homeInput}
              value={meetLocationInput}
              onChangeText={setMeetLocationInput}
            />

            <Text style={styles.createMeetFieldLabel}>Start date</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.createMeetChipRow}
            >
              {meetDateOptions.map((option) => {
                const selected = meetDateInput === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setMeetDateInput(option)}
                    style={({ pressed }) => [
                      styles.createMeetChip,
                      selected && styles.createMeetChipSelected,
                      pressed && styles.createMeetChipPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.createMeetChipText,
                        selected && styles.createMeetChipTextSelected,
                      ]}
                    >
                      {formatMeetDateLabel(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.createMeetFieldLabel}>Start time</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.createMeetChipRow}
            >
              {meetTimeOptions.map((option) => {
                const selected = meetTimeInput === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setMeetTimeInput(option)}
                    style={({ pressed }) => [
                      styles.createMeetChip,
                      selected && styles.createMeetChipSelected,
                      pressed && styles.createMeetChipPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.createMeetChipText,
                        selected && styles.createMeetChipTextSelected,
                      ]}
                    >
                      {formatMeetTimeLabel(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.createMeetFieldLabel}>End date</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.createMeetChipRow}
            >
              {meetDateOptions.map((option) => {
                const selected = meetEndDateInput === option;
                return (
                  <Pressable
                    key={`end-date-${option}`}
                    onPress={() => setMeetEndDateInput(option)}
                    style={({ pressed }) => [
                      styles.createMeetChip,
                      selected && styles.createMeetChipSelected,
                      pressed && styles.createMeetChipPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.createMeetChipText,
                        selected && styles.createMeetChipTextSelected,
                      ]}
                    >
                      {formatMeetDateLabel(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.createMeetFieldLabel}>End time</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.createMeetChipRow}
            >
              {meetTimeOptions.map((option) => {
                const selected = meetEndTimeInput === option;
                return (
                  <Pressable
                    key={`end-time-${option}`}
                    onPress={() => setMeetEndTimeInput(option)}
                    style={({ pressed }) => [
                      styles.createMeetChip,
                      selected && styles.createMeetChipSelected,
                      pressed && styles.createMeetChipPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.createMeetChipText,
                        selected && styles.createMeetChipTextSelected,
                      ]}
                    >
                      {formatMeetTimeLabel(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <TextInput
              placeholder="Max attendees"
              placeholderTextColor="#8A8A8A"
              style={styles.homeInput}
              keyboardType="number-pad"
              value={meetMaxAttendeesInput}
              onChangeText={setMeetMaxAttendeesInput}
            />

            <Text style={styles.createMeetFieldLabel}>Pick a spot on the map (required for map pin)</Text>
            <MapView
              style={styles.createMeetMap}
              initialRegion={meetInitialRegion}
              onPress={(event) => setMeetLocationPin(event.nativeEvent.coordinate)}
            >
              {meetLocationPin ? <Marker coordinate={meetLocationPin} /> : null}
            </MapView>
            <Text style={styles.createMeetMapHint}>
              {meetLocationPin
                ? `Pinned: ${meetLocationPin.latitude.toFixed(5)}, ${meetLocationPin.longitude.toFixed(5)}`
                : "Tap anywhere on the map to drop a pin."}
            </Text>

            <TextInput
              placeholder="Description (optional)"
              placeholderTextColor="#8A8A8A"
              style={[styles.homeInput, styles.createMeetDescriptionInput]}
              value={meetDescriptionInput}
              onChangeText={setMeetDescriptionInput}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.createMeetActionsRow}>
              <Pressable
                onPress={closeCreateMeetModal}
                disabled={creatingMeet}
                style={({ pressed }) => [
                  styles.homeSecondaryBtn,
                  styles.createMeetActionButton,
                  pressed && !creatingMeet && styles.homeSecondaryBtnPressed,
                ]}
              >
                <Text style={styles.homeSecondaryBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleCreateMeet}
                disabled={creatingMeet}
                style={({ pressed }) => [
                  styles.button,
                  styles.createMeetActionButton,
                  creatingMeet && { opacity: 0.6 },
                  pressed && !creatingMeet && styles.buttonPressed,
                ]}
              >
                <Text style={styles.buttonText}>
                  {creatingMeet ? "Creating..." : "Create"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
