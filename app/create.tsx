import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { useMapData } from "@/components/MapDataProvider";
import styles from "@/styles/homestyles";

export default function CreateScreen() {
  const { myUserId } = useMapData();

  if (!myUserId) {
    return (
      <View style={styles.createPlaceholderContainer}>
        <Text style={styles.createPlaceholderTitle}>Sign in required</Text>
        <Text style={styles.createPlaceholderSubtitle}>
          Please sign in or create an account before creating a meet.
        </Text>
        <Pressable
          onPress={() => router.navigate("/auth?redirectTo=/create")}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Sign in or create account</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.createPlaceholderContainer}>
      <Text style={styles.createPlaceholderTitle}>Create</Text>
      <Text style={styles.createPlaceholderSubtitle}>Create meet flow coming soon</Text>
    </View>
  );
}
