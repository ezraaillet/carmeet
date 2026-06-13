import { StyleSheet } from "react-native";
import { colors } from "./themes";

const profileStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.black,
  },

  scroll: {
    flex: 1,
    backgroundColor: colors.black,
  },

  // Main container
  container: {
    flexGrow: 1,
    paddingBottom: 40,
    backgroundColor: colors.black,
  },

  // Center loader view
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.black,
  },

  // Avatar wrapper
  avatarWrap: {
    alignItems: "center",
    borderWidth: 3,
    borderRadius: 999,
    padding: 4,
  },

  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#eee",
  },

  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },

  avatarInitials: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.gunmetal,
  },

  settingsPhotoRow: {
    gap: 10,
  },

  settingsPhotoWrap: {
    alignSelf: "flex-start",
    borderWidth: 2,
    borderRadius: 999,
    padding: 3,
  },

  settingsPhotoPreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#eee",
  },

  headerTextWrap: {
    alignItems: "stretch",
    marginBottom: 14,
    marginTop: -42,
    paddingHorizontal: 16,
  },

  heroIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  identityTextWrap: {
    flex: 1,
    alignItems: "flex-start",
    paddingTop: 8,
  },

  displayNameText: {
    color: colors.offwhite,
    fontWeight: "700",
    fontSize: 24,
  },

  displayNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  premiumBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },

  premiumBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 12,
  },

  usernameText: {
    marginTop: 3,
    color: colors.silver,
    fontWeight: "600",
  },

  bioText: {
    marginTop: 10,
    color: colors.offwhite,
  },

  socialIconsRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },

  socialIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.gunmetal,
    alignItems: "center",
    justifyContent: "center",
  },

  locationText: {
    marginTop: 6,
    color: colors.silver,
    fontSize: 13,
  },


  // Form fields
  field: {
    marginBottom: 14,
  },

  label: {
    fontWeight: "700",
    marginBottom: 6,
    color: colors.offwhite,
  },

  readonlyBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#efefef",
    borderRadius: 8,
  },

  readonlyText: {
    color: "#333",
  },

  input: {
    backgroundColor: colors.gunmetal,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.steel,
    color: colors.offwhite,
  },

  inputDisabled: {
    backgroundColor: colors.charcoal,
    color: colors.silver,
  },

  socialInput: {
    marginTop: 8,
  },

  textarea: {
    minHeight: 90,
    textAlignVertical: "top",
  },

  error: {
    color: "crimson",
    marginTop: 4,
    marginBottom: 4,
  },

  // Buttons row
  btnRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 12,
  },

  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 16,
  },

  tabButton: {
    flex: 1,
    borderBottomWidth: 2,
    borderColor: "transparent",
    paddingVertical: 10,
    alignItems: "center",
  },

  tabButtonActive: {
    borderColor: colors.primary,
  },

  tabButtonText: {
    color: colors.offwhite,
    fontWeight: "600",
    fontSize: 12,
  },

  tabButtonTextActive: {
    color: colors.primary,
  },

  sectionCard: {
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 12,
    backgroundColor: colors.charcoal,
  },

  sectionTitle: {
    color: colors.offwhite,
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 12,
  },

  placeholderText: {
    color: colors.silver,
    lineHeight: 20,
  },

  carsSection: {
    marginHorizontal: 16,
  },

  carsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  addCarCard: {
    borderWidth: 1,
    borderColor: colors.gunmetal,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.black,
  },

  primaryToggle: {
    borderWidth: 1,
    borderColor: colors.steel,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: colors.charcoal,
  },

  primaryToggleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },

  primaryToggleText: {
    color: colors.offwhite,
    fontWeight: "600",
  },

  primaryToggleTextActive: {
    color: "#fff",
  },

  carsLoadingWrap: {
    gap: 8,
  },

  carCard: {
    marginBottom: 24,
    backgroundColor: "transparent",
  },

  carImageWrap: {
    borderRadius: 24,
    overflow: "hidden",
    position: "relative",
    backgroundColor: colors.charcoal,
  },

  carImage: {
    width: "100%",
    height: 236,
    backgroundColor: colors.charcoal,
  },

  carImagePlaceholder: {
    width: "100%",
    height: 236,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.charcoal,
  },

  carPlaceholderText: {
    color: colors.silver,
    fontWeight: "600",
  },

  carImageOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 88,
    backgroundColor: "rgba(0,0,0,0.58)",
  },

  carImageTitle: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 16,
    color: colors.offwhite,
    fontSize: 24,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  addCarPhotoPreview: {
    width: "100%",
    height: 170,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: colors.charcoal,
  },

  carTitle: {
    color: colors.offwhite,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },

  carMeta: {
    color: colors.silver,
    marginBottom: 4,
    lineHeight: 20,
  },

  carDescription: {
    color: colors.offwhite,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 5,
  },

  carContent: {
    paddingHorizontal: 2,
    paddingTop: 10,
  },

  meetCard: {
    borderWidth: 1,
    borderColor: colors.gunmetal,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    backgroundColor: colors.black,
  },

  bannerWrap: {
    width: "100%",
    height: 136,
    marginBottom: 8,
    position: "relative",
    overflow: "hidden",
    backgroundColor: colors.charcoal,
  },

  bannerImage: {
    width: "100%",
    height: "100%",
  },

  bannerFadeOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    experimental_backgroundImage:
      "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.72) 62%, #000 100%)",
  },


  headerEditButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  settingsContainer: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 14,
    backgroundColor: colors.black,
  },

  editScreenHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },

  editHeaderTextWrap: {
    flex: 1,
  },

  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gunmetal,
  },

  editScreenTitle: {
    color: colors.offwhite,
    fontSize: 24,
    fontWeight: "800",
  },

  editScreenSubtitle: {
    color: colors.silver,
    marginTop: 2,
  },

  settingsSectionCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.charcoal,
    borderWidth: 1,
    borderColor: colors.gunmetal,
  },

  settingsList: {
    gap: 10,
  },

  settingsRowCard: {
    minHeight: 78,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.charcoal,
    borderWidth: 1,
    borderColor: colors.gunmetal,
  },

  settingsRowIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(225, 6, 0, 0.13)",
  },

  settingsRowTextWrap: {
    flex: 1,
    gap: 3,
  },

  settingsRowTitle: {
    color: colors.offwhite,
    fontSize: 16,
    fontWeight: "800",
  },

  settingsRowSubtitle: {
    color: colors.silver,
    fontSize: 13,
    lineHeight: 18,
  },

  infoRow: {
    gap: 4,
    marginBottom: 14,
  },

  sectionActionButton: {
    flex: 1,
    alignItems: "center",
  },

  bannerPreview: {
    width: "100%",
    height: 124,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: colors.gunmetal,
  },

  settingsHelperText: {
    marginTop: 8,
  },

  signOutWrap: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.gunmetal,
  },

  signOutButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },

  signOutButtonText: {
    color: colors.primary,
    fontWeight: "800",
  },

  carActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },

  carActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.gunmetal,
  },

  carActionBtnSecondary: {
    backgroundColor: "transparent",
  },

  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
  },

  primaryBtnText: {
    color: "white",
    fontWeight: "700",
  },

  secondaryBtn: {
    borderColor: colors.gunmetal,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#f7f7f7",
  },

  secondaryBtnText: {
    fontWeight: "700",
    color: colors.gunmetal,
  },

  // Location visibility selector
  locationRow: {
    flexDirection: "row",
    gap: 8,
  },

  locationOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    alignItems: "center",
    backgroundColor: "#f7f7f7",
  },

  locationOptionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  locationOptionText: {
    fontWeight: "600",
    color: "#333",
    textTransform: "capitalize",
  },

  locationOptionTextSelected: {
    color: "white",
  },

  // Your original style
  text: {
    fontSize: 18,
  },

  accentPickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  accentSwatch: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff44",
  },

  accentSwatchSelected: {
    borderColor: "#fff",
    transform: [{ scale: 1.08 }],
  },

  accentSwatchCheck: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
});

export default profileStyles;
