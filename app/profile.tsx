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
import { useCallback, useMemo, useState } from "react";

import { colors } from "../styles/themes";
import s from "@/styles/profilestyles";
import { supabase } from "../database/supabase";
import { useFocusEffect } from "@react-navigation/native";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  photo_url: string | null;
  location_visibility: string | null;
  created_at: string;
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [locationVis, setLocationVis] = useState("everyone");

  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
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

  // -----------------------------
  // Load profile when screen is focused
  // -----------------------------
  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      setError(userErr?.message ?? "Not signed in.");
      setProfile(null);
      setLoading(false);
      return;
    }

    const user = userRes.user;
    setEmail(user.email ?? null);

    let { data, error: selErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    let row = data ?? null;

    // If no row → create one
    if (!row) {
      const insertPayload = {
        id: user.id,
        username: user.email ? user.email.split("@")[0] : null,
        display_name: null,
        photo_url: null,
        location_visibility: "everyone",
      };

      const { data: inserted, error: insErr } = await supabase
        .from("profiles")
        .insert(insertPayload)
        .select("*")
        .single<ProfileRow>();

      if (insErr) {
        setError(insErr.message);
        setLoading(false);
        return;
      }

      row = inserted;
    }

    // Set state
    if (row) {
      setProfile(row);
      setUsername(row.username ?? "");
      setDisplayName(row.display_name ?? "");
      setPhotoUrl(row.photo_url ?? null);
      setLocationVis(row.location_visibility ?? "everyone");
    }

    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

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
    if (!profile?.id) throw new Error("No user id");

    const ext =
      asset.fileName?.split(".").pop() || asset.uri.split(".").pop() || "jpg";

    const path = `${profile.id}/${Date.now()}.${ext}`;

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
      .from("avatars")
      .upload(path, arrayBuffer, {
        contentType,
        upsert: true,
      });

    if (upErr) throw upErr;

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  }

  // -----------------------------
  // Editing state
  // -----------------------------
  function startEditing() {
    setEditing(true);
  }

  function cancelEditing() {
    if (profile) {
      setUsername(profile.username ?? "");
      setDisplayName(profile.display_name ?? "");
      setPhotoUrl(profile.photo_url ?? null);
      setLocationVis(profile.location_visibility ?? "everyone");
    }
    setEditing(false);
  }

  async function saveProfile() {
    if (!profile?.id) return;

    setSaving(true);
    setError(null);

    const payload = {
      username: username.trim() || null,
      display_name: displayName.trim() || null,
      photo_url: photoUrl || null,
      location_visibility: locationVis || null,
    };

    const { data, error: upErr } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", profile.id)
      .select("*")
      .single<ProfileRow>();

    if (upErr) {
      setError(upErr.message);
      setSaving(false);
      return;
    }

    setProfile(data);
    setEditing(false);
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
    } finally {
      setSigningOut(false);
    }
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
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={s.container}>
        {/* Avatar */}
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

        {/* Email */}
        <View style={s.field}>
          <Text style={s.label}>Email</Text>
          <View style={s.readonlyBox}>
            <Text style={s.readonlyText}>{email ?? "—"}</Text>
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

        {/* Buttons */}
        <View style={s.btnRow}>
          {!editing ? (
            <>
              <Pressable onPress={startEditing} style={s.primaryBtn}>
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
            </>
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
