// components/NotificationsOverlay.tsx

import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";

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
  onOpenProfile: (userId: string) => void;
};

function getRequesterName(req: FriendRequest) {
  return (
    req.requester_profile?.display_name?.trim() ||
    req.requester_profile?.username?.trim() ||
    "Cruizr user"
  );
}

function getRequesterUsername(req: FriendRequest) {
  const username = req.requester_profile?.username?.trim();
  return username ? `@${username}` : `User ${req.from_user_id.slice(0, 8)}`;
}

function getRequesterInitials(req: FriendRequest) {
  return getRequesterName(req)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatSentAgo(createdAt: string) {
  const sentAt = new Date(createdAt).getTime();
  if (!Number.isFinite(sentAt)) return "just now";

  const seconds = Math.max(0, Math.floor((Date.now() - sentAt) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const NotificationsOverlay: React.FC<Props> = ({
  open,
  onClose,
  pendingRequests,
  loading,
  error,
  actionLoadingId,
  onRespond,
  onOpenProfile,
}) => {
  if (!open) return null;

  return (
    <View style={styles.notifOverlayBackdrop}>
      <View style={styles.notifOverlayCard}>
        <View style={styles.notifOverlayHeaderRow}>
          <Text style={styles.notifOverlayTitle}>Friend Requests</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.notifOverlayClose}>x</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.notifOverlayBodyCenter}>
            <ActivityIndicator />
            <Text style={styles.notifOverlayBodyText}>Loading requests...</Text>
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
            {pendingRequests.map((req) => {
              const profile = req.requester_profile;
              const requesterName = getRequesterName(req);
              const requesterUsername = getRequesterUsername(req);
              const requesterInitials = getRequesterInitials(req);

              return (
                <View key={req.id} style={styles.notifItemRow}>
                  <Pressable
                    onPress={() => onOpenProfile(req.from_user_id)}
                    style={({ pressed }) => [
                      styles.notifRequesterButton,
                      pressed && { opacity: 0.82 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${requesterName}'s profile`}
                  >
                    {profile?.photo_url ? (
                      <Image
                        source={{ uri: profile.photo_url }}
                        style={styles.notifAvatar}
                      />
                    ) : (
                      <View style={styles.notifAvatarFallback}>
                        <Text style={styles.notifAvatarInitials}>
                          {requesterInitials}
                        </Text>
                      </View>
                    )}

                    <View style={styles.notifItemContent}>
                      <Text style={styles.notifItemText} numberOfLines={1}>
                        {requesterName}
                      </Text>
                      <Text style={styles.notifItemHighlight} numberOfLines={1}>
                        {requesterUsername}
                      </Text>
                      <Text style={styles.notifItemSub}>
                        Sent {formatSentAgo(req.created_at)}
                      </Text>
                    </View>
                  </Pressable>

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
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
};

export default NotificationsOverlay;
