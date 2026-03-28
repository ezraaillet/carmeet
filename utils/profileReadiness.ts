export type MapProfileFields = {
  id?: string;
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

export async function ensureMinimalProfileExists(
  uid: string,
  email?: string | null
) {
  const { supabase } = await import("@/database/supabase");

  const { data, error: selectError } = await supabase
    .from("profiles")
    .select("id, username, display_name, location_visibility")
    .eq("id", uid)
    .maybeSingle<MapProfileFields>();

  if (selectError) {
    throw selectError;
  }

  if (data) {
    return data;
  }

  const resolvedEmail =
    email ??
    (await supabase.auth.getUser()).data.user?.email ??
    null;

  const payload = {
    id: uid,
    username: resolvedEmail ? resolvedEmail.split("@")[0] : null,
    display_name: null,
    location_visibility: "everyone",
    photo_url: null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("profiles")
    .insert(payload)
    .select("id, username, display_name, location_visibility")
    .single<MapProfileFields>();

  if (insertError) {
    throw insertError;
  }

  return inserted;
}
