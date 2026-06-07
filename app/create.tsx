import { ActivityIndicator, Text, View } from "react-native";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback } from "react";

import { useMapData } from "@/components/MapDataProvider";
import { supabase } from "@/database/supabase";
import styles from "@/styles/homestyles";

export default function CreateScreen() {
  const { myUserId } = useMapData();

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

  if (!myUserId) {
    return (
      <View style={styles.createPlaceholderContainer}>
        <ActivityIndicator />
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
