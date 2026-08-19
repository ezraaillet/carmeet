-- Let authenticated users report accounts and meets for moderation review.

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete cascade,
  reported_meet_id uuid references public.meets(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'spam', 'inappropriate', 'scam', 'other')),
  details text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint content_reports_one_target check (
    (reported_user_id is not null and reported_meet_id is null)
    or (reported_user_id is null and reported_meet_id is not null)
  ),
  constraint content_reports_no_self_user check (
    reported_user_id is null or reporter_id <> reported_user_id
  ),
  constraint content_reports_details_length check (
    details is null or char_length(details) <= 1000
  )
);

create unique index if not exists content_reports_user_once
  on public.content_reports (reporter_id, reported_user_id)
  where reported_user_id is not null;

create unique index if not exists content_reports_meet_once
  on public.content_reports (reporter_id, reported_meet_id)
  where reported_meet_id is not null;

create index if not exists content_reports_status_created_at_idx
  on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;

drop policy if exists "Users can submit content reports" on public.content_reports;
create policy "Users can submit content reports"
on public.content_reports for insert
with check (auth.uid() = reporter_id and status = 'pending');

drop policy if exists "Users can view their own content reports" on public.content_reports;
create policy "Users can view their own content reports"
on public.content_reports for select
using (auth.uid() = reporter_id);

revoke all on table public.content_reports from public;
grant insert, select on table public.content_reports to authenticated;
