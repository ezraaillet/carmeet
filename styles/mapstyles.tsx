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
    bottom: 30,
    alignItems: "center",
  },
  card: {
    width: "90%",
    maxWidth: 420,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  friendBtn: {
    backgroundColor: "#1e90ff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  friendBtnText: {
    color: "#fff",
    fontWeight: "600",
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
    minWidth: 56,
    alignItems: "center",
    backgroundColor: "#b91c1c",
    borderWidth: 2,
    borderColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  meetMarkerIcon: {
    fontSize: 14,
    lineHeight: 16,
    color: "#fff",
  },
  meetMarkerLabel: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});

export default mapStyles;
