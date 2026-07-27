# Database Migrations

Migrations in this folder are the source-controlled history for Supabase schema changes.

This folder intentionally uses Supabase CLI's default location: supabase/migrations/.

## Baseline

Migration tracking started after the remote Supabase project already had tables, policies, storage buckets, and RPCs.

The current baseline is:

`	ext
supabase/migrations/20260726000000_baseline_current_remote_schema.sql
`

It was generated from the remote Supabase schema with supabase db dump --linked.

## Future Migration Template

`sql
-- Purpose: Explain what this migration changes and why.
-- Depends on: Mention prior tables/functions/policies if relevant.

begin;

-- schema changes here

commit;
`

## Rules

- One logical database change per migration when practical.
- Prefer additive migrations for app-facing changes.
- Include RLS policy updates with the table change that needs them.
- Include RPC/function changes in migrations, not dashboard-only edits.
- Include storage bucket policy changes when uploads or reads change.
- Never edit an already-applied migration; add a new migration instead.