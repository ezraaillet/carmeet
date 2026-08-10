import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";

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
import { useCallback, useMemo, useState } from "react";

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/styles/themes";
import { router } from "expo-router";
import styles from "@/styles/homestyles";
import { supabase } from "@/database/supabase";
import { useFocusEffect } from "@react-navigation/native";
import { useMapData } from "@/components/MapDataProvider";
import { useUserAccount } from "@/components/UserAccountProvider";

type MeetCoordinates = {
  latitude: number;
  longitude: number;
};

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultMeetDate() {
  return localDateKey(new Date());
}

function dateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(12, 0, 0, 0);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 12, 0, 0, 0);
}

function monthStartForKey(dateKey: string) {
  const date = dateFromKey(dateKey);
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function buildCalendarDays(monthDate: Date) {
  const firstOfMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth(),
    1,
    12,
    0,
    0,
    0,
  );
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const firstCalendarDay = addDays(firstOfMonth, -mondayOffset);
  return Array.from({ length: 42 }, (_unused, index) =>
    addDays(firstCalendarDay, index),
  );
}

function toDateKey(date: Date) {
  return localDateKey(date);
}

function combineDateAndTime(dateKey: string, timeValue: string) {
  const parsed = new Date(`${dateKey}T${timeValue}:00`);
  if (!Number.isFinite(parsed.getTime())) return null;

  return parsed.toISOString();
}

