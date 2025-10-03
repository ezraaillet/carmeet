import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
// app/index.tsx
import { useEffect, useState } from "react";

import { Link } from "expo-router";
import styles from "@/styles/homestyles"; // or change to "../styles/homestyles"
import { supabase } from "../database/supabase"; // adjust path if you use '@'

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track auth state
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

  async function handleSignOut() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signOut();
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.container, { width: "100%" }]}
    >
      <Text style={styles.content}>Welcome to CarMeet!</Text>

      {authedEmail ? (
        <>
          <Text style={{ marginBottom: 12 }}>
            Signed in as:{" "}
            <Text style={{ fontWeight: "600" }}>{authedEmail}</Text>
          </Text>

          <Link href="/map" asChild>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>Go to Map</Text>
            </Pressable>
          </Link>

          <Pressable
            onPress={handleSignOut}
            style={({ pressed }) => [
              local.btnSecondary,
              pressed && local.btnPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator />
            ) : (
              <Text style={local.btnSecondaryText}>Sign out</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <View style={{ width: "90%", maxWidth: 420 }}>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              style={local.input}
            />
            <TextInput
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={local.input}
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
              local.btnSecondary,
              pressed && local.btnPressed,
              { width: "90%", maxWidth: 420 },
            ]}
          >
            {loading ? (
              <ActivityIndicator />
            ) : (
              <Text style={local.btnSecondaryText}>Create Account</Text>
            )}
          </Pressable>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const local = StyleSheet.create({
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  btnSecondary: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#999",
    backgroundColor: "#f7f7f7",
  },
  btnSecondaryText: {
    fontWeight: "600",
  },
  btnPressed: {
    opacity: 0.7,
  },
});
