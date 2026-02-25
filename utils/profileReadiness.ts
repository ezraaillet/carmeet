export type MapProfileFields = {
  username?: string | null;
  display_name?: string | null;
  location_visibility?: string | null;
};

export function hasMapProfileData(profile: MapProfileFields | null | undefined) {
  if (!profile) return false;

  const hasName =
    typeof profile.display_name === "string" && profile.display_name.trim().length > 0;
  const hasUsername =
    typeof profile.username === "string" && profile.username.trim().length > 0;
  const hasVisibility =
    typeof profile.location_visibility === "string" &&
    profile.location_visibility.trim().length > 0;

  return (hasName || hasUsername) && hasVisibility;
}