const TIME_OPTIONS = [
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

const CALENDAR_WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const END_TIME_OPTIONS = ["", ...TIME_OPTIONS];

function formatDateOption(dateKey: string) {
  return dateFromKey(dateKey).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeOption(value: string) {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CreateScreen() {
  const { myUserId, refreshMeets } = useMapData();
  const { account, isPremium, refreshAccount } = useUserAccount();
  const effectiveUserId = myUserId ?? account?.userId ?? null;

  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationName, setLocationName] = useState("");
  const [address, setAddress] = useState("");
  const [coordinates, setCoordinates] = useState<MeetCoordinates | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(defaultMeetDate);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    monthStartForKey(defaultMeetDate()),
  );
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("");
  const [openTimePicker, setOpenTimePicker] = useState<"start" | "end" | null>(
    null,
  );
  const [isDateTimePickerOpen, setIsDateTimePickerOpen] = useState(false);
  const [maxAttendees, setMaxAttendees] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const calendarDays = useMemo(
    () => buildCalendarDays(visibleMonth),
    [visibleMonth],
  );
  const calendarWeeks = useMemo(
    () =>
      Array.from({ length: 6 }, (_unused, index) =>
        calendarDays.slice(index * 7, index * 7 + 7),
      ),
    [calendarDays],
  );

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
    }, []),
  );

  const canSubmit = useMemo(() => {
    return (
      Boolean(title.trim()) &&
      Boolean(locationName.trim()) &&
      (Boolean(address.trim()) || Boolean(coordinates)) &&
      Boolean(selectedDate) &&
      Boolean(startTime.trim()) &&
      !saving &&
      !coverUploading
    );
  }, [
    address,
    coordinates,
    coverUploading,
    locationName,
    saving,
    selectedDate,
    startTime,
    title,
  ]);

  function resetCreateMeetForm() {
    const nextDefaultDate = defaultMeetDate();

    setTitle("");
    setDescription("");
    setLocationName("");
    setAddress("");
    setCoordinates(null);
    setCoverImageUrl(null);
    setSelectedDate(nextDefaultDate);
    setVisibleMonth(monthStartForKey(nextDefaultDate));
    setStartTime("19:00");
    setEndTime("");
    setOpenTimePicker(null);
    setIsDateTimePickerOpen(false);
    setMaxAttendees("");
    setIsPublic(true);
    setError(null);
  }
  async function uploadMeetCoverImage(
    asset: ImagePicker.ImagePickerAsset,
    userId: string,
  ) {
    const response = await fetch(asset.uri);
    const arrayBuffer = await response.arrayBuffer();
    const uriParts = asset.uri.split(".");
    const ext = uriParts.length > 1 ? uriParts.pop() || "jpg" : "jpg";
    const path = `${userId}/meets/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(path, arrayBuffer, {
        contentType: asset.mimeType ?? "image/jpeg",
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  }

  async function pickMeetCoverImage() {
    if (!effectiveUserId || coverUploading) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo library access to add a meet cover image.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    setCoverUploading(true);
    try {
      const uploadedUrl = await uploadMeetCoverImage(
        result.assets[0],
        effectiveUserId,
      );
      setCoverImageUrl(uploadedUrl);
    } catch (e: any) {
      Alert.alert("Could not upload cover", e?.message ?? "Try again.");
    } finally {
      setCoverUploading(false);
    }
  }
  async function useCurrentLocation() {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(
          "Location needed",
          "Allow location access to use your current spot.",
        );
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setCoordinates({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (!locationName.trim()) setLocationName("Current location");
    } catch (e: any) {
      Alert.alert("Could not get location", e?.message ?? "Try again.");
    } finally {
      setLocating(false);
    }
  }

  function pickDate(dateKey: string) {
    setSelectedDate(dateKey);
    setVisibleMonth(monthStartForKey(dateKey));
  }

  const todayKey = localDateKey(new Date());
  const tomorrowKey = toDateKey(addDays(new Date(), 1));
  const activeQuickDate =
    selectedDate === todayKey
      ? "today"
      : selectedDate === tomorrowKey
        ? "tomorrow"
        : "more";
  const monthLabel = visibleMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const dateTimeSummary = `${formatDateOption(selectedDate)} / ${formatTimeOption(startTime)}${
    endTime ? ` - ${formatTimeOption(endTime)}` : ""
  }`;

  async function createMeet() {
    if (!effectiveUserId) return;

    const latestAccount = await refreshAccount(
      effectiveUserId,
      account?.email ?? null,
    );
    if (!latestAccount?.isPremium) return;

    setError(null);

    const parsedStart = combineDateAndTime(selectedDate, startTime);
    const parsedEnd = endTime
      ? combineDateAndTime(selectedDate, endTime)
      : null;
    const parsedMax = maxAttendees.trim()
      ? Number.parseInt(maxAttendees.trim(), 10)
      : null;

    if (!title.trim() || !locationName.trim()) {
      setError("Title and location name are required.");
      return;
    }

    if (!address.trim() && !coordinates) {
      setError("Address is required unless you use current location.");
      return;
    }

    if (!parsedStart) {
      setError("Choose a valid date and start time.");
      return;
    }

    if (endTime && !parsedEnd) {
      setError("Choose a valid end time.");
      return;
    }

    if (
      parsedEnd &&
      new Date(parsedEnd).getTime() <= new Date(parsedStart).getTime()
    ) {
      setError("End time must be after the start time.");
      return;
    }

    if (parsedMax !== null && (!Number.isFinite(parsedMax) || parsedMax <= 0)) {
      setError("Max attendees must be a positive number.");
      return;
    }

    setSaving(true);

    let resolvedCoordinates = coordinates;
    if (!resolvedCoordinates) {
      const geocodeQuery = [address.trim(), locationName.trim()]
        .filter(Boolean)
        .join(" ");
      const geocodeResults = await Location.geocodeAsync(geocodeQuery);
      const firstResult = geocodeResults[0];

      if (!firstResult) {
        setError("Could not find that address. Try a more specific address.");
        setSaving(false);
        return;
      }

      resolvedCoordinates = {
        latitude: firstResult.latitude,
        longitude: firstResult.longitude,
      };
      setCoordinates(resolvedCoordinates);
    }

    const { data, error: insertErr } = await supabase
      .from("meets")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        cover_image_url: coverImageUrl,
        location_name: locationName.trim(),
        address: address.trim() || null,
        latitude: resolvedCoordinates.latitude,
        longitude: resolvedCoordinates.longitude,
        start_time: parsedStart,
        end_time: parsedEnd,
        created_by: effectiveUserId,
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

    await refreshMeets(effectiveUserId);
    setSaving(false);
    resetCreateMeetForm();

    router.navigate({
      pathname: "/map",
      params: {
        focusMeetId: data.id,
        latitude: String(data.latitude),
        longitude: String(data.longitude),
      },
    });
  }

  if (!effectiveUserId) {
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
            <MaterialCommunityIcons
              name="calendar-star"
              size={30}
              color={colors.primary}
            />
          </View>
          <Text style={styles.createPremiumTitle}>
            Create meets with Premium
          </Text>
          <Text style={styles.createPremiumSubtitle}>
            Host cruises, parking lot hangs, cars and coffee runs, and invite
            the local scene to pull up.
          </Text>

          <View style={styles.createPremiumFeatureList}>
            <View style={styles.createPremiumFeatureRow}>
              <MaterialCommunityIcons
                name="map-marker-plus"
                size={19}
                color={colors.primary}
              />
              <Text style={styles.createPremiumFeatureText}>
                Drop public meet pins on the map
              </Text>
            </View>
            <View style={styles.createPremiumFeatureRow}>
              <MaterialCommunityIcons
                name="account-group"
                size={19}
                color={colors.primary}
              />
              <Text style={styles.createPremiumFeatureText}>
                Track Going and Interested drivers
              </Text>
            </View>
            <View style={styles.createPremiumFeatureRow}>
              <MaterialCommunityIcons
                name="palette-outline"
                size={19}
                color={colors.primary}
              />
              <Text style={styles.createPremiumFeatureText}>
                Unlock profile customizations and socials
              </Text>
            </View>
          </View>

          <Pressable style={styles.createPremiumButton}>
            <Text style={styles.createPremiumButtonText}>
              Upgrade to Premium
            </Text>
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
            onChangeText={(value) => {
              setAddress(value);
              setCoordinates(null);
            }}
            placeholder="5620 Johnston St, Lafayette, LA"
            placeholderTextColor="#8a8a8a"
            style={styles.homeInput}
          />

          <Pressable
            onPress={useCurrentLocation}
            disabled={locating}
            style={[styles.createSecondaryAction, locating && { opacity: 0.7 }]}
          >
            {locating ? (
              <ActivityIndicator />
            ) : (
              <>
                <MaterialCommunityIcons
                  name="crosshairs-gps"
                  size={18}
                  color={colors.offwhite}
                />
                <Text style={styles.createSecondaryActionText}>
                  Use current location
                </Text>
              </>
            )}
          </Pressable>
          {coordinates ? (
            <Text style={styles.createLocationResolvedText}>
              Pin ready from {address.trim() ? "address" : "current location"}.
            </Text>
          ) : null}

          <Text style={styles.createMeetFieldLabel}>Cover photo</Text>
          <Pressable
            onPress={pickMeetCoverImage}
            disabled={coverUploading}
            style={[
              styles.createCoverPicker,
              coverImageUrl && styles.createCoverPickerFilled,
              coverUploading && { opacity: 0.72 },
            ]}
          >
            {coverImageUrl ? (
              <Image
                source={{ uri: coverImageUrl }}
                style={styles.createCoverImagePreview}
              />
            ) : (
              <View style={styles.createCoverPlaceholder}>
                <MaterialCommunityIcons
                  name="image-plus"
                  size={28}
                  color={colors.primary}
                />
              </View>
            )}
            <View style={styles.createCoverActionOverlay}>
              {coverUploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialCommunityIcons
                    name={coverImageUrl ? "image-edit" : "image-plus"}
                    size={17}
                    color={colors.offwhite}
                  />
                  <Text style={styles.createCoverActionText}>
                    {coverImageUrl ? "Change cover" : "Choose image"}
                  </Text>
                </>
              )}
            </View>
          </Pressable>
          {coverImageUrl ? (
            <Pressable
              onPress={() => setCoverImageUrl(null)}
              disabled={coverUploading}
              style={styles.createCoverRemoveButton}
            >
              <Text style={styles.createCoverRemoveText}>
                Remove cover photo
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => setIsDateTimePickerOpen(true)}
            style={styles.createDateTimeTrigger}
          >
            <View style={styles.createDateTimeTriggerIcon}>
              <MaterialCommunityIcons
                name="calendar-clock"
                size={21}
                color={colors.primary}
              />
            </View>
            <View style={styles.createDateTimeTriggerTextWrap}>
              <Text style={styles.createDateTimeTriggerTitle}>
                Choose date & time
              </Text>
              <Text style={styles.createDateTimeTriggerSummary}>
                {dateTimeSummary}
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-down"
              size={23}
              color={colors.silver}
            />
          </Pressable>

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
                style={[
                  styles.createVisibilityToggle,
                  isPublic && styles.createVisibilityToggleActive,
                ]}
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
      <Modal
        animationType="fade"
        transparent
        visible={isDateTimePickerOpen}
        onRequestClose={() => {
          setOpenTimePicker(null);
          setIsDateTimePickerOpen(false);
        }}
      >
        <View style={styles.createDateTimeModalBackdrop}>
          <View style={styles.createDateTimeModalCard}>
            <View style={styles.createDateQuickRow}>
              <Pressable
                onPress={() => pickDate(todayKey)}
                style={[
                  styles.createDateQuickButton,
                  activeQuickDate === "today" &&
                    styles.createDateQuickButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.createDateQuickButtonText,
                    activeQuickDate === "today" &&
                      styles.createDateQuickButtonTextActive,
                  ]}
                >
                  Today
                </Text>
              </Pressable>
              <Pressable
                onPress={() => pickDate(tomorrowKey)}
                style={[
                  styles.createDateQuickButton,
                  activeQuickDate === "tomorrow" &&
                    styles.createDateQuickButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.createDateQuickButtonText,
                    activeQuickDate === "tomorrow" &&
                      styles.createDateQuickButtonTextActive,
                  ]}
                >
                  Tomorrow
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setVisibleMonth(monthStartForKey(selectedDate))}
                style={[
                  styles.createDateQuickButton,
                  activeQuickDate === "more" &&
                    styles.createDateQuickButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.createDateQuickButtonText,
                    activeQuickDate === "more" &&
                      styles.createDateQuickButtonTextActive,
                  ]}
                >
                  More
                </Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={16}
                  color={
                    activeQuickDate === "more" ? colors.black : colors.silver
                  }
                />
              </Pressable>
            </View>

            <View style={styles.createCalendarHeader}>
              <Pressable
                onPress={() => setVisibleMonth((month) => addMonths(month, -1))}
                style={styles.createCalendarNavButton}
              >
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={22}
                  color={colors.offwhite}
                />
              </Pressable>
              <Text style={styles.createCalendarMonthText}>{monthLabel}</Text>
              <Pressable
                onPress={() => setVisibleMonth((month) => addMonths(month, 1))}
                style={styles.createCalendarNavButton}
              >
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={22}
                  color={colors.offwhite}
                />
              </Pressable>
            </View>

            <View style={styles.createCalendarWeekRow}>
              {CALENDAR_WEEKDAYS.map((weekday) => (
                <Text key={weekday} style={styles.createCalendarWeekdayText}>
                  {weekday}
                </Text>
              ))}
            </View>

            <View style={styles.createCalendarGrid}>
              {calendarWeeks.map((week, weekIndex) => (
                <View
                  key={`week-${weekIndex}`}
                  style={styles.createCalendarWeekDatesRow}
                >
                  {week.map((date) => {
                    const key = toDateKey(date);
                    const selected = selectedDate === key;
                    const muted = date.getMonth() !== visibleMonth.getMonth();
                    const today = key === todayKey;

                    return (
                      <View key={key} style={styles.createCalendarDaySlot}>
                        <Pressable
                          onPress={() => pickDate(key)}
                          style={[
                            styles.createCalendarDayButton,
                            today && styles.createCalendarDayToday,
                            selected && styles.createCalendarDaySelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.createCalendarDayText,
                              muted && styles.createCalendarDayTextMuted,
                              selected && styles.createCalendarDayTextSelected,
                            ]}
                          >
                            {date.getDate()}
                          </Text>
                          {today ? (
                            <View
                              style={[
                                styles.createCalendarTodayDot,
                                selected &&
                                  styles.createCalendarTodayDotSelected,
                              ]}
                            />
                          ) : null}
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>

            <View style={styles.createTimeFieldGroup}>
              <View style={styles.createTimeFieldRow}>
                <Text style={styles.createTimeFieldLabel}>Start time</Text>
                <Pressable
                  onPress={() =>
                    setOpenTimePicker((current) =>
                      current === "start" ? null : "start",
                    )
                  }
                  style={styles.createTimeField}
                >
                  <Text style={styles.createTimeFieldText}>
                    {formatTimeOption(startTime)}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={19}
                    color={colors.silver}
                  />
                </Pressable>
              </View>
              {openTimePicker === "start" ? (
                <View style={styles.createTimeDropdownGrid}>
                  {TIME_OPTIONS.map((time) => {
                    const selected = startTime === time;
                    return (
                      <Pressable
                        key={time}
                        onPress={() => {
                          setStartTime(time);
                          setOpenTimePicker(null);
                        }}
                        style={[
                          styles.createTimeDropdownOption,
                          selected && styles.createTimeDropdownOptionSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.createTimeDropdownOptionText,
                            selected &&
                              styles.createTimeDropdownOptionTextSelected,
                          ]}
                        >
                          {formatTimeOption(time)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.createTimeFieldRow}>
                <Text style={styles.createTimeFieldLabel}>End time</Text>
                <Pressable
                  onPress={() =>
                    setOpenTimePicker((current) =>
                      current === "end" ? null : "end",
                    )
                  }
                  style={styles.createTimeField}
                >
                  <Text style={styles.createTimeFieldText}>
                    {endTime ? formatTimeOption(endTime) : "No end"}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={19}
                    color={colors.silver}
                  />
                </Pressable>
              </View>
              {openTimePicker === "end" ? (
                <View style={styles.createTimeDropdownGrid}>
                  {END_TIME_OPTIONS.map((time) => {
                    const selected = endTime === time;
                    return (
                      <Pressable
                        key={time || "no-end"}
                        onPress={() => {
                          setEndTime(time);
                          setOpenTimePicker(null);
                        }}
                        style={[
                          styles.createTimeDropdownOption,
                          selected && styles.createTimeDropdownOptionSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.createTimeDropdownOptionText,
                            selected &&
                              styles.createTimeDropdownOptionTextSelected,
                          ]}
                        >
                          {time ? formatTimeOption(time) : "No end"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View style={styles.createDateTimeActionsRow}>
              <Pressable
                onPress={() => {
                  setOpenTimePicker(null);
                  setIsDateTimePickerOpen(false);
                }}
                style={styles.createDateTimeDoneButton}
              >
                <Text style={styles.createDateTimeDoneText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
