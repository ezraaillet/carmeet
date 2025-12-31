// components/NotificationsOverlay.tsx

import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { FriendRequest } from "../app/_layout";
import React from "react";
import styles from "../styles/homestyles";

type Props = {
  open: boolean;
  onClose: () => void;
  pendingRequests: FriendRequest[];
  loading: boolean;
  error: string | null;
  actionLoadingId: string | null;
  onRespond: (requestId: string, status: "accepted" | "rejected") => void;
};

const NotificationsOverlay: React.FC<Props> = ({
  open,
  onClose,
  pendingRequests,
  loading,
  error,
  actionLoadingId,
  onRespond,
}) => {
  if (!open) return null;

  return (
    <View style={styles.notifOverlayBackdrop}>
      <View style={styles.notifOverlayCard}>
        {/* Header row */}
        <View style={styles.notifOverlayHeaderRow}>
          <Text style={styles.notifOverlayTitle}>Friend Requests</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.notifOverlayClose}>✕</Text>
          </Pressable>
        </View>

        {/* Body */}
        {loading ? (
          <View style={styles.notifOverlayBodyCenter}>
            <ActivityIndicator />
            <Text style={styles.notifOverlayBodyText}>Loading requests…</Text>
          </View>
        ) : error ? (
          <View style={styles.notifOverlayBodyCenter}>
            <Text style={styles.notifErrorText}>{error}</Text>
          </View>
        ) : pendingRequests.length === 0 ? (
          <View style={styles.notifOverlayBodyCenter}>
            <Text style={styles.notifOverlayBodyText}>
              No pending friend requests.
            </Text>
          </View>
        ) : (
          <View style={styles.notifList}>
            {pendingRequests.map((req) => (
              <View key={req.id} style={styles.notifItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifItemText}>
                    Friend request from{" "}
                    <Text style={styles.notifItemHighlight}>
                      {req.from_user_id.slice(0, 8)}
                    </Text>
                  </Text>
                  <Text style={styles.notifItemSub}>
                    {new Date(req.created_at).toLocaleString()}
                  </Text>
                </View>

                <View style={styles.notifButtonsRow}>
                  <Pressable
                    onPress={() => onRespond(req.id, "accepted")}
                    disabled={actionLoadingId === req.id}
                    style={[
                      styles.notifAcceptBtn,
                      actionLoadingId === req.id && { opacity: 0.7 },
                    ]}
                  >
                    {actionLoadingId === req.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.notifAcceptText}>Accept</Text>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => onRespond(req.id, "rejected")}
                    disabled={actionLoadingId === req.id}
                    style={styles.notifDeclineBtn}
                  >
                    <Text style={styles.notifDeclineText}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

export default NotificationsOverlay;
