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
    alignSelf: "flex-start",
    alignItems: "center",
    marginBottom: 12,
    marginLeft: 16,
    marginTop: -48,
    borderWidth: 3,
    borderRadius: 999,
    padding: 4,
  },

  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#eee",
  },

  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },

  avatarInitials: {
    fontSize: 36,
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
    alignItems: "flex-start",
    marginBottom: 14,
    paddingHorizontal: 16,
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
    borderRadius: 12,
    marginTop: 12,
    backgroundColor: colors.black,
  },

  carImageWrap: {
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },

  carImage: {
    width: "100%",
    height: 210,
    backgroundColor: colors.charcoal,
  },

  carImagePlaceholder: {
    width: "100%",
    height: 210,
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
    height: 64,
    backgroundColor: "rgba(0,0,0,0.52)",
  },

  carImageTitle: {
    position: "absolute",
    left: 12,
    bottom: 10,
    color: colors.offwhite,
    fontSize: 21,
    fontWeight: "700",
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
  },

  carContent: {
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 6,
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
