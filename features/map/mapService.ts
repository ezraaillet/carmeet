import { supabase } from "@/database/supabase";
import { Profile } from "./mapTypes";

export async function getCurrentAuthUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function upsertLocation(args: {
  userId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}) {
  return supabase.from("locations").upsert({
    user_id: args.userId,
    lat: args.lat,
    lng: args.lng,
    heading: args.heading,
    speed: args.speed,
    updated_at: new Date().toISOString(),
  });
}

export async function deleteMyLocation(userId: string) {
  return supabase.from("locations").delete().eq("user_id", userId);
}

export async function fetchUserMarkerCardData(userId: string, myUserId: string | null) {
  return Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, username, display_name, photo_url, bio, city, state, instagram_handle, tiktok_handle, twitter_handle, snapchat_handle, profile_visibility, location_visibility"
      )
      .eq("id", userId)
      .maybeSingle<Profile>(),
    supabase
      .from("cars")
      .select("id, user_id, make, model, year, trim, color, description, photo_url, is_primary")
      .eq("user_id", userId)
      .order("is_primary", { ascending: false })
      .order("year", { ascending: false }),
    supabase
      .from("friendships")
      .select("id")
      .eq("status", "accepted")
      .or(`and(user_id.eq.${myUserId},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${myUserId})`)
      .maybeSingle(),
    supabase
      .from("friend_requests")
      .select("id")
      .eq("from_user_id", myUserId)
      .eq("to_user_id", userId)
      .eq("status", "pending")
      .maybeSingle(),
    supabase
      .from("friend_requests")
      .select("id")
      .eq("from_user_id", userId)
      .eq("to_user_id", myUserId)
      .eq("status", "pending")
      .maybeSingle(),
  ]);
}

export async function insertFriendRequest(myUserId: string, selectedUserId: string) {
  return supabase.from("friend_requests").insert({
    from_user_id: myUserId,
    to_user_id: selectedUserId,
    status: "pending",
    created_at: new Date().toISOString(),
  });
}

export async function blockUser(userId: string) {
  return supabase.rpc("block_user", { p_blocked_id: userId });
}

export async function unblockUser(userId: string) {
  return supabase.rpc("unblock_user", { p_blocked_id: userId });
}

export async function submitContentReport(args: {
  reportedUserId?: string;
  reportedMeetId?: string;
  reason: "harassment" | "spam" | "inappropriate" | "scam" | "other";
  details?: string;
}) {
  const user = await getCurrentAuthUser();
  if (!user) {
    return { data: null, error: new Error("Authentication required") };
  }

  return supabase.from("content_reports").insert({
    reporter_id: user.id,
    reported_user_id: args.reportedUserId ?? null,
    reported_meet_id: args.reportedMeetId ?? null,
    reason: args.reason,
    details: args.details?.trim() || null,
  });
}
