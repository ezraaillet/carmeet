# Supabase Schema Contract

This document describes the database objects the Cruizr app expects. It is not a full schema dump. Keep it updated when app-facing database behavior changes.

## Tables Used By App Code

### `profiles`

Used for public profile display, profile editing, map/profile visibility, social handles, and onboarding/profile readiness.

Observed app-facing fields:

- `id`
- `username`
- `display_name`
- `photo_url`
- `profile_visibility`
- `location_visibility`
- `bio`
- `city`
- `state`
- `instagram_handle`
- `tiktok_handle`
- `twitter_handle`
- `snapchat_handle`
- `onboarded`

### `locations`

Used for live/self/friend/nearby map markers and realtime location updates.

Observed app-facing fields:

- `user_id`
- `lat`
- `lng`
- `heading`
- `speed`
- `updated_at`

### `friend_requests`

Used for pending friend request notifications and request lifecycle.

Observed app-facing fields:

- `id`
- `from_user_id`
- `to_user_id`
- `status`
- `created_at`

### `friendships`

Used to fetch accepted friend relationships.

Observed app-facing fields:

- `user_id`
- `friend_id`
- `status`

### `meets`

Used for public/created meet pins, meet detail sheets, and create-meet flow.

Observed app-facing fields:

- `id`
- `title`
- `description`
- `cover_image_url`
- `location_name`
- `address`
- `latitude`
- `longitude`
- `start_time`
- `end_time`
- `created_by`
- `is_public`
- `max_attendees`
- `status`
- `created_at`
- `updated_at`

### `meet_attendees`

Used for Going/Interested state and meet attendee summaries.

Observed app-facing fields:

- `id`
- `meet_id`
- `user_id`
- `status`
- `created_at`
- `updated_at`

### `user_memberships`

Used for premium gating and premium profile styling.

Observed app-facing fields:

- `id`
- `user_id`
- `plan`
- `status`

### `profile_customizations`

Used for premium accent/profile outline color.

Observed app-facing fields:

- `user_id`
- `accent_color`

## RPCs Used By App Code

- `accept_friend_request(p_request_id)`
- `reject_friend_request(p_request_id)`

## Storage Buckets Used By App Code

### `avatars`

Used for:

- profile photos
- banner photos
- car photos
- meet cover images

Known upload paths include:

- `{userId}/...`
- `{userId}/cars/...`
- `{userId}/meets/...`

## Realtime Subscriptions Used By App Code

- `locations`
- `meets`
- `meet_attendees`
- `friend_requests`

## Baseline

The authoritative baseline schema is committed under `supabase/migrations/20260726000000_baseline_current_remote_schema.sql`.