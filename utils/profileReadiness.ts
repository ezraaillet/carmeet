export type MapProfileFields = {
  id?: string;
  username?: string | null;
  display_name?: string | null;
  location_visibility?: string | null;
  photo_url?: string | null;
};

export type UserMembershipFields = {
  id: string;
  user_id: string;
  plan: "free" | "premium";
  status: "active" | "inactive" | "cancelled" | "past_due" | "trialing";
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
    .select("id, username, display_name, location_visibility, photo_url")
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

  const { error: insertError } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id", ignoreDuplicates: true });

  if (insertError) {
    throw insertError;
  }

  const { data: ensured, error: ensuredError } = await supabase
    .from("profiles")
    .select("id, username, display_name, location_visibility, photo_url")
    .eq("id", uid)
    .single<MapProfileFields>();

  if (ensuredError) {
    throw ensuredError;
  }

  return ensured;
}

export async function ensureMembershipExistsForProfile(uid: string) {
  const { supabase } = await import("@/database/supabase");

  const { data, error: selectError } = await supabase
    .from("user_memberships")
    .select("id, user_id, plan, status")
    .eq("user_id", uid)
    .maybeSingle<UserMembershipFields>();

  if (selectError) {
    throw selectError;
  }

  if (data) {
    return data;
  }

  const { error: insertError } = await supabase
    .from("user_memberships")
    .upsert(
      {
        user_id: uid,
        plan: "free",
        status: "active",
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    );

  if (insertError) {
    throw insertError;
  }

  const { data: ensured, error: ensuredError } = await supabase
    .from("user_memberships")
    .select("id, user_id, plan, status")
    .eq("user_id", uid)
    .maybeSingle<UserMembershipFields>();

  if (ensuredError) {
    throw ensuredError;
  }

  return ensured ?? null;
}

export async function ensureProfileAndMembershipExists(
  uid: string,
  email?: string | null
) {
  const profile = await ensureMinimalProfileExists(uid, email);
  const membership = await ensureMembershipExistsForProfile(uid);

  return { profile, membership };
}
