import { StyleSheet } from "react-native";
import { colors } from "./themes";

const styles = StyleSheet.create({
  // Base home styles
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.black,
  },
  content: {
    fontSize: 18,
    color: "blue",
  },
  button: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "blue",
    borderRadius: 5,
  },
  buttonPressed: {
    backgroundColor: "darkblue",
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },

  // Header
  header: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: colors.black,
    borderBottomWidth: 1,
    borderBottomColor: colors.gunmetal,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.primary,
  },

  // Notification bell + badge
  notifButton: {
    position: "relative",
    padding: 4,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "crimson",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },

  // Overlay that fills everything *under* the header
  notifOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)", // dim behind card (optional)
    justifyContent: "flex-start",
    alignItems: "stretch",
  },

  // Card now fills the whole content area under the header
  notifOverlayCard: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    backgroundColor: colors.black,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
    borderColor: colors.gunmetal,
  },

  // header row, list, buttons, etc stay the same
  notifOverlayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  notifOverlayTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.primary,
  },
  notifOverlayClose: {
    fontSize: 20,
    color: colors.offwhite,
  },

  notifOverlayBodyCenter: {
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  notifOverlayBodyText: {
    marginTop: 8,
    color: colors.offwhite,
    fontSize: 14,
  },
  notifErrorText: {
    color: "crimson",
    fontSize: 14,
  },

  notifList: {
    marginTop: 8,
    gap: 10,
  },
  notifItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gunmetal,
  },
  notifItemText: {
    color: colors.offwhite,
    fontSize: 14,
    marginBottom: 2,
  },
  notifItemHighlight: {
    fontWeight: "700",
    color: colors.primary,
  },
  notifItemSub: {
    color: "#888",
    fontSize: 12,
  },

  notifButtonsRow: {
    marginLeft: 8,
    flexDirection: "column",
    gap: 4,
  },
  notifAcceptBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
  },
  notifAcceptText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  notifDeclineBtn: {
    borderWidth: 1,
    borderColor: colors.gunmetal,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: colors.black,
  },
  notifDeclineText: {
    color: colors.offwhite,
    fontSize: 12,
    fontWeight: "600",
  },
    /* ---------------------------
      HOME PAGE TABS
  ----------------------------*/

  homeBody: {
    flex: 1,
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Top tab row
  homeTabsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
    gap: 12,
  },

  homeTabButton: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: colors.gunmetal, // inactive state
  },
  homeTabButtonActive: {
    backgroundColor: colors.primary,
  },

  homeTabButtonText: {
    color: "#ccc",
    fontSize: 16,
    fontWeight: "600",
  },
  homeTabButtonTextActive: {
    color: colors.black, // visible on primary background
  },

  // Tab content wrapper
  homeTabContent: {
    marginTop: 6,
    padding: 12,
  },
  homeTabContentText: {
    color: colors.offwhite,
    fontSize: 16,
  },

  /* ---------------------------
     LOGIN INPUTS (shared)
  ----------------------------*/
  homeInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  
  homeSecondaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#999",
    backgroundColor: "#f7f7f7",
  },
  homeSecondaryBtnText: {
    fontWeight: "600",
  },
  homeSecondaryBtnPressed: {
    opacity: 0.7,
  },

});

export default styles;
