export type LiveLoc = {
  user_id: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updated_at?: string;
};

export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  photo_url: string | null;
  bio?: string | null;
  city?: string | null;
  state?: string | null;
  instagram_handle?: string | null;
  tiktok_handle?: string | null;
  twitter_handle?: string | null;
  snapchat_handle?: string | null;
  profile_visibility?: string | null;
  location_visibility?: string | null;
  membership_plan?: string | null;
  membership_status?: string | null;
  accent_color?: string | null;
  is_active_premium?: boolean;
};

export type Car = {
  id: string;
  user_id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
  color: string | null;
  description: string | null;
  photo_url: string | null;
  is_primary: boolean | null;
};

export type FriendRelationshipState = "none" | "friends" | "request_sent" | "request_received";
