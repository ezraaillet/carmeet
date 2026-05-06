import { StyleSheet } from "react-native";
import { colors } from "./themes";

const mapStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.black,
  },
  text: { fontSize: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  cardContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 78,
    alignItems: "center",
  },
  card: {
    width: "92%",
    maxWidth: 440,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(6,6,6,0.97)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  publicProfileCard: {
    minHeight: 320,
    paddingBottom: 72,
  },
  publicProfileScroll: {
    marginTop: 10,
    flexGrow: 0,
  },
  publicProfileScrollContent: {
    paddingBottom: 12,
  },
  profileNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  premiumBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(239,68,68,0.2)",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  premiumBadgeText: {
    color: "#ef4444",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  profileBio: {
    color: "#ddd",
    fontSize: 13,
    lineHeight: 18,
  },
  socialRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  socialPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(239,68,68,0.2)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.7)",
  },
  socialPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  carsSection: {
    marginTop: 14,
    gap: 8,
  },
  carsTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  carRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  carPhoto: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "#141414",
  },
  carPhotoFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  carPhotoFallbackText: {
    fontSize: 10,
    color: "#aaa",
    textAlign: "center",
  },
  carNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  carName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  primaryTag: {
    color: "#ef4444",
    fontSize: 11,
    fontWeight: "700",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#eee",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
  },
  icon: {
    width: 44,
    height: 44,
    borderColor: colors.primary,
    borderWidth: 2,
    borderRadius: 22,
    backgroundColor: "#000",
  },
  iconInitials: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderColor: colors.primary,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#222",
  },
  clusterBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  clusterBubbleText: {
    color: colors.black,
    fontWeight: "800",
    fontSize: 16,
  },
  cardName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  cardSub: {
    fontSize: 14,
    color: "#ccc",
  },
  cardSubSmall: {
    fontSize: 12,
    color: "#aaa",
  },
  closeBtn: {
    padding: 6,
    marginLeft: 8,
  },
  closeBtnText: {
    fontSize: 18,
    color: "#fff",
  },
  cardActions: {
    position: "absolute",
    right: 14,
    bottom: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  friendBtn: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  friendBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
  friendBtnDisabled: {
    backgroundColor: "rgba(239,68,68,0.45)",
  },
  friendBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.85)",
    backgroundColor: "rgba(239,68,68,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  friendBadgeText: {
    color: "#fff",
    fontWeight: "700",
  },

  errorText: {
    marginTop: 8,
    color: "crimson",
    fontSize: 13,
  },
  meetDescriptionText: {
    marginTop: 8,
    color: "#cfcfcf",
    fontSize: 13,
    lineHeight: 18,
  },
  meetTagsRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  meetTagPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  meetTagPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  meetMarkerWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  meetMarkerIcon: {
    fontSize: 38,
    lineHeight: 40,
    color: "#ef4444",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
});

export default mapStyles;
