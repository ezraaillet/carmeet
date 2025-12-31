import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useState } from "react";

import styles from "@/styles/homestyles";
import { supabase } from "../database/supabase";

type HomeTab = "friends" | "meets";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<HomeTab>("friends");

  // Auth tracking
  useEffect(() => {
    let mounted = true;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (mounted) setAuthedEmail(user?.email ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthedEmail(session?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleSignUp() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.container, { width: "100%" }]}
    >
      {/* MAIN CONTENT */}
      <View style={styles.homeBody}>
        {authedEmail ? (
          <>
            {/* 🔥 Top Tabs */}
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

            {/* 🔥 Tab Content */}
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
            {/* LOGIN / SIGNUP FORM */}
            <View style={{ width: "90%", maxWidth: 420 }}>
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                style={styles.homeInput}
              />
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.homeInput}
              />
            </View>

            {error ? (
              <Text style={{ color: "crimson", marginTop: 8 }}>{error}</Text>
            ) : null}

            <Pressable
              onPress={handleSignIn}
              disabled={loading}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                { width: "90%", maxWidth: 420 },
              ]}
            >
              {loading ? (
                <ActivityIndicator />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleSignUp}
              disabled={loading}
              style={({ pressed }) => [
                styles.homeSecondaryBtn,
                pressed && styles.homeSecondaryBtnPressed,
                { width: "90%", maxWidth: 420 },
              ]}
            >
              {loading ? (
                <ActivityIndicator />
              ) : (
                <Text style={styles.homeSecondaryBtnText}>Create Account</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
