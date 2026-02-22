# CarMeet Project Overview

This is an Expo + React Native mobile app centered on location-based social discovery and friend connections, backed by Supabase.

## Stack at a glance

- **Framework**: Expo SDK 54 + React Native 0.81 + Expo Router tabs.
- **Backend**: Supabase (Auth, Postgres tables, Storage, Realtime).
- **Core native capabilities**: geolocation (`expo-location`), image picking (`expo-image-picker`), maps (`react-native-maps`).

## App structure

- `app/_layout.tsx`: main app shell with tab navigation, auth/onboarding gating, and friend-request notification flow.
- `app/index.tsx`: home/auth entry surface (sign-in / sign-up flow and onboarding funnel).
- `app/map.tsx`: live map experience for self + friends + nearby users.
- `app/profile.tsx`: profile editing, avatar upload, visibility preferences, and sign-out.
- `components/MapDataProvider.tsx`: central data layer that fetches and merges friends, nearby users, profiles, and live locations.
- `components/NotificationsOverlay.tsx`: overlay UI for pending friend requests and accept/reject actions.
- `database/supabase.ts`: Supabase client creation and persisted auth session setup.

## Data model assumptions visible in code

The app code indicates these key Supabase tables/rpcs are in use:

- `profiles` (onboarded flag, username/display_name/photo_url/location_visibility)
- `locations` (lat/lng + live updates)
- `friend_requests` (pending/accepted/rejected lifecycle)
- `friendships` (accepted relationships)
- RPCs: `accept_friend_request`, `reject_friend_request`
- Storage bucket: `avatars`

## Behavioral highlights

- Auth state is watched globally and used to decide onboarding vs normal tab flow.
- Map data is centralized in provider state, with realtime subscriptions for location/profile/request updates.
- Nearby users are computed with a bounding-box query plus a haversine distance filter in app code.
- Profile setup is resilient: if a profile row is missing, code creates one automatically.

## Current repo maturity signals

- Good separation between screens, reusable components, style modules, and data access.
- Baseline lint tooling and TypeScript are configured.
- README is still Expo template content; project-specific setup and Supabase schema/env docs are not yet documented.

## Suggested next documentation additions

1. Replace `README.md` with project-specific setup (required env vars, Supabase schema, and local run steps).
2. Add a schema reference for tables/RPC contracts expected by the app.
3. Add a short product flow doc (sign up → onboarding → map → friend requests).
4. Add troubleshooting notes for auth/session and location permission edge cases.
