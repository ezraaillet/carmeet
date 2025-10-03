// lib/supabase.ts

import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage, // persist across app restarts
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // RN has no URL callbacks
    },
  }
);

// Dev-only: sign in so RLS works
// export async function ensureDevAuth() {
//   const {
//     data: { user },
//   } = await supabase.auth.getUser();
//   if (user) return user;

//   const email = process.env.EXPO_PUBLIC_SUPABASE_DEV_EMAIL!;
//   const password = process.env.EXPO_PUBLIC_SUPABASE_DEV_PASSWORD!;

//   // Make sure this user exists in Supabase Auth → Users.
//   const { data, error } = await supabase.auth.signInWithPassword({
//     email,
//     password,
//   });
//   if (error) {
//     console.warn(
//       "Supabase sign-in failed. Did you create the dev user?",
//       error.message
//     );
//   }
//   return data.user ?? null;
// }
