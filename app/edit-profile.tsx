import * as ImagePicker from "expo-image-picker";

import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ComponentProps } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/styles/themes";
import { ensureMinimalProfileExists } from "@/utils/profileReadiness";
import { router } from "expo-router";
import s from "@/styles/profilestyles";
import { supabase } from "../database/supabase";
import { useMapData } from "@/components/MapDataProvider";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  photo_url: string | null;
  location_visibility: string | null;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  instagram_handle?: string | null;
  tiktok_handle?: string | null;
  twitter_handle?: string | null;
  snapchat_handle?: string | null;
  banner_url?: string | null;
  onboarded?: boolean | null;
};

type MembershipRow = {
  id: string;
  user_id: string;
  plan: "free" | "premium";
  status: "active" | "inactive" | "cancelled" | "past_due" | "trialing";
};

type ProfileCustomizationRow = {
  user_id: string;
  accent_color: string | null;
};

type SettingsSection =
  | "main"
  | "profile"
  | "privacy"
  | "subscription"
  | "account";

const DEFAULT_ACCENT_COLOR = "#ef4444";
const ACCENT_COLOR_PRESETS = [
  "#ef4444",
  "#dc2626",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
];

export default function EditProfileScreen() {
  const {
    myUserId,
    profilesById,
    refresh,
    loading: mapDataLoading,
  } = useMapData();

  const [activeSection, setActiveSection] = useState<SettingsSection>("main");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [locationVis, setLocationVis] = useState("everyone");
  const [bio, setBio] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [tiktokHandle, setTiktokHandle] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [snapchatHandle, setSnapchatHandle] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [customizationLoading, setCustomizationLoading] = useState(false);
  const [customizationSavingColor, setCustomizationSavingColor] = useState<
    string | null
  >(null);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials = useMemo(() => {
    const src = displayName || username || email || "";
    return src
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [displayName, username, email]);

  const membershipPlan = membership?.plan ?? "free";
  const membershipStatus = membership?.status ?? "inactive";
  const isPremium =
    membershipPlan === "premium" && membershipStatus === "active";
  const appliedAccentColor = isPremium ? accentColor : DEFAULT_ACCENT_COLOR;
  const hasLocation = Boolean(city || state);
  const locationText = [city, state].filter(Boolean).join(", ");
  const loading = !profile && (loadingLocal || mapDataLoading);

  const hydrateProfile = useCallback((row: ProfileRow) => {
    setProfile(row);
    setUsername(row.username ?? "");
    setDisplayName(row.display_name ?? "");
    setPhotoUrl(row.photo_url ?? null);
    setBannerUrl(row.banner_url ?? null);
    setLocationVis(row.location_visibility ?? "everyone");
    setBio(row.bio ?? "");
    setInstagramHandle(row.instagram_handle ?? "");
    setTiktokHandle(row.tiktok_handle ?? "");
    setTwitterHandle(row.twitter_handle ?? "");
    setSnapchatHandle(row.snapchat_handle ?? "");
    setCity(row.city ?? null);
    setState(row.state ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setEmail(data.user?.email ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!mounted) return;
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError(null);

      if (!myUserId) {
        setProfile(null);
        setLoadingLocal(false);
        return;
      }

      const cached = profilesById?.[myUserId] as ProfileRow | undefined;
      if (cached) {
        if (!cancelled) {
          hydrateProfile(cached);
          setLoadingLocal(false);
        }
        return;
      }

      try {
        setLoadingLocal(true);
        const row = (await ensureMinimalProfileExists(myUserId)) as ProfileRow;
        if (cancelled) return;
        hydrateProfile(row);
        await refresh(myUserId);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load profile.");
      } finally {
        if (!cancelled) setLoadingLocal(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateProfile, myUserId, profilesById, refresh]);

  const loadMembership = useCallback(async () => {
    if (!myUserId) {
      setMembership(null);
      return;
    }

    try {
      const { data, error: loadErr } = await supabase
        .from("user_memberships")
        .select("id, user_id, plan, status")
        .eq("user_id", myUserId)
        .maybeSingle<MembershipRow>();

      if (loadErr) throw loadErr;
      setMembership(data ?? null);
    } catch {
      setMembership(null);
    }
  }, [myUserId]);

  const loadCustomization = useCallback(async () => {
    if (!myUserId) {
      setAccentColor(DEFAULT_ACCENT_COLOR);
      return;
    }

    setCustomizationLoading(true);
    const { data, error: loadErr } = await supabase
      .from("profile_customizations")
      .select("user_id, accent_color")
      .eq("user_id", myUserId)
      .maybeSingle<ProfileCustomizationRow>();

    if (!loadErr) {
      setAccentColor(data?.accent_color || DEFAULT_ACCENT_COLOR);
    }

    setCustomizationLoading(false);
  }, [myUserId]);

  useEffect(() => {
    if (!myUserId) return;
    void loadMembership();
    void loadCustomization();
  }, [myUserId, loadMembership, loadCustomization]);

  async function uploadImageToStorage(
    asset: ImagePicker.ImagePickerAsset,
    bucket: string,
    pathPrefix: string,
  ): Promise<string> {
    const ext =
      asset.fileName?.split(".").pop() || asset.uri.split(".").pop() || "jpg";
    const path = `${pathPrefix}/${Date.now()}.${ext}`;
    const contentType =
      asset.mimeType ||
      (ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : "image/*");

    const response = await fetch(asset.uri);
    const arrayBuffer = await response.arrayBuffer();

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, arrayBuffer, {
        contentType,
        upsert: true,
      });

    if (upErr) throw upErr;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async function pickProfileImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permission needed", "We need access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]) return;

    try {
      if (!myUserId) throw new Error("No user id");
      const uploadedUrl = await uploadImageToStorage(
        result.assets[0],
        "avatars",
        `${myUserId}`,
      );
      setPhotoUrl(uploadedUrl);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Unknown error");
    }
  }

  async function pickBannerImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permission needed", "We need access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]) return;

    try {
      if (!myUserId) throw new Error("No user id");
      const uploadedUrl = await uploadImageToStorage(
        result.assets[0],
        "avatars",
        `${myUserId}/banners`,
      );
      setBannerUrl(uploadedUrl);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Unknown error");
    }
  }

  function goBackFromSettings() {
    if (activeSection !== "main") {
      setActiveSection("main");
      return;
    }
    router.replace("/profile");
  }

  function cancelSectionEditing() {
    if (profile) hydrateProfile(profile);
    setActiveSection("main");
  }

  async function saveProfile(returnToMain = false) {
    if (!myUserId) return;

    setSaving(true);
    setError(null);

    const payload = {
      username: username.trim() || null,
      display_name: displayName.trim() || null,
      photo_url: photoUrl || null,
      banner_url: bannerUrl || null,
      location_visibility: locationVis || null,
      bio: bio.trim() || null,
      instagram_handle: instagramHandle.trim() || null,
      tiktok_handle: tiktokHandle.trim() || null,
      twitter_handle: twitterHandle.trim() || null,
      snapchat_handle: snapchatHandle.trim() || null,
      onboarded: true,
    };

    const { data, error: upErr } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", myUserId)
      .select("*")
      .single<ProfileRow>();

    if (upErr) {
      setError(upErr.message);
      setSaving(false);
      return;
    }

    hydrateProfile(data);
    await refresh(myUserId);
    setSaving(false);
    if (returnToMain) {
      setActiveSection("main");
    } else {
      router.back();
    }
  }

  async function saveAccentColor(nextColor: string) {
    if (!myUserId || !isPremium) return;
    setCustomizationSavingColor(nextColor);

    const { error: upsertErr } = await supabase
      .from("profile_customizations")
      .upsert(
        {
          user_id: myUserId,
          accent_color: nextColor,
        },
        { onConflict: "user_id" },
      );

    if (upsertErr) {
      Alert.alert("Could not save color", upsertErr.message);
      setCustomizationSavingColor(null);
      return;
    }

    setAccentColor(nextColor);
    setCustomizationSavingColor(null);
    await refresh(myUserId);
  }

  async function handleSignOut() {
    setSigningOut(true);
    const { error: signOutErr } = await supabase.auth.signOut();
    setSigningOut(false);

    if (signOutErr) {
      Alert.alert("Could not sign out", signOutErr.message);
      return;
    }

    router.replace("/map");
  }

  const profilePreview = [
    displayName.trim() || "No display name",
    username.trim() ? `@${username.trim()}` : "@username",
  ]
    .filter(Boolean)
    .join(" ");
  const premiumText = isPremium ? "Premium active" : "Premium upgrade required";
  const sectionTitle =
    activeSection === "main"
      ? "Edit Profile"
      : activeSection === "profile"
        ? "Profile"
        : activeSection === "privacy"
          ? "Privacy & Location"
          : activeSection === "subscription"
            ? "Subscription"
            : "Account";

  function renderSectionHeader(subtitle: string) {
    return (
      <View style={s.editScreenHeader}>
        <Pressable
          onPress={goBackFromSettings}
          style={s.backButton}
          accessibilityRole="button"
          accessibilityLabel={
            activeSection === "main" ? "Back to profile" : "Back to settings"
          }
        >
          <MaterialCommunityIcons name="chevron-left" size={26} color="#fff" />
        </Pressable>
        <View style={s.editHeaderTextWrap}>
          <Text style={s.editScreenTitle}>{sectionTitle}</Text>
          <Text style={s.editScreenSubtitle}>{subtitle}</Text>
        </View>
      </View>
    );
  }

  function renderSectionRow(
    section: Exclude<SettingsSection, "main">,
    icon: ComponentProps<typeof MaterialCommunityIcons>["name"],
    title: string,
    subtitle: string,
  ) {
    return (
      <Pressable
        key={section}
        onPress={() => setActiveSection(section)}
        style={s.settingsRowCard}
        accessibilityRole="button"
        accessibilityLabel={`Open ${title} settings`}
      >
        <View style={s.settingsRowIcon}>
          <MaterialCommunityIcons
            name={icon}
            size={22}
            color={colors.primary}
          />
        </View>
        <View style={s.settingsRowTextWrap}>
          <Text style={s.settingsRowTitle}>{title}</Text>
          <Text style={s.settingsRowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={colors.silver}
        />
      </Pressable>
    );
  }

  function renderSectionActions() {
    return (
      <>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <View style={s.btnRow}>
          <Pressable
            onPress={() => {
              void saveProfile(true);
            }}
            disabled={saving}
            style={[
              s.primaryBtn,
              s.sectionActionButton,
              saving && { opacity: 0.7 },
            ]}
          >
            {saving ? (
              <ActivityIndicator />
            ) : (
              <Text style={s.primaryBtnText}>Save</Text>
            )}
          </Pressable>
          <Pressable
            onPress={cancelSectionEditing}
            style={[s.secondaryBtn, s.sectionActionButton]}
          >
            <Text style={s.secondaryBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </>
    );
  }

  function renderMainSettings() {
    return (
      <>
        {renderSectionHeader(
          "Choose a section to update your CarMeet profile.",
        )}
        <View style={s.settingsList}>
          {renderSectionRow(
            "profile",
            "account-circle",
            "Profile",
            profilePreview,
          )}
          {renderSectionRow(
            "privacy",
            "shield-lock-outline",
            "Privacy & Location",
            `${locationVis || "everyone"} visibility${hasLocation ? ` - ${locationText}` : ""}`,
          )}
          {renderSectionRow(
            "subscription",
            "credit-card-outline",
            "Subscription",
            premiumText,
          )}
          {renderSectionRow(
            "account",
            "cog-outline",
            "Account",
            email ?? "Signed in",
          )}
        </View>
      </>
    );
  }

  function renderProfileSection() {
    return (
      <>
        {renderSectionHeader("Update your public identity and photos.")}
        <View style={s.settingsSectionCard}>
          <View style={s.field}>
            <Text style={s.label}>Profile photo</Text>
            <View style={s.settingsPhotoRow}>
              <View
                style={[
                  s.settingsPhotoWrap,
                  { borderColor: appliedAccentColor },
                ]}
              >
                {photoUrl ? (
                  <Image
                    source={{ uri: photoUrl }}
                    style={s.settingsPhotoPreview}
                  />
                ) : (
                  <View style={[s.settingsPhotoPreview, s.avatarFallback]}>
                    <Text style={s.avatarInitials}>{initials || "?"}</Text>
                  </View>
                )}
              </View>
              <Pressable onPress={pickProfileImage} style={s.secondaryBtn}>
                <Text style={s.secondaryBtnText}>Change photo</Text>
              </Pressable>
            </View>
          </View>

          <View style={s.field}>
            <Text style={s.label}>Banner photo</Text>
            {bannerUrl ? (
              <Image source={{ uri: bannerUrl }} style={s.bannerPreview} />
            ) : null}
            <Pressable onPress={pickBannerImage} style={s.secondaryBtn}>
              <Text style={s.secondaryBtnText}>
                {bannerUrl ? "Change banner" : "Choose banner"}
              </Text>
            </Pressable>
          </View>

          <View style={s.field}>
            <Text style={s.label}>Username</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              style={s.input}
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
            />
          </View>

          <View style={s.field}>
            <Text style={s.label}>Display name</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              style={s.input}
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={s.field}>
            <Text style={s.label}>Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Tell people about yourself"
              multiline
              style={[s.input, s.textarea]}
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={s.field}>
            <Text style={s.label}>Social handles</Text>
            {isPremium ? (
              <>
                <TextInput
                  value={instagramHandle}
                  onChangeText={setInstagramHandle}
                  placeholder="Instagram handle"
                  style={s.input}
                  autoCapitalize="none"
                  placeholderTextColor="#9ca3af"
                />
                <TextInput
                  value={tiktokHandle}
                  onChangeText={setTiktokHandle}
                  placeholder="TikTok handle"
                  style={[s.input, s.socialInput]}
                  autoCapitalize="none"
                  placeholderTextColor="#9ca3af"
                />
                <TextInput
                  value={twitterHandle}
                  onChangeText={setTwitterHandle}
                  placeholder="Twitter/X handle"
                  style={[s.input, s.socialInput]}
                  autoCapitalize="none"
                  placeholderTextColor="#9ca3af"
                />
                <TextInput
                  value={snapchatHandle}
                  onChangeText={setSnapchatHandle}
                  placeholder="Snapchat handle"
                  style={[s.input, s.socialInput]}
                  autoCapitalize="none"
                  placeholderTextColor="#9ca3af"
                />
              </>
            ) : (
              <Text style={s.placeholderText}>
                Premium required to add social handles. Upgrade to unlock this
                section.
              </Text>
            )}
          </View>

          <View style={s.field}>
            <Text style={s.label}>Profile outline color</Text>
            {isPremium ? (
              <View style={s.accentPickerRow}>
                {ACCENT_COLOR_PRESETS.map((color) => {
                  const selected = accentColor === color;
                  const savingThis = customizationSavingColor === color;
                  return (
                    <Pressable
                      key={color}
                      disabled={savingThis || customizationLoading}
                      onPress={() => {
                        void saveAccentColor(color);
                      }}
                      style={[
                        s.accentSwatch,
                        { backgroundColor: color },
                        selected && s.accentSwatchSelected,
                        (savingThis || customizationLoading) && {
                          opacity: 0.7,
                        },
                      ]}
                    >
                      {selected ? (
                        <MaterialCommunityIcons
                          name="check"
                          size={15}
                          color="#fff"
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={s.placeholderText}>
                Premium unlocks custom profile outline colors.
              </Text>
            )}
          </View>
        </View>
        {renderSectionActions()}
      </>
    );
  }

  function renderPrivacySection() {
    return (
      <>
        {renderSectionHeader("Control visibility for profile and map details.")}
        <View style={s.settingsSectionCard}>
          <View style={s.infoRow}>
            <Text style={s.label}>Profile visibility</Text>
            <Text style={s.placeholderText}>
              Your CarMeet profile is visible through current app profile rules.
            </Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.label}>Social handles visibility</Text>
            <Text style={s.placeholderText}>
              Handles appear on your profile and map card when saved. Leave a
              handle blank to hide it.
            </Text>
          </View>
          <View style={s.field}>
            <Text style={s.label}>Location visibility</Text>
            <View style={s.locationRow}>
              {["everyone", "friends", "nobody"].map((val) => {
                const selected = locationVis === val;
                return (
                  <Pressable
                    key={val}
                    onPress={() => setLocationVis(val)}
                    style={[
                      s.locationOption,
                      selected && s.locationOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        s.locationOptionText,
                        selected && s.locationOptionTextSelected,
                      ]}
                    >
                      {val}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Text style={s.placeholderText}>
            {hasLocation
              ? `Current profile location: ${locationText}`
              : "No city or state is saved yet."}
          </Text>
          <Text style={[s.placeholderText, s.settingsHelperText]}>
            Your saved location is managed by CarMeet location services; this
            setting controls who can see it on the map and profile.
          </Text>
        </View>
        {renderSectionActions()}
      </>
    );
  }

  function renderSubscriptionSection() {
    return (
      <>
        {renderSectionHeader("View premium status and gated features.")}
        <View style={s.settingsSectionCard}>
          <View style={s.infoRow}>
            <Text style={s.label}>Current plan</Text>
            <Text style={s.placeholderText}>
              {membershipPlan === "premium" ? "Premium" : "Free"} -{" "}
              {membershipStatus}
            </Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.label}>Premium profile features</Text>
            <Text style={s.placeholderText}>
              Premium unlocks social handles and custom profile outline colors
              in Profile settings.
            </Text>
          </View>
        </View>
      </>
    );
  }

  function renderAccountSection() {
    return (
      <>
        {renderSectionHeader("Manage your signed-in account.")}
        <View style={s.settingsSectionCard}>
          <View style={s.infoRow}>
            <Text style={s.label}>Email</Text>
            <Text style={s.placeholderText}>
              {email ?? "No email available"}
            </Text>
          </View>
        </View>
        <View style={s.signOutWrap}>
          <Pressable
            onPress={handleSignOut}
            disabled={signingOut}
            style={[s.signOutButton, signingOut && { opacity: 0.7 }]}
          >
            {signingOut ? (
              <ActivityIndicator />
            ) : (
              <Text style={s.signOutButtonText}>Sign out</Text>
            )}
          </Pressable>
        </View>
      </>
    );
  }

  function renderActiveSection() {
    if (activeSection === "profile") return renderProfileSection();
    if (activeSection === "privacy") return renderPrivacySection();
    if (activeSection === "subscription") return renderSubscriptionSection();
    if (activeSection === "account") return renderAccountSection();
    return renderMainSettings();
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator />
        <Text style={s.placeholderText}>Loading settings...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={s.center}>
        <Text style={s.placeholderText}>Profile not found.</Text>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={s.screen}
    >
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.settingsContainer}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
      >
        {renderActiveSection()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
