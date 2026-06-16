import * as Location from "expo-location";

import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/styles/themes";
import { useMapData } from "@/components/MapDataProvider";
import { supabase } from "@/database/supabase";
import styles from "@/styles/homestyles";

type MembershipRow = {
  id: string;
  user_id: string;
  plan: "free" | "premium";
  status: "active" | "inactive" | "cancelled" | "past_due" | "trialing";
};

function defaultStartValue() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return date.toISOString().slice(0, 16);
}

function parseDateInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return null;

  return parsed.toISOString();
}

export default function CreateScreen() {
  const { myUserId, refreshMeets } = useMapData();

  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [startTime, setStartTime] = useState(defaultStartValue);
  const [endTime, setEndTime] = useState("");
  const [maxAttendees, setMaxAttendees] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const membershipPlan = membership?.plan ?? "free";
  const membershipStatus = membership?.status ?? "inactive";
  const isPremium = membershipPlan === "premium" && membershipStatus === "active";

  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        const { data } = await supabase.auth.getUser();
        if (active && !data.user) {
          router.replace("/auth?redirectTo=/create");
        }
      })();

      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    let cancelled = false;

    async function loadMembership() {
      if (!myUserId) {
        setMembership(null);
        setMembershipLoading(false);
        return;
      }

      setMembershipLoading(true);
      const { data, error: loadErr } = await supabase
        .from("user_memberships")
        .select("id, user_id, plan, status")
        .eq("user_id", myUserId)
        .maybeSingle<MembershipRow>();

      if (cancelled) return;

      if (loadErr) {
        setMembership(null);
      } else {
        setMembership(data ?? null);
      }

      setMembershipLoading(false);
    }

    void loadMembership();

    return () => {
      cancelled = true;
    };
  }, [myUserId]);

  const canSubmit = useMemo(() => {
    return (
      Boolean(title.trim()) &&
      Boolean(locationName.trim()) &&
      Boolean(latitude.trim()) &&
      Boolean(longitude.trim()) &&
      Boolean(startTime.trim()) &&
      !saving
    );
  }, [latitude, locationName, longitude, saving, startTime, title]);

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Location needed", "Allow location access to use your current spot.");
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLatitude(String(pos.coords.latitude));
      setLongitude(String(pos.coords.longitude));
      if (!locationName.trim()) setLocationName("Current location");
    } catch (e: any) {
      Alert.alert("Could not get location", e?.message ?? "Try again.");
    } finally {
      setLocating(false);
    }
  }

  async function createMeet() {
    if (!myUserId || !isPremium) return;

    setError(null);

    const parsedStart = parseDateInput(startTime);
    const parsedEnd = endTime.trim() ? parseDateInput(endTime) : null;
    const parsedLat = Number(latitude.trim());
    const parsedLng = Number(longitude.trim());
    const parsedMax = maxAttendees.trim() ? Number.parseInt(maxAttendees.trim(), 10) : null;

    if (!title.trim() || !locationName.trim()) {
      setError("Title and location name are required.");
      return;
    }

    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      setError("Latitude and longitude are required.");
      return;
    }

    if (!parsedStart) {
      setError("Start time must look like 2026-06-15T19:00.");
      return;
    }

    if (endTime.trim() && !parsedEnd) {
      setError("End time must look like 2026-06-15T21:00.");
      return;
    }

    if (parsedMax !== null && (!Number.isFinite(parsedMax) || parsedMax <= 0)) {
      setError("Max attendees must be a positive number.");
      return;
    }

    setSaving(true);

    const { data, error: insertErr } = await supabase
      .from("meets")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        cover_image_url: null,
        location_name: locationName.trim(),
        address: address.trim() || null,
        latitude: parsedLat,
        longitude: parsedLng,
        start_time: parsedStart,
        end_time: parsedEnd,
        created_by: myUserId,
        is_public: isPublic,
        max_attendees: parsedMax,
        status: "upcoming",
      })
      .select("id, latitude, longitude")
      .single<{ id: string; latitude: number; longitude: number }>();

    if (insertErr || !data) {
      setError(insertErr?.message ?? "Could not create meet.");
      setSaving(false);
      return;
    }

    await refreshMeets(myUserId);
    setSaving(false);

    router.navigate({
      pathname: "/map",
      params: {
        focusMeetId: data.id,
        latitude: String(data.latitude),
        longitude: String(data.longitude),
      },
    });
  }

  if (!myUserId || membershipLoading) {
    return (
      <View style={styles.createPlaceholderContainer}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!isPremium) {
    return (
      <View style={styles.createPremiumScreen}>
        <View style={styles.createPremiumCard}>
          <View style={styles.createPremiumIconWrap}>
            <MaterialCommunityIcons name="calendar-star" size={30} color={colors.primary} />
          </View>
          <Text style={styles.createPremiumTitle}>Create meets with Premium</Text>
          <Text style={styles.createPremiumSubtitle}>
            Host cruises, parking lot hangs, cars and coffee runs, and invite the local scene to pull up.
          </Text>

          <View style={styles.createPremiumFeatureList}>
            <View style={styles.createPremiumFeatureRow}>
              <MaterialCommunityIcons name="map-marker-plus" size={19} color={colors.primary} />
              <Text style={styles.createPremiumFeatureText}>Drop public meet pins on the map</Text>
            </View>
            <View style={styles.createPremiumFeatureRow}>
              <MaterialCommunityIcons name="account-group" size={19} color={colors.primary} />
              <Text style={styles.createPremiumFeatureText}>Track Going and Interested drivers</Text>
            </View>
            <View style={styles.createPremiumFeatureRow}>
              <MaterialCommunityIcons name="palette-outline" size={19} color={colors.primary} />
              <Text style={styles.createPremiumFeatureText}>Unlock profile customizations and socials</Text>
            </View>
          </View>

          <Pressable style={styles.createPremiumButton}>
            <Text style={styles.createPremiumButtonText}>Upgrade to Premium</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.createScreen}
    >
      <ScrollView
        style={styles.createScroll}
        contentContainerStyle={styles.createContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.createHeader}>
          <Text style={styles.createTitle}>Create Meet</Text>
          <Text style={styles.createSubtitle}>
            Set the spot, time, and details so drivers can find it on the map.
          </Text>
        </View>

        <View style={styles.createFormCard}>
          <Text style={styles.createMeetFieldLabel}>Meet title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Cars and Coffee Lafayette"
            placeholderTextColor="#8a8a8a"
            style={styles.homeInput}
          />

          <Text style={styles.createMeetFieldLabel}>Location name</Text>
          <TextInput
            value={locationName}
            onChangeText={setLocationName}
            placeholder="Night Shift Garage"
            placeholderTextColor="#8a8a8a"
            style={styles.homeInput}
          />

          <Text style={styles.createMeetFieldLabel}>Address</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="5620 Johnston St, Lafayette, LA"
            placeholderTextColor="#8a8a8a"
            style={styles.homeInput}
          />

          <View style={styles.createTwoColumnRow}>
            <View style={styles.createTwoColumnField}>
              <Text style={styles.createMeetFieldLabel}>Latitude</Text>
              <TextInput
                value={latitude}
                onChangeText={setLatitude}
                placeholder="30.2241"
                placeholderTextColor="#8a8a8a"
                keyboardType="decimal-pad"
                style={styles.homeInput}
              />
            </View>
            <View style={styles.createTwoColumnField}>
              <Text style={styles.createMeetFieldLabel}>Longitude</Text>
              <TextInput
                value={longitude}
                onChangeText={setLongitude}
                placeholder="-92.0198"
                placeholderTextColor="#8a8a8a"
                keyboardType="decimal-pad"
                style={styles.homeInput}
              />
            </View>
          </View>

          <Pressable
            onPress={useCurrentLocation}
            disabled={locating}
            style={[styles.createSecondaryAction, locating && { opacity: 0.7 }]}
          >
            {locating ? (
              <ActivityIndicator />
            ) : (
              <>
                <MaterialCommunityIcons name="crosshairs-gps" size={18} color={colors.offwhite} />
                <Text style={styles.createSecondaryActionText}>Use current location</Text>
              </>
            )}
          </Pressable>

          <View style={styles.createTwoColumnRow}>
            <View style={styles.createTwoColumnField}>
              <Text style={styles.createMeetFieldLabel}>Start</Text>
              <TextInput
                value={startTime}
                onChangeText={setStartTime}
                placeholder="2026-06-15T19:00"
                placeholderTextColor="#8a8a8a"
                style={styles.homeInput}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.createTwoColumnField}>
              <Text style={styles.createMeetFieldLabel}>End optional</Text>
              <TextInput
                value={endTime}
                onChangeText={setEndTime}
                placeholder="2026-06-15T21:00"
                placeholderTextColor="#8a8a8a"
                style={styles.homeInput}
                autoCapitalize="none"
              />
            </View>
          </View>

          <Text style={styles.createMeetFieldLabel}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Bring the daily, the project, or whatever is running."
            placeholderTextColor="#8a8a8a"
            multiline
            style={[styles.homeInput, styles.createDescriptionInput]}
          />

          <View style={styles.createTwoColumnRow}>
            <View style={styles.createTwoColumnField}>
              <Text style={styles.createMeetFieldLabel}>Max attendees</Text>
              <TextInput
                value={maxAttendees}
                onChangeText={setMaxAttendees}
                placeholder="Optional"
                placeholderTextColor="#8a8a8a"
                keyboardType="number-pad"
                style={styles.homeInput}
              />
            </View>
            <View style={styles.createTwoColumnField}>
              <Text style={styles.createMeetFieldLabel}>Visibility</Text>
              <Pressable
                onPress={() => setIsPublic((prev) => !prev)}
                style={[styles.createVisibilityToggle, isPublic && styles.createVisibilityToggleActive]}
              >
                <MaterialCommunityIcons
                  name={isPublic ? "earth" : "lock-outline"}
                  size={18}
                  color={isPublic ? colors.black : colors.offwhite}
                />
                <Text
                  style={[
                    styles.createVisibilityToggleText,
                    isPublic && styles.createVisibilityToggleTextActive,
                  ]}
                >
                  {isPublic ? "Public" : "Private"}
                </Text>
              </Pressable>
            </View>
          </View>

          {error ? <Text style={styles.homeErrorText}>{error}</Text> : null}

          <Pressable
            onPress={createMeet}
            disabled={!canSubmit}
            style={[styles.createSubmitButton, !canSubmit && { opacity: 0.55 }]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createSubmitButtonText}>Create Meet</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
