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

import s from "@/styles/profilestyles";
import { supabase } from "../database/supabase";
import { useMapData } from "@/components/MapDataProvider";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import {
  ensureMembershipExistsForProfile,
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
  created_at?: string;
  onboarded?: boolean | null;
};

type ProfileTab = "about" | "cars" | "membership" | "settings";

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

export default function ProfileScreen() {
  const router = useRouter();
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
  const [city, setCity] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>("about");
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
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
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
      setActiveTab("settings");
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

  const loadMembership = useCallback(async () => {
    if (!myUserId) {
      setMembership(null);
      return;
    }

    setMembershipLoading(true);
    setMembershipError(null);

    try {
      const data = await ensureMembershipExistsForProfile(myUserId);
      setMembership((data ?? null) as MembershipRow | null);
      setMembershipLoading(false);
    } catch (loadErr: any) {
      setMembership(null);
      setMembershipError(loadErr?.message ?? "Failed to load membership.");
      setMembershipLoading(false);
    }
  }, [myUserId]);

  useEffect(() => {
    if (activeTab !== "membership") return;
    void loadMembership();
  }, [activeTab, loadMembership]);

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
    setCity(data.city ?? null);
    setState(data.state ?? null);
    setEditing(false);

    // Refresh provider cache so Map markers/cards use new photo/name immediately
    await refresh(myUserId);


    setSaving(false);
  }

  // -----------------------------
  // Sign out
  // -----------------------------
  async function handleSignOut() {
    try {
      setSigningOut(true);
      await supabase.auth.signOut();
      setProfile(null);
      router.replace("/");
    } finally {
      setSigningOut(false);
    }
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
  const membershipStatus = membership?.status ?? "active";
  const isPremium = membershipPlan === "premium";

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

  function renderAboutSection() {
    return (
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>About</Text>
        <View style={s.field}>
          <Text style={s.label}>Email</Text>
          <View style={s.readonlyBox}>
            <Text style={s.readonlyText}>{email ?? "—"}</Text>
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Bio</Text>
          <View style={s.readonlyBox}>
            <Text style={s.readonlyText}>{bio.trim() || "No bio yet."}</Text>
          </View>
        </View>

        <View style={s.field}>
          <Text style={s.label}>Location visibility</Text>
          <View style={s.readonlyBox}>
            <Text style={s.readonlyText}>{locationVis || "everyone"}</Text>
          </View>
        </View>
      </View>
    );
  }

  function renderMembershipSection() {
    return (
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>Membership</Text>

        {membershipError ? <Text style={s.error}>{membershipError}</Text> : null}

        {membershipLoading ? (
          <View style={s.carsLoadingWrap}>
            <ActivityIndicator />
            <Text style={s.placeholderText}>Loading membership…</Text>
          </View>
        ) : (
          <>
            <View style={s.field}>
              <Text style={s.label}>Current plan</Text>
              <View style={s.readonlyBox}>
                <Text style={s.readonlyText}>{membershipPlan}</Text>
              </View>
            </View>

            <View style={s.field}>
              <Text style={s.label}>Status</Text>
              <View style={s.readonlyBox}>
                <Text style={s.readonlyText}>{membershipStatus}</Text>
              </View>
            </View>

            {!isPremium ? (
              <Pressable style={s.primaryBtn}>
                <Text style={s.primaryBtnText}>Upgrade to Premium</Text>
              </Pressable>
            ) : (
              <Text style={s.placeholderText}>
                You are on Premium. More membership perks are coming soon.
              </Text>
            )}
          </>
        )}
      </View>
    );
  }

  function renderCarsSection() {
    return (
      <View style={s.sectionCard}>
        <View style={s.carsHeaderRow}>
          <Text style={s.sectionTitle}>Cars</Text>
          <Pressable
            onPress={() => {
              if (showAddCar) {
                setShowAddCar(false);
                resetAddCarForm();
                return;
              }
              setShowAddCar(true);
            }}
            style={s.secondaryBtn}
          >
            <Text style={s.secondaryBtnText}>
              {showAddCar ? "Cancel" : "Add Car"}
            </Text>
          </Pressable>
        </View>

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
          <Text style={s.placeholderText}>
            No cars added yet. Tap Add Car to add your first one.
          </Text>
        ) : (
          cars.map((car) => (
            <View key={car.id} style={s.carCard}>
              {car.photo_url ? (
                <Image source={{ uri: car.photo_url }} style={s.carImage} />
              ) : null}

              <Text style={s.carTitle}>
                {[car.year, car.make, car.model]
                  .filter(Boolean)
                  .join(" ")
                  .trim() || "Untitled car"}
              </Text>
              {car.color ? (
                <Text style={s.carMeta}>Color: {car.color}</Text>
              ) : null}
              {car.trim ? (
                <Text style={s.carMeta}>Trim: {car.trim}</Text>
              ) : null}
              {car.description ? (
                <Text style={s.carMeta}>Description: {car.description}</Text>
              ) : null}
              <Text style={s.carMeta}>
                {car.is_primary ? "Primary car" : "Secondary car"}
              </Text>
              <View style={s.carActionsRow}>
                <Pressable
                  onPress={() => beginEditCar(car)}
                  style={[s.secondaryBtn, s.carActionBtn]}
                >
                  <Text style={s.secondaryBtnText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert(
                      "Delete car?",
                      "This action cannot be undone.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => {
                            void deleteCar(car);
                          },
                        },
                      ]
                    )
                  }
                  disabled={deletingCarId === car.id}
                  style={[
                    s.secondaryBtn,
                    s.carActionBtn,
                    deletingCarId === car.id && { opacity: 0.7 },
                  ]}
                >
                  {deletingCarId === car.id ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={s.secondaryBtnText}>Delete</Text>
                  )}
                </Pressable>
              </View>
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
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={s.container}>
        {/* Profile Header */}
        <Pressable
          onPress={editing ? pickImage : undefined}
          style={({ pressed }) => [
            s.avatarWrap,
            pressed && editing ? { opacity: 0.8 } : null,
          ]}
        >
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={s.avatar} />
          ) : (
            <View style={[s.avatar, s.avatarFallback]}>
              <Text style={s.avatarInitials}>{initials || "?"}</Text>
            </View>
          )}
          {editing && <Text style={s.changePhoto}>Change photo</Text>}
        </Pressable>

        <View style={s.headerTextWrap}>
          <Text style={s.displayNameText}>
            {displayName.trim() || "No display name"}
          </Text>
          <Text style={s.usernameText}>@{username.trim() || "username"}</Text>
          {bio.trim() ? <Text style={s.bioText}>{bio}</Text> : null}
          {hasLocation ? <Text style={s.locationText}>{locationText}</Text> : null}
        </View>

        <View style={s.headerActions}>
          <Pressable
            onPress={() => {
              setEditing(true);
              setActiveTab("settings");
            }}
            style={s.primaryBtn}
          >
            <Text style={s.primaryBtnText}>Edit Profile</Text>
          </Pressable>

          <Pressable
            onPress={handleSignOut}
            disabled={signingOut}
            style={[s.secondaryBtn, signingOut && { opacity: 0.7 }]}
          >
            {signingOut ? (
              <ActivityIndicator />
            ) : (
              <Text style={s.secondaryBtnText}>Sign Out</Text>
            )}
          </Pressable>
        </View>

        <View style={s.tabRow}>
          {renderTabButton("About", "about")}
          {renderTabButton("Cars", "cars")}
          {renderTabButton("Membership", "membership")}
          {renderTabButton("Settings", "settings")}
        </View>

        {activeTab === "about" && renderAboutSection()}
        {activeTab === "cars" && renderCarsSection()}
        {activeTab === "membership" && renderMembershipSection()}
        {activeTab === "settings" && renderSettingsSection()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
