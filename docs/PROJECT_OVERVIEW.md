# Cruizr Project Overview

This is an Expo + React Native mobile app centered on location-based social discovery and friend connections, backed by Supabase.

## Stack at a glance

- **Framework**: Expo SDK 54 + React Native 0.81 + Expo Router tabs.
- **Backend**: Supabase (Auth, Postgres tables, Storage, Realtime).
- **Core native capabilities**: geolocation (expo-location), image picking (expo-image-picker), maps (react-native-maps).

## App structure

- app/_layout.tsx: main app shell with tab navigation, auth/onboarding gating, startup overlay, and friend-request notification flow.
- app/map.tsx: live map experience for self + friends + nearby public users + meets.
- app/create.tsx: premium-gated meet creation flow.
- app/profile.tsx: profile display and car management.
- app/edit-profile.tsx: settings/profile editing, avatar/banner upload, visibility preferences, premium customization, and sign-out.
- components/MapDataProvider.tsx: central data layer that fetches and merges friends, nearby users, profiles, live locations, meets, and attendance summaries.
- components/UserAccountProvider.tsx: cached account and membership/premium state.
- components/NotificationsOverlay.tsx: overlay UI for pending friend requests and accept/reject actions.
- database/supabase.ts: Supabase client creation and persisted auth session setup.
- supabase/migrations/: versioned SQL migrations for Supabase schema changes.
- database/schema-contract.md: app-facing Supabase table/RPC/storage contract documentation.

## Data model assumptions visible in code

The app code indicates these key Supabase tables/RPCs are in use:

- profiles (public profile data, visibility settings, social handles, onboarding flag)
- locations (lat/lng + live updates)
- friend_requests (pending/accepted/rejected lifecycle)
- friendships (accepted relationships)
- meets (map meet pins and meet details)
- meet_attendees (Going/Interested state and counts)
- user_memberships (free/premium gating)
- profile_customizations (premium accent color)
- RPCs: accept_friend_request, reject_friend_request
- Storage bucket: avatars

## Behavioral highlights

- Auth state is watched globally and used to decide signed-in vs signed-out tab behavior.
- Initial app load shows a branded startup overlay until account and map data finish bootstrapping.
- Map data is centralized in provider state, with realtime subscriptions for locations, meets, meet attendance, and friend requests.
- Nearby public users are computed with a bounding-box query plus a distance filter.
- Profile setup is resilient: if a profile or membership row is missing, code creates one automatically.

## Current repo maturity signals

- Good separation between screens, reusable components, style modules, and data access.
- Baseline lint tooling and TypeScript are configured.
- Database migration tracking is scaffolded under supabase/migrations/.
- The initial database baseline has been generated from the current remote Supabase schema.
- README is still Expo template content; project-specific setup is not yet documented.

## Suggested next documentation additions

1. Replace README.md with project-specific setup (required env vars and local run steps).
2. Keep database/schema-contract.md updated as table/RPC/storage contracts change.
3. Add a short product flow doc (sign up -> map -> friend requests -> meets).
4. Add troubleshooting notes for auth/session and location permission edge cases.
