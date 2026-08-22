import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { supabase } from "@/database/supabase";

type Report = {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  reported_meet_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
};

const actions = [
  { value: "dismiss", label: "Dismiss" },
  { value: "warn", label: "Warn" },
  { value: "suspend", label: "Suspend 7d" },
  { value: "ban", label: "Ban" },
  { value: "reinstate", label: "Reinstate" },
  { value: "remove_meet", label: "Remove meet" },
] as const;

export default function AdminScreen() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  async function loadReports() {
    setLoading(true);
    const { data: isModerator, error: accessError } = await supabase.rpc(
      "is_moderator",
    );

    if (accessError || !isModerator) {
      setAuthorized(false);
      setLoading(false);
      return;
    }

    setAuthorized(true);
    const { data, error } = await supabase
      .from("content_reports")
      .select(
        "id, reporter_id, reported_user_id, reported_meet_id, reason, details, status, created_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      Alert.alert("Could not load reports", error.message);
    } else {
      setReports((data ?? []) as Report[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadReports();
  }, []);

  async function moderate(report: Report, action: (typeof actions)[number]["value"]) {
    setActionId(report.id);
    const { error } = await supabase.rpc("moderate_report", {
      p_report_id: report.id,
      p_action: action,
      p_notes: `Admin action: ${action}`,
    });
    setActionId(null);

    if (error) {
      Alert.alert("Moderation failed", error.message);
      return;
    }

    setReports((current) => current.filter((item) => item.id !== report.id));
  }

  if (loading || authorized === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#ef4444" />
        <Text style={styles.muted}>Loading moderation queue...</Text>
      </View>
    );
  }

  if (!authorized) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Access denied</Text>
        <Text style={styles.muted}>Moderator access is required.</Text>
        <Pressable onPress={() => router.back()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Moderation queue</Text>
          <Text style={styles.muted}>{reports.length} pending reports</Text>
        </View>
        <Pressable onPress={() => void loadReports()} style={styles.refreshButton}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {reports.length === 0 ? (
          <Text style={styles.empty}>No pending reports.</Text>
        ) : (
          reports.map((report) => (
            <View key={report.id} style={styles.card}>
              <Text style={styles.cardTitle}>
                {report.reported_user_id ? "User report" : "Meet report"}
              </Text>
              <Text style={styles.cardMeta}>Reason: {report.reason}</Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                Target: {report.reported_user_id ?? report.reported_meet_id}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                Reporter: {report.reporter_id}
              </Text>
              {report.details ? (
                <Text style={styles.details}>{report.details}</Text>
              ) : null}
              <View style={styles.actions}>
                {actions
                  .filter(
                    (action) =>
                      (action.value === "remove_meet"
                        ? Boolean(report.reported_meet_id)
                        : action.value === "dismiss" ||
                            Boolean(report.reported_user_id)),
                  )
                  .map((action) => (
                    <Pressable
                      key={action.value}
                      onPress={() => void moderate(report, action.value)}
                      disabled={actionId === report.id}
                      style={[
                        styles.actionButton,
                        action.value === "ban" || action.value === "remove_meet"
                          ? styles.dangerButton
                          : null,
                      ]}
                    >
                      {actionId === report.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.actionText}>{action.label}</Text>
                      )}
                    </Pressable>
                  ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = {
  screen: { flex: 1, backgroundColor: "#050505" },
  center: {
    flex: 1,
    backgroundColor: "#050505",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 24,
    gap: 10,
  },
  header: {
    paddingTop: 58,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  content: { padding: 16, gap: 12 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800" as const },
  muted: { color: "#999", marginTop: 5 },
  empty: { color: "#999", textAlign: "center" as const, marginTop: 40 },
  card: {
    backgroundColor: "#171717",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2b2b2b",
  },
  cardTitle: { color: "#fff", fontSize: 16, fontWeight: "800" as const },
  cardMeta: { color: "#aaa", marginTop: 5, fontSize: 12 },
  details: { color: "#ddd", marginTop: 10, lineHeight: 19 },
  actions: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 7, marginTop: 14 },
  actionButton: {
    backgroundColor: "#333",
    borderRadius: 8,
    minHeight: 36,
    paddingHorizontal: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  dangerButton: { backgroundColor: "#8f2525" },
  actionText: { color: "#fff", fontSize: 12, fontWeight: "700" as const },
  refreshButton: { backgroundColor: "#333", borderRadius: 8, padding: 10 },
  refreshText: { color: "#fff", fontWeight: "700" as const },
  primaryButton: { backgroundColor: "#ef4444", borderRadius: 8, padding: 12, marginTop: 10 },
  primaryButtonText: { color: "#fff", fontWeight: "700" as const },
};
