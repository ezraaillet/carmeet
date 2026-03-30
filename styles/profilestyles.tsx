import { StyleSheet } from "react-native";
import { colors } from "./themes";

const profileStyles = StyleSheet.create({
  // Main container
  container: {
    flexGrow: 1,
    padding: 20,
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
    alignSelf: "center",
    alignItems: "center",
    marginBottom: 12,
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

  changePhoto: {
    marginTop: 8,
    fontWeight: "600",
    color: colors.primary,
  },

  headerTextWrap: {
    alignItems: "center",
    marginBottom: 14,
  },

  displayNameText: {
    color: colors.offwhite,
    fontWeight: "700",
    fontSize: 24,
  },

  usernameText: {
    marginTop: 3,
    color: colors.silver,
    fontWeight: "600",
  },

  bioText: {
    marginTop: 10,
    color: colors.offwhite,
    textAlign: "center",
  },

  locationText: {
    marginTop: 6,
    color: colors.silver,
    fontSize: 13,
  },

  headerActions: {
    marginTop: 8,
    marginBottom: 14,
    flexDirection: "row",
    alignSelf: "center",
    gap: 12,
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
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    color: "#111",
  },

  inputDisabled: {
    backgroundColor: "#f3f3f3",
    color: "#666",
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
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },

  tabButton: {
    borderWidth: 1,
    borderColor: colors.steel,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.charcoal,
  },

  tabButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },

  tabButtonText: {
    color: colors.offwhite,
    fontWeight: "600",
    fontSize: 12,
  },

  tabButtonTextActive: {
    color: "#fff",
  },

  sectionCard: {
    borderWidth: 1,
    borderColor: colors.gunmetal,
    borderRadius: 12,
    padding: 14,
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
});

export default profileStyles;
