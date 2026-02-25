import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useMemo, useState } from "react";

import styles from "@/styles/homestyles";
import { supabase } from "../database/supabase";
import { useRouter } from "expo-router";
import { hasMapProfileData } from "@/utils/profileReadiness";

type HomeTab = "friends" | "meets";
type AuthMode = "signin" | "signup" | null;

export default function Home() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<HomeTab>("friends");
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);

  // choose which auth flow (prevents empty signups)
  const [authMode, setAuthMode] = useState<AuthMode>(null);

  const cleanEmail = useMemo(() => (email ?? "").trim(), [email]);
  const canSubmit = useMemo(
    () => cleanEmail.length > 0 && (password ?? "").length >= 6,
    [cleanEmail, password]
  );

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

  // Auth tracking
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
      // ✅ THIS is where redirect should happen (because sign-in actually has a session)
      await routeAfterAuth(uid);
    }

    // reset fields so they don't accidentally resubmit blanks later
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

    // If confirm-email is ON, signUp can return user but no session.
    // Try direct sign in so projects with auto-confirm disabled still work.
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

    // If confirm-email ever gets turned OFF, this will work:
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

  // ✅ Loading splash while auth is being determined
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
                <Text style={styles.homeTabContentText}>
                  Friends list goes here
                </Text>
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
                  placeholder="Password (min 6 chars)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholderTextColor="#8A8A8A"
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  style={[
                    styles.homeInput,
                    focusedField === "password" && styles.homeInputFocused,
                  ]}
                />

                {error ? (
                  <Text style={styles.homeErrorText}>
                    {error}
                  </Text>
                ) : null}

                <Pressable
                  onPress={authMode === "signin" ? handleSignIn : handleSignUp}
                  disabled={loading || !canSubmit}
                  style={({ pressed }) => [
                    styles.button,
                    (pressed || loading) && styles.buttonPressed,
                    (!canSubmit || loading) && { opacity: 0.6 },
                    { width: "100%", marginTop: 12 },
                  ]}
                >
                  {loading ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={styles.buttonText}>
                      {authMode === "signin"
                        ? "Confirm Sign In"
                        : "Confirm Create Account"}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={closeAuth}
                  disabled={loading}
                  style={({ pressed }) => [
                    styles.homeSecondaryBtn,
                    pressed && styles.homeSecondaryBtnPressed,
                    {
                      width: "100%",
                      marginTop: 12,
                      opacity: loading ? 0.6 : 1,
                    },
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
  );
}
