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
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: colors.primaryDark,
  },
  buttonText: {
    color: colors.offwhite,
    fontSize: 16,
    fontWeight: "bold",
  },
  loadingIcon: {
    color: colors.primary,
    fontSize: 42,
    fontWeight: "800",
    letterSpacing: 1,
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
  homeBodyCentered: {
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 0,
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
    flex: 1,
  },
  homeTabContentText: {
    color: colors.offwhite,
    fontSize: 16,
  },
  friendsPanel: {
    flex: 1,
  },
  meetsPanel: {
    flex: 1,
  },
  friendsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  friendsHeaderTextWrap: {
    flexShrink: 1,
    minWidth: 180,
    paddingRight: 8,
  },
  friendsTitle: {
    color: colors.offwhite,
    fontSize: 22,
    fontWeight: "700",
  },
  friendsSubtitle: {
    color: colors.silver,
    fontSize: 14,
    marginTop: 4,
  },
  friendsRefreshButton: {
    backgroundColor: colors.gunmetal,
    borderWidth: 1,
    borderColor: colors.steel,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  friendsRefreshButtonPressed: {
    backgroundColor: colors.steel,
  },
  friendsRefreshButtonText: {
    color: colors.offwhite,
    fontSize: 14,
    fontWeight: "600",
  },
  meetHeaderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
  },
  meetCreateButton: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primaryDark,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  meetCreateButtonPressed: {
    opacity: 0.85,
  },
  meetCreateButtonText: {
    color: colors.black,
    fontSize: 14,
    fontWeight: "700",
  },
  friendsList: {
    gap: 12,
    paddingBottom: 20,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.charcoal,
    borderWidth: 1,
    borderColor: colors.gunmetal,
    borderRadius: 18,
    padding: 14,
    gap: 14,
  },
  friendCardPressed: {
    borderColor: colors.primary,
    transform: [{ scale: 0.99 }],
  },
  friendAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.gunmetal,
  },
  friendAvatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  friendAvatarFallbackText: {
    color: colors.offwhite,
    fontSize: 22,
    fontWeight: "700",
  },
  friendMeta: {
    flex: 1,
    gap: 4,
  },
  friendName: {
    color: colors.offwhite,
    fontSize: 18,
    fontWeight: "700",
  },
  friendHandle: {
    color: colors.primaryLight,
    fontSize: 14,
  },
  friendVisibility: {
    color: colors.silver,
    fontSize: 13,
  },
  friendRemoveButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.steel,
    backgroundColor: colors.gunmetal,
  },
  friendRemoveButtonPressed: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primary,
  },
  friendRemoveButtonDisabled: {
    opacity: 0.6,
  },
  friendRemoveButtonText: {
    color: colors.offwhite,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20,
  },
  friendModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  friendModalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.charcoal,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.gunmetal,
    padding: 20,
    gap: 14,
  },
  friendModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  friendModalAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.gunmetal,
  },
  friendModalAvatarFallback: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  friendModalAvatarFallbackText: {
    color: colors.offwhite,
    fontSize: 30,
    fontWeight: "700",
  },
  friendModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gunmetal,
    borderWidth: 1,
    borderColor: colors.steel,
  },
  friendModalCloseButtonPressed: {
    backgroundColor: colors.steel,
  },
  friendModalCloseButtonText: {
    color: colors.offwhite,
    fontSize: 18,
    fontWeight: "700",
  },
  friendModalName: {
    color: colors.offwhite,
    fontSize: 24,
    fontWeight: "700",
  },
  friendModalHandle: {
    color: colors.primaryLight,
    fontSize: 16,
  },
  friendModalInfoGroup: {
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.black,
    borderWidth: 1,
    borderColor: colors.gunmetal,
  },
  friendModalLabel: {
    color: colors.silver,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  friendModalValue: {
    color: colors.offwhite,
    fontSize: 16,
    fontWeight: "600",
  },
  friendModalHint: {
    color: colors.silver,
    fontSize: 13,
    lineHeight: 19,
  },
  createMeetModalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "86%",
    backgroundColor: colors.charcoal,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.gunmetal,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  createMeetModalScroll: {
    width: "100%",
  },
  createMeetModalContent: {
    paddingBottom: 8,
  },
  createMeetModalTitle: {
    color: colors.offwhite,
    fontSize: 22,
    fontWeight: "700",
  },
  createMeetModalSubtitle: {
    color: colors.silver,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 12,
  },
  createMeetFieldLabel: {
    color: colors.silver,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  createMeetChipRow: {
    gap: 8,
    paddingBottom: 10,
    paddingRight: 8,
  },
  createMeetChip: {
    borderWidth: 1,
    borderColor: colors.steel,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.gunmetal,
  },
  createMeetChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  createMeetChipPressed: {
    opacity: 0.8,
  },
  createMeetChipText: {
    color: colors.offwhite,
    fontSize: 13,
    fontWeight: "600",
  },
  createMeetChipTextSelected: {
    color: colors.black,
    fontWeight: "700",
  },
  createMeetMap: {
    height: 180,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.gunmetal,
    marginBottom: 8,
  },
  createMeetMapHint: {
    color: colors.silver,
    fontSize: 12,
    marginBottom: 12,
  },
  createMeetDescriptionInput: {
    minHeight: 88,
  },
  createMeetActionsRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 10,
  },
  createMeetActionButton: {
    marginTop: 0,
    flex: 1,
  },
  friendsEmptyState: {
    flex: 1,
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  friendsEmptyTitle: {
    color: colors.offwhite,
    fontSize: 20,
    fontWeight: "700",
  },
  meetCard: {
    backgroundColor: colors.charcoal,
    borderWidth: 1,
    borderColor: colors.gunmetal,
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  meetHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  meetTitle: {
    color: colors.offwhite,
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
  },
  meetStatus: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  meetTimeText: {
    color: colors.offwhite,
    fontSize: 14,
    fontWeight: "600",
  },
  meetLocationText: {
    color: colors.silver,
    fontSize: 14,
  },
  meetDescription: {
    color: colors.silver,
    fontSize: 13,
    lineHeight: 18,
  },
  meetMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  meetMetaText: {
    color: colors.silver,
    fontSize: 12,
    fontWeight: "600",
  },
  meetAttendanceText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontWeight: "600",
  },
  meetTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  meetTagPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.gunmetal,
    borderWidth: 1,
    borderColor: colors.steel,
  },
  meetTagPillText: {
    color: colors.offwhite,
    fontSize: 12,
    fontWeight: "600",
  },

  /* ---------------------------
     LOGIN INPUTS (shared)
  ----------------------------*/
  homeAuthCard: {
    width: "90%",
    maxWidth: 420,
    backgroundColor: colors.charcoal,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.gunmetal,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  homeAuthTitle: {
    marginBottom: 12,
    fontSize: 18,
    fontWeight: "700",
    color: colors.offwhite,
  },
  homeInput: {
    backgroundColor: colors.black,
    color: colors.offwhite,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.gunmetal,
  },
  homeInputFocused: {
    borderColor: colors.primary,
  },
  homeErrorText: {
    color: colors.error,
    marginTop: 4,
    marginBottom: 4,
  },

  homeSecondaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.steel,
    backgroundColor: colors.gunmetal,
  },
  homeSecondaryBtnText: {
    color: colors.offwhite,
    fontWeight: "600",
  },
  homeSecondaryBtnPressed: {
    opacity: 0.7,
  },
});

export default styles;
