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

type HomeTab = "friends" | "meets";
type AuthMode = "signin" | "signup" | null;

export default function Home() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [authedUserId, setAuthedUserId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<HomeTab>("friends");

  // choose which auth flow (prevents empty signups)
  const [authMode, setAuthMode] = useState<AuthMode>(null);

  const cleanEmail = useMemo(() => (email ?? "").trim(), [email]);
  const canSubmit = useMemo(
    () => cleanEmail.length > 0 && (password ?? "").length >= 6,
    [cleanEmail, password]
  );

  async function routeAfterAuth(uid: string) {
    // If you ever decide to drop the onboarded column, swap this logic.
    const { data, error } = await supabase
      .from("profiles")
      .select("onboarded")
      .eq("id", uid)
      .maybeSingle<{ onboarded: boolean }>();

    if (error) {
      // If profile row doesn't exist yet, they must go to profile to create it
      router.replace("/profile");
      return;
    }

    if (!data?.onboarded) {
      router.replace("/profile");
    } else {
      router.replace("/map");
    }
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
      setAuthedUserId(user?.id ?? null);
      setCheckingAuth(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthedEmail(session?.user?.email ?? null);
      setAuthedUserId(session?.user?.id ?? null);
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

    // ✅ Confirm-email ON => session is null => no redirect yet
    if (data?.user && !data?.session) {
      setError("Check your email to confirm your account, then sign in.");
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
      router.replace("/profile");
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
      <View style={styles.homeBody}>
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
              <View style={{ width: "90%", maxWidth: 420 }}>
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
              <View style={{ width: "90%", maxWidth: 420 }}>
                <Text
                  style={{ marginBottom: 10, fontSize: 16, fontWeight: "600" }}
                >
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
                  style={styles.homeInput}
                />
                <TextInput
                  placeholder="Password (min 6 chars)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  style={styles.homeInput}
                />

                {error ? (
                  <Text style={{ color: "crimson", marginTop: 8 }}>
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
