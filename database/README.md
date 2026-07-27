# Database

This folder tracks the app-side Supabase/Postgres contract used by Cruizr.

- supabase.ts creates the app Supabase client.
- schema-contract.md documents the tables, RPCs, storage buckets, and realtime contracts the app expects.

Versioned SQL migrations live in supabase/migrations/, which is the Supabase CLI default location.

## Migration Rule

Do not make database changes only through the Supabase dashboard or loose SQL snippets.

For every database change:

1. Add a timestamped SQL migration under supabase/migrations/.
2. Apply that migration to Supabase with the CLI or SQL editor as appropriate.
3. Update database/schema-contract.md when app-facing contracts change.
4. Commit the migration with the app code that depends on it.

## Naming

Use UTC timestamps:

`	ext
supabase/migrations/YYYYMMDDHHMMSS_short_description.sql
`

Example:

`	ext
supabase/migrations/20260726153000_add_meet_cover_images.sql
`