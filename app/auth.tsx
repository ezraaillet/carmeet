import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { useMapData } from "@/components/MapDataProvider";
import { supabase } from "@/database/supabase";
import styles from "@/styles/homestyles";
import { ensureProfileAndMembershipExists } from "@/utils/profileReadiness";

type AuthMode = "sign-in" | "sign-up";

const ALLOWED_RETURN_PATHS = new Set(["/map", "/profile", "/create"]);

function getReturnPath(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && ALLOWED_RETURN_PATHS.has(raw) ? raw : "/map";
}

export default function AuthScreen() {
  const params = useLocalSearchParams<{ redirectTo?: string | string[] }>();
  const { refresh } = useMapData();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const returnPath = useMemo(() => getReturnPath(params.redirectTo), [params.redirectTo]);
  const isSignUp = mode === "sign-up";

  async function finishAuth(userId: string, userEmail?: string | null) {
    await ensureProfileAndMembershipExists(userId, userEmail);
    await refresh(userId);
    router.replace(returnPath as any);
  }

  async function submitAuth() {
    const normalizedEmail = email.trim();
    setError(null);
    setMessage(null);

    if (!normalizedEmail || !password) {
      setError("Enter your email and password to continue.");
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
        });

        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        if (data.user) {
          await finishAuth(data.user.id, data.user.email ?? normalizedEmail);
          return;
        }

        setMessage("Check your email to confirm your account, then sign in.");
        setMode("sign-in");
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      if (data.user) {
        await finishAuth(data.user.id, data.user.email ?? normalizedEmail);
      }
    } catch (authError: any) {
      setError(authError?.message ?? "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.authScreen}
    >
      <View style={styles.authCard}>
        <Text style={styles.authTitle}>{isSignUp ? "Create account" : "Sign in"}</Text>
        <Text style={styles.authSubtitle}>
          {isSignUp
            ? "Create your CarMeet account to use the map, create meets, and build your profile."
            : "Sign in to get back to the map, your profile, and your meets."}
        </Text>

        <View style={styles.authModeRow}>
          <Pressable
            onPress={() => switchMode("sign-in")}
            style={[styles.authModeButton, !isSignUp && styles.authModeButtonActive]}
          >
            <Text style={[styles.authModeText, !isSignUp && styles.authModeTextActive]}>
              Sign in
            </Text>
          </Pressable>
          <Pressable
            onPress={() => switchMode("sign-up")}
            style={[styles.authModeButton, isSignUp && styles.authModeButtonActive]}
          >
            <Text style={[styles.authModeText, isSignUp && styles.authModeTextActive]}>
              Create account
            </Text>
          </Pressable>
        </View>

        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor="#888"
          style={styles.authInput}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoComplete={isSignUp ? "new-password" : "password"}
          placeholder="Password"
          placeholderTextColor="#888"
          secureTextEntry
          style={styles.authInput}
        />
        {isSignUp ? (
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            placeholder="Confirm password"
            placeholderTextColor="#888"
            secureTextEntry
            style={styles.authInput}
          />
        ) : null}

        {error ? <Text style={styles.authError}>{error}</Text> : null}
        {message ? <Text style={styles.authMessage}>{message}</Text> : null}

        <Pressable
          onPress={submitAuth}
          disabled={loading}
          style={({ pressed }) => [
            styles.authSubmitButton,
            (pressed || loading) && { opacity: 0.8 },
          ]}
        >
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.authSubmitText}>{isSignUp ? "Create account" : "Sign in"}</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.replace(returnPath as any)} style={styles.authSecondaryButton}>
          <Text style={styles.authSecondaryText}>Back to {returnPath.replace("/", "") || "map"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
