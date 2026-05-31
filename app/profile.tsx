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
import * as Linking from "expo-linking";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import s from "@/styles/profilestyles";
import { supabase } from "../database/supabase";
import { useMapData } from "@/components/MapDataProvider";
import { useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import {
  ensureMinimalProfileExists,
  hasMapProfileData,
} from "@/utils/profileReadiness";

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
  created_at?: string;
  onboarded?: boolean | null;
};

type ProfileTab = "cars" | "meets";

type CarRow = {
  id: string;
  user_id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
  color: string | null;
  description: string | null;
  photo_url: string | null;
  is_primary: boolean | null;
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

export default function ProfileScreen() {
  const params = useLocalSearchParams<{ onboarding?: string }>();

  const {
    myUserId,
    profilesById,
    refresh,
    loading: mapDataLoading,
  } = useMapData();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [locationVis, setLocationVis] = useState("everyone");
  const [bio, setBio] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [tiktokHandle, setTiktokHandle] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [snapchatHandle, setSnapchatHandle] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("cars");
  const [cars, setCars] = useState<CarRow[]>([]);
  const [carsLoading, setCarsLoading] = useState(false);
  const [carsError, setCarsError] = useState<string | null>(null);
  const [showAddCar, setShowAddCar] = useState(false);
  const [addingCar, setAddingCar] = useState(false);
  const [carYear, setCarYear] = useState("");
  const [carMake, setCarMake] = useState("");
  const [carModel, setCarModel] = useState("");
  const [carTrim, setCarTrim] = useState("");
  const [carColor, setCarColor] = useState("");
  const [carDescription, setCarDescription] = useState("");
  const [carPhotoUrl, setCarPhotoUrl] = useState<string | null>(null);
  const [carPhotoUploading, setCarPhotoUploading] = useState(false);
  const [carIsPrimary, setCarIsPrimary] = useState(false);
  const [editingCarId, setEditingCarId] = useState<string | null>(null);
  const [deletingCarId, setDeletingCarId] = useState<string | null>(null);
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [customizationLoading, setCustomizationLoading] = useState(false);
  const [customizationSavingColor, setCustomizationSavingColor] = useState<string | null>(null);
  const [goingMeets, setGoingMeets] = useState<any[]>([]);
  const [meetsLoading, setMeetsLoading] = useState(false);
  const [meetsError, setMeetsError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [saving, setSaving] = useState(false);
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

  // Load email once (auth metadata)
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

  // 1) Prefer cached profile from provider
  // 2) If missing, ensure it exists in DB then refresh provider cache
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setError(null);

      if (!myUserId) {
        setProfile(null);
        setLoadingLocal(false);
        return;
      }

      // If provider already has it, use it immediately
      const cached = profilesById?.[myUserId] as ProfileRow | undefined;
      if (cached) {
        if (!cancelled) {
          setProfile(cached);
          setUsername(cached.username ?? "");
          setDisplayName(cached.display_name ?? "");
          setPhotoUrl(cached.photo_url ?? null);
          setLocationVis(cached.location_visibility ?? "everyone");
          setBio(cached.bio ?? "");
          setBannerUrl(cached.banner_url ?? null);
          setInstagramHandle(cached.instagram_handle ?? "");
          setTiktokHandle(cached.tiktok_handle ?? "");
          setTwitterHandle(cached.twitter_handle ?? "");
          setSnapchatHandle(cached.snapchat_handle ?? "");
          setCity(cached.city ?? null);
          setState(cached.state ?? null);
          setLoadingLocal(false);
        }
        return;
      }

      // Otherwise: create/fetch just my profile row, then refresh provider cache
      try {
        setLoadingLocal(true);
        const row = (await ensureMinimalProfileExists(myUserId)) as ProfileRow;

        if (cancelled) return;

        // Set local immediately
        setProfile(row);
        setUsername(row.username ?? "");
        setDisplayName(row.display_name ?? "");
        setPhotoUrl(row.photo_url ?? null);
        setLocationVis(row.location_visibility ?? "everyone");
        setBio(row.bio ?? "");
        setBannerUrl(row.banner_url ?? null);
        setInstagramHandle(row.instagram_handle ?? "");
        setTiktokHandle(row.tiktok_handle ?? "");
        setTwitterHandle(row.twitter_handle ?? "");
        setSnapchatHandle(row.snapchat_handle ?? "");
        setCity(row.city ?? null);
        setState(row.state ?? null);

        // Ask provider to reload its cache (friends + nearby + profiles)
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
  }, [myUserId, profilesById, refresh]);

  useEffect(() => {
    if (!profile) return;

    const shouldForceEdit =
      params.onboarding === "1" || !hasMapProfileData(profile);

    if (shouldForceEdit) {
      setEditing(true);
    }
  }, [params.onboarding, profile]);

  useFocusEffect(
    useCallback(() => {
      if (!myUserId) return;
      void refresh(myUserId);
    }, [myUserId, refresh])
  );

  const loadCars = useCallback(async () => {
    if (!myUserId) return;
    setCarsLoading(true);
    setCarsError(null);

    const { data, error: loadErr } = await supabase
      .from("cars")
      .select(
        "id, user_id, make, model, year, trim, color, description, photo_url, is_primary"
      )
      .eq("user_id", myUserId)
      .order("is_primary", { ascending: false })
      .order("year", { ascending: false, nullsFirst: false });

    if (loadErr) {
      setCarsError(loadErr.message);
      setCars([]);
      setCarsLoading(false);
      return;
    }

    setCars((data ?? []) as CarRow[]);
    setCarsLoading(false);
  }, [myUserId]);

  useEffect(() => {
    if (activeTab !== "cars") return;
    void loadCars();
  }, [activeTab, loadCars]);

  const loadGoingMeets = useCallback(async () => {
    if (!myUserId) return;
    setMeetsLoading(true);
    setMeetsError(null);
    const { data, error: loadErr } = await supabase
      .from("meet_attendees")
      .select("meet_id, meets:meets!meet_attendees_meet_id_fkey(id, title, description, location_name, start_time, status)")
      .eq("user_id", myUserId)
      .eq("status", "going")
      .order("start_time", { ascending: true, foreignTable: "meets" });
    if (loadErr) {
      setMeetsError(loadErr.message);
      setGoingMeets([]);
      setMeetsLoading(false);
      return;
    }
    setGoingMeets(data ?? []);
    setMeetsLoading(false);
  }, [myUserId]);

  useEffect(() => {
    if (activeTab !== "meets") return;
    void loadGoingMeets();
  }, [activeTab, loadGoingMeets]);

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

  useEffect(() => {
    if (!myUserId) return;
    void loadMembership();
  }, [myUserId, loadMembership]);

  useEffect(() => {
    if (activeTab !== "membership") return;
    void loadMembership();
  }, [activeTab, loadMembership]);

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

    if (loadErr) {
      setCustomizationLoading(false);
      return;
    }

    setAccentColor(data?.accent_color || DEFAULT_ACCENT_COLOR);
    setCustomizationLoading(false);
  }, [myUserId]);

  useEffect(() => {
    if (!myUserId) return;
    void loadCustomization();
  }, [myUserId, loadCustomization]);

  // -----------------------------
  // Pick + upload avatar
  // -----------------------------
  async function pickImage() {
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

    if (result.canceled) return;

    const asset = result.assets[0];

    try {
      const uploadedUrl = await uploadAvatar(asset);
      setPhotoUrl(uploadedUrl);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Unknown error");
    }
  }

  async function uploadAvatar(
    asset: ImagePicker.ImagePickerAsset
  ): Promise<string> {
    if (!myUserId) throw new Error("No user id");

    return uploadImageToStorage(asset, "avatars", `${myUserId}`);
  }

  async function uploadImageToStorage(
    asset: ImagePicker.ImagePickerAsset,
    bucket: string,
    pathPrefix: string
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

  async function uploadImageToStoragePath(
    asset: ImagePicker.ImagePickerAsset,
    bucket: string,
    path: string
  ): Promise<string> {
    const contentType = asset.mimeType || "image/jpeg";
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

  async function pickCarImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Permission needed", "We need access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]) return;

    try {
      if (!myUserId) throw new Error("No user id");
      setCarPhotoUploading(true);
      const uploadedUrl = editingCarId
        ? await uploadImageToStoragePath(
            result.assets[0],
            "avatars",
            `${myUserId}/cars/${editingCarId}.jpg`
          )
        : await uploadImageToStorage(result.assets[0], "avatars", `${myUserId}/cars`);
      setCarPhotoUrl(uploadedUrl);
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Unknown error");
    } finally {
      setCarPhotoUploading(false);
    }
  }

  // -----------------------------
  // Editing state
  // -----------------------------
  function cancelEditing() {
    if (profile) {
      setUsername(profile.username ?? "");
      setDisplayName(profile.display_name ?? "");
      setPhotoUrl(profile.photo_url ?? null);
      setLocationVis(profile.location_visibility ?? "everyone");
      setBio(profile.bio ?? "");
      setInstagramHandle(profile.instagram_handle ?? "");
      setTiktokHandle(profile.tiktok_handle ?? "");
      setTwitterHandle(profile.twitter_handle ?? "");
      setSnapchatHandle(profile.snapchat_handle ?? "");
      setCity(profile.city ?? null);
      setState(profile.state ?? null);
    }
    setEditing(false);
  }

  async function saveProfile() {
    if (!myUserId) return;

    setSaving(true);
    setError(null);

    const payload = {
      username: username.trim() || null,
      display_name: displayName.trim() || null,
      photo_url: photoUrl || null,
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

    // Update local immediately
    setProfile(data);
    setBio(data.bio ?? "");
    setBannerUrl(data.banner_url ?? null);
    setInstagramHandle(data.instagram_handle ?? "");
    setTiktokHandle(data.tiktok_handle ?? "");
    setTwitterHandle(data.twitter_handle ?? "");
    setSnapchatHandle(data.snapchat_handle ?? "");
    setCity(data.city ?? null);
    setState(data.state ?? null);
    setEditing(false);

    // Refresh provider cache so Map markers/cards use new photo/name immediately
    await refresh(myUserId);


    setSaving(false);
  }


  function resetAddCarForm() {
    setCarYear("");
    setCarMake("");
    setCarModel("");
    setCarTrim("");
    setCarColor("");
    setCarDescription("");
    setCarPhotoUrl(null);
    setCarPhotoUploading(false);
    setCarIsPrimary(false);
    setEditingCarId(null);
  }

  function beginEditCar(car: CarRow) {
    setShowAddCar(true);
    setEditingCarId(car.id);
    setCarYear(car.year ? String(car.year) : "");
    setCarMake(car.make ?? "");
    setCarModel(car.model ?? "");
    setCarTrim(car.trim ?? "");
    setCarColor(car.color ?? "");
    setCarDescription(car.description ?? "");
    setCarPhotoUrl(car.photo_url ?? null);
    setCarIsPrimary(Boolean(car.is_primary));
  }

  async function saveCar() {
    if (!myUserId) return;
    if (!editingCarId && !isPremium && cars.length >= 1) {
      Alert.alert(
        "Premium feature",
        "Free members can add 1 car. Upgrade to Premium to add multiple cars."
      );
      return;
    }

    const parsedYear = Number.parseInt(carYear.trim(), 10);
    if (!carMake.trim() || !carModel.trim() || Number.isNaN(parsedYear)) {
      Alert.alert(
        "Missing info",
        "Please enter year, make, and model before saving."
      );
      return;
    }

    setAddingCar(true);
    setCarsError(null);

    const insertPayload = {
      year: parsedYear,
      make: carMake.trim(),
      model: carModel.trim(),
      trim: carTrim.trim() || null,
      color: carColor.trim() || null,
      description: carDescription.trim() || null,
      photo_url: carPhotoUrl,
      is_primary: carIsPrimary,
    };

    if (editingCarId) {
      const { error: updateErr } = await supabase
        .from("cars")
        .update(insertPayload)
        .eq("id", editingCarId)
        .eq("user_id", myUserId);

      if (updateErr) {
        setCarsError(updateErr.message || "Could not update car.");
        setAddingCar(false);
        return;
      }

      if (carIsPrimary) {
        await supabase
          .from("cars")
          .update({ is_primary: false })
          .eq("user_id", myUserId)
          .neq("id", editingCarId)
          .eq("is_primary", true);
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("cars")
        .insert({ ...insertPayload, user_id: myUserId })
        .select(
          "id, user_id, make, model, year, trim, color, description, photo_url, is_primary"
        )
        .single<CarRow>();

      if (insertErr || !inserted) {
        setCarsError(insertErr?.message ?? "Could not save car.");
        setAddingCar(false);
        return;
      }

      if (inserted.is_primary) {
        await supabase
          .from("cars")
          .update({ is_primary: false })
          .eq("user_id", myUserId)
          .neq("id", inserted.id)
          .eq("is_primary", true);
      }
    }

    setShowAddCar(false);
    resetAddCarForm();
    await loadCars();
    setAddingCar(false);
  }

  async function deleteCar(car: CarRow) {
    if (!myUserId) return;

    setDeletingCarId(car.id);
    setCarsError(null);

    const { error: deleteErr } = await supabase
      .from("cars")
      .delete()
      .eq("id", car.id)
      .eq("user_id", myUserId);

    if (!deleteErr) {
      await supabase.storage
        .from("avatars")
        .remove([`${myUserId}/cars/${car.id}.jpg`]);
    } else {
      setCarsError(deleteErr.message || "Could not delete car.");
    }

    if (editingCarId === car.id) {
      setShowAddCar(false);
      resetAddCarForm();
    }

    await loadCars();
    setDeletingCarId(null);
  }

  const loading = !profile && (loadingLocal || mapDataLoading);
  const hasLocation = Boolean(city || state);
  const locationText = [city, state].filter(Boolean).join(", ");
  const membershipPlan = membership?.plan ?? "free";
  const membershipStatus = membership?.status ?? "inactive";
  const isPremium = membershipPlan === "premium" && membershipStatus === "active";
  const canAddAnotherCar = isPremium || cars.length === 0 || Boolean(editingCarId);
  // Car CRUD is intentionally kept wired, but its main-list controls are hidden for the simplified Cars tab UI.
  const hiddenCarCrudState = {
    beginEditCar,
    deleteCar,
    canAddAnotherCar,
    deletingCarId,
  };
  void hiddenCarCrudState;
  const appliedAccentColor = isPremium ? accentColor : DEFAULT_ACCENT_COLOR;

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
        { onConflict: "user_id" }
      );

    if (upsertErr) {
      Alert.alert("Could not save color", upsertErr.message);
      setCustomizationSavingColor(null);
      return;
    }

    setAccentColor(nextColor);
    setCustomizationSavingColor(null);
  }

  function renderTabButton(label: string, tab: ProfileTab) {
    const selected = activeTab === tab;
    return (
      <Pressable
        key={tab}
        onPress={() => setActiveTab(tab)}
        style={[s.tabButton, selected && s.tabButtonActive]}
      >
        <Text style={[s.tabButtonText, selected && s.tabButtonTextActive]}>
          {label}
        </Text>
      </Pressable>
    );
  }

  function openSocialLink(url: string) {
    void Linking.openURL(url);
  }

  function normalizedHandle(handle: string | null | undefined) {
    return (handle ?? "").trim().replace(/^@/, "");
  }

  const socialLinks = [
    {
      key: "instagram",
      icon: "instagram",
      handle: normalizedHandle(profile?.instagram_handle ?? instagramHandle),
      url: (handle: string) => `https://instagram.com/${handle}`,
    },
    {
      key: "tiktok",
      icon: "music-note",
      handle: normalizedHandle(profile?.tiktok_handle ?? tiktokHandle),
      url: (handle: string) => `https://www.tiktok.com/@${handle}`,
    },
    {
      key: "twitter",
      icon: "twitter",
      handle: normalizedHandle(profile?.twitter_handle ?? twitterHandle),
      url: (handle: string) => `https://x.com/${handle}`,
    },
    {
      key: "snapchat",
      icon: "snapchat",
      handle: normalizedHandle(profile?.snapchat_handle ?? snapchatHandle),
      url: (handle: string) => `https://www.snapchat.com/add/${handle}`,
    },
  ].filter((social) => Boolean(social.handle));

  function renderCarsSection() {
    return (
      <View style={s.carsSection}>
        {showAddCar ? (
          <View style={s.addCarCard}>
            <View style={s.field}>
              <Text style={s.label}>Year *</Text>
              <TextInput
                value={carYear}
                onChangeText={setCarYear}
                keyboardType="number-pad"
                placeholder="2020"
                style={s.input}
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Make *</Text>
              <TextInput
                value={carMake}
                onChangeText={setCarMake}
                placeholder="Honda"
                style={s.input}
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Model *</Text>
              <TextInput
                value={carModel}
                onChangeText={setCarModel}
                placeholder="Civic"
                style={s.input}
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Trim</Text>
              <TextInput
                value={carTrim}
                onChangeText={setCarTrim}
                placeholder="Sport"
                style={s.input}
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Color</Text>
              <TextInput
                value={carColor}
                onChangeText={setCarColor}
                placeholder="Blue"
                style={s.input}
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Description</Text>
              <TextInput
                value={carDescription}
                onChangeText={setCarDescription}
                placeholder="Notes about the build"
                multiline
                style={[s.input, s.textarea]}
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Car Photo</Text>
              {carPhotoUrl ? (
                <Image source={{ uri: carPhotoUrl }} style={s.addCarPhotoPreview} />
              ) : null}
              <Pressable
                onPress={pickCarImage}
                disabled={carPhotoUploading}
                style={[s.secondaryBtn, carPhotoUploading && { opacity: 0.7 }]}
              >
                {carPhotoUploading ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={s.secondaryBtnText}>
                    {carPhotoUrl ? "Change Photo" : "Choose Photo"}
                  </Text>
                )}
              </Pressable>
            </View>

            <Pressable
              onPress={() => setCarIsPrimary((prev) => !prev)}
              style={[
                s.primaryToggle,
                carIsPrimary && s.primaryToggleActive,
              ]}
            >
              <Text
                style={[
                  s.primaryToggleText,
                  carIsPrimary && s.primaryToggleTextActive,
                ]}
              >
                {carIsPrimary
                  ? "Primary car: Yes"
                  : "Set as primary car"}
              </Text>
            </Pressable>

            <Pressable
              onPress={saveCar}
              disabled={addingCar}
              style={[s.primaryBtn, addingCar && { opacity: 0.7 }]}
            >
              {addingCar ? (
                <ActivityIndicator />
              ) : (
                <Text style={s.primaryBtnText}>
                  {editingCarId ? "Update Car" : "Save Car"}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {carsError ? <Text style={s.error}>{carsError}</Text> : null}

        {carsLoading ? (
          <View style={s.carsLoadingWrap}>
            <ActivityIndicator />
            <Text style={s.placeholderText}>Loading cars…</Text>
          </View>
        ) : cars.length === 0 ? (
          <Text style={s.placeholderText}>No cars added yet.</Text>
        ) : (
          cars.map((car) => {
            const carTitle = [car.year, car.make, car.model]
              .filter(Boolean)
              .join(" ")
              .trim() || "Untitled car";
            const carDetails = [
              car.color,
              car.trim,
              car.is_primary ? "Primary" : null,
            ]
              .filter(Boolean)
              .join(" • ");

            return (
              <View key={car.id} style={s.carCard}>
                <View style={s.carImageWrap}>
                  {car.photo_url ? (
                    <Image source={{ uri: car.photo_url }} style={s.carImage} />
                  ) : (
                    <View style={s.carImagePlaceholder}>
                      <Text style={s.carPlaceholderText}>No photo</Text>
                    </View>
                  )}
                  <View style={s.carImageOverlay} />
                  <Text style={s.carImageTitle}>{carTitle}</Text>
                </View>

                <View style={s.carContent}>
                  {car.description ? (
                    <Text style={s.carDescription}>{car.description}</Text>
                  ) : null}
                  {carDetails ? <Text style={s.carMeta}>{carDetails}</Text> : null}
                </View>
              </View>
            );
          })
        )}
      </View>
    );
  }



  function renderMeetsSection() {
    return (
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>Meets Going</Text>
        {meetsError ? <Text style={s.error}>{meetsError}</Text> : null}
        {meetsLoading ? (
          <View style={s.carsLoadingWrap}>
            <ActivityIndicator />
            <Text style={s.placeholderText}>Loading meets…</Text>
          </View>
        ) : goingMeets.length === 0 ? (
          <Text style={s.placeholderText}>You are not marked as going to any meets yet.</Text>
        ) : (
          goingMeets.map((entry) => (
            <View key={entry.meet_id} style={s.meetCard}>
              <Text style={s.carTitle}>{entry.meets?.title || "Untitled meet"}</Text>
              {entry.meets?.location_name ? <Text style={s.carMeta}>{entry.meets.location_name}</Text> : null}
              {entry.meets?.start_time ? <Text style={s.carMeta}>{new Date(entry.meets.start_time).toLocaleString()}</Text> : null}
              {entry.meets?.description ? <Text style={s.carMeta}>{entry.meets.description}</Text> : null}
            </View>
          ))
        )}
      </View>
    );
  }

  function renderSettingsSection() {
    return (
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>Settings</Text>
        <View style={s.field}>
          <Text style={s.label}>Profile photo</Text>
          <View style={s.settingsPhotoRow}>
            <View style={[s.settingsPhotoWrap, { borderColor: appliedAccentColor }]}>
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={s.settingsPhotoPreview} />
              ) : (
                <View style={[s.settingsPhotoPreview, s.avatarFallback]}>
                  <Text style={s.avatarInitials}>{initials || "?"}</Text>
                </View>
              )}
            </View>
            {editing ? (
              <Pressable onPress={pickImage} style={s.secondaryBtn}>
                <Text style={s.secondaryBtnText}>Change photo</Text>
              </Pressable>
            ) : (
              <Text style={s.placeholderText}>Tap Start Editing to change your photo.</Text>
            )}
          </View>
        </View>

        {/* Username */}
        <View style={s.field}>
          <Text style={s.label}>Username</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="username"
            editable={editing}
            style={[s.input, !editing && s.inputDisabled]}
          />
        </View>

        {/* Display Name */}
        <View style={s.field}>
          <Text style={s.label}>Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            editable={editing}
            style={[s.input, !editing && s.inputDisabled]}
          />
        </View>

        {/* Bio */}
        <View style={s.field}>
          <Text style={s.label}>Bio</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Tell people about yourself"
            editable={editing}
            multiline
            style={[s.input, s.textarea, !editing && s.inputDisabled]}
          />
        </View>

        {/* Location Visibility */}
        <View style={s.field}>
          <Text style={s.label}>Location visibility</Text>

          {!editing ? (
            <View style={s.readonlyBox}>
              <Text style={s.readonlyText}>{locationVis || "everyone"}</Text>
            </View>
          ) : (
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
                      (savingThis || customizationLoading) && { opacity: 0.7 },
                    ]}
                  >
                    {selected ? <Text style={s.accentSwatchCheck}>✓</Text> : null}
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

        <View style={s.field}>
          <Text style={s.label}>Social handles</Text>
          {isPremium ? (
            <>
              <TextInput
                value={instagramHandle}
                onChangeText={setInstagramHandle}
                placeholder="Instagram handle"
                editable={editing}
                style={[s.input, !editing && s.inputDisabled]}
                autoCapitalize="none"
                placeholderTextColor="#9ca3af"
              />
              <TextInput
                value={tiktokHandle}
                onChangeText={setTiktokHandle}
                placeholder="TikTok handle"
                editable={editing}
                style={[s.input, s.socialInput, !editing && s.inputDisabled]}
                autoCapitalize="none"
                placeholderTextColor="#9ca3af"
              />
              <TextInput
                value={twitterHandle}
                onChangeText={setTwitterHandle}
                placeholder="Twitter/X handle"
                editable={editing}
                style={[s.input, s.socialInput, !editing && s.inputDisabled]}
                autoCapitalize="none"
                placeholderTextColor="#9ca3af"
              />
              <TextInput
                value={snapchatHandle}
                onChangeText={setSnapchatHandle}
                placeholder="Snapchat handle"
                editable={editing}
                style={[s.input, s.socialInput, !editing && s.inputDisabled]}
                autoCapitalize="none"
                placeholderTextColor="#9ca3af"
              />
            </>
          ) : (
            <Text style={s.placeholderText}>
              Premium required to add social handles. Upgrade to unlock this section.
            </Text>
          )}
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <View style={s.btnRow}>
          {!editing ? (
            <Pressable
              onPress={() => setEditing(true)}
              style={s.primaryBtn}
            >
              <Text style={s.primaryBtnText}>Start Editing</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={saveProfile}
                disabled={saving}
                style={[s.primaryBtn, saving && { opacity: 0.7 }]}
              >
                {saving ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={s.primaryBtnText}>Save</Text>
                )}
              </Pressable>

              <Pressable onPress={cancelEditing} style={s.secondaryBtn}>
                <Text style={s.secondaryBtnText}>Cancel</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  // -----------------------------
  // UI
  // -----------------------------
  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading profile…</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={s.center}>
        <Text>Profile not found.</Text>
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
        contentContainerStyle={s.container}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
      >
        <View style={s.bannerWrap}>
          <Image
            source={{
              uri:
                bannerUrl ||
                "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1400&q=80",
            }}
            style={s.bannerImage}
          />
          <View style={s.bannerFadeOverlay} pointerEvents="none" />
        </View>
        <View style={s.headerTextWrap}>
          <View style={s.heroIdentityRow}>
            <View
              style={[
                s.avatarWrap,
                { borderColor: appliedAccentColor },
              ]}
            >
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarFallback]}>
                  <Text style={s.avatarInitials}>{initials || "?"}</Text>
                </View>
              )}
            </View>

            <View style={s.identityTextWrap}>
              <View style={s.displayNameRow}>
                <Text style={s.displayNameText}>
                  {displayName.trim() || "No display name"}
                </Text>
                {isPremium ? (
                  <View style={s.premiumBadge}>
                    <Text style={s.premiumBadgeText}>✓</Text>
                  </View>
                ) : null}
              </View>
              <Text style={s.usernameText}>
                @{username.trim() || "username"}
              </Text>
            </View>
          </View>

          {bio.trim() ? <Text style={s.bioText}>{bio}</Text> : null}
          {hasLocation ? <Text style={s.locationText}>{locationText}</Text> : null}
          {socialLinks.length > 0 ? (
            <View style={s.socialIconsRow}>
              {socialLinks.map((social) => (
                <Pressable
                  key={social.key}
                  onPress={() => openSocialLink(social.url(social.handle))}
                  style={s.socialIconButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${social.key}`}
                >
                  <MaterialCommunityIcons
                    name={social.icon as any}
                    size={20}
                    color="#fff"
                  />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>


        <View style={s.tabRow}>
          {renderTabButton("Cars", "cars")}
          {renderTabButton("Meets", "meets")}
        </View>

        {activeTab === "cars" && renderCarsSection()}
        {activeTab === "meets" && renderMeetsSection()}
        {editing ? renderSettingsSection() : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
