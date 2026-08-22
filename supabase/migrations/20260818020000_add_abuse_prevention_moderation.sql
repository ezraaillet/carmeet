-- Database-owned abuse prevention and moderation controls.

create table if not exists public.moderation_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.account_moderation (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'warned', 'suspended', 'banned')),
  reason text,
  expires_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete restrict,
  report_id uuid references public.content_reports(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_meet_id uuid references public.meets(id) on delete set null,
  action text not null check (action in ('warn', 'suspend', 'ban', 'reinstate', 'remove_meet', 'dismiss')),
  notes text,
  created_at timestamptz not null default now(),
  constraint moderation_actions_target_check check (
    target_user_id is not null or target_meet_id is not null or report_id is not null
  )
);

create index if not exists moderation_actions_target_user_idx
  on public.moderation_actions (target_user_id, created_at desc);

create index if not exists moderation_actions_report_idx
  on public.moderation_actions (report_id, created_at desc);

alter table public.moderation_admins enable row level security;
alter table public.account_moderation enable row level security;
alter table public.moderation_actions enable row level security;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.moderation_admins where user_id = auth.uid()
  );
$$;

create or replace function public.is_account_restricted(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_moderation
    where user_id = p_user_id
      and status in ('suspended', 'banned')
      and (expires_at is null or expires_at > now())
  );
$$;

create or replace function public.submit_content_report(
  p_reported_user_id uuid default null,
  p_reported_meet_id uuid default null,
  p_reason text default null,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid;
  v_reporter uuid := auth.uid();
begin
  if v_reporter is null then
    raise exception 'Authentication required';
  end if;

  if is_account_restricted(v_reporter) then
    raise exception 'Account is not allowed to submit reports';
  end if;

  if (p_reported_user_id is null) = (p_reported_meet_id is null) then
    raise exception 'Exactly one report target is required';
  end if;

  if p_reported_user_id = v_reporter then
    raise exception 'You cannot report yourself';
  end if;

  if p_reason not in ('harassment', 'spam', 'inappropriate', 'scam', 'other') then
    raise exception 'Invalid report reason';
  end if;

  if p_details is not null and char_length(p_details) > 1000 then
    raise exception 'Report details are too long';
  end if;

  if (
    select count(*) from public.content_reports
    where reporter_id = v_reporter
      and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'Report limit reached. Try again later.';
  end if;

  insert into public.content_reports (
    reporter_id, reported_user_id, reported_meet_id, reason, details
  ) values (
    v_reporter, p_reported_user_id, p_reported_meet_id, p_reason, nullif(trim(p_details), '')
  ) returning id into v_report_id;

  return v_report_id;
exception
  when unique_violation then
    raise exception 'You have already reported this content';
end;
$$;

create or replace function public.guard_restricted_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := case
    when tg_table_name = 'meets' then new.created_by
    when tg_table_name = 'friend_requests' then new.from_user_id
    when tg_table_name = 'locations' then new.user_id
    when tg_table_name = 'meet_attendees' then new.user_id
  end;

  if is_account_restricted(v_user_id) then
    raise exception 'Account is restricted';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_meets_account on public.meets;
create trigger guard_meets_account
before insert or update on public.meets
for each row execute function public.guard_restricted_account();

drop trigger if exists guard_friend_requests_account on public.friend_requests;
create trigger guard_friend_requests_account
before insert or update on public.friend_requests
for each row execute function public.guard_restricted_account();

drop trigger if exists guard_locations_account on public.locations;
create trigger guard_locations_account
before insert or update on public.locations
for each row execute function public.guard_restricted_account();

drop trigger if exists guard_meet_attendees_account on public.meet_attendees;
create trigger guard_meet_attendees_account
before insert or update on public.meet_attendees
for each row execute function public.guard_restricted_account();

create or replace function public.moderate_report(
  p_report_id uuid,
  p_action text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.content_reports;
  v_status text;
begin
  if not is_moderator() then
    raise exception 'Moderator access required';
  end if;

  select * into v_report from public.content_reports where id = p_report_id;
  if not found then raise exception 'Report not found'; end if;

  if p_action not in ('warn', 'suspend', 'ban', 'reinstate', 'remove_meet', 'dismiss') then
    raise exception 'Invalid moderation action';
  end if;

  v_status := case when p_action = 'dismiss' then 'dismissed' else 'actioned' end;
  update public.content_reports set status = v_status where id = p_report_id;

  if p_action = 'remove_meet' and v_report.reported_meet_id is not null then
    update public.meets set status = 'cancelled' where id = v_report.reported_meet_id;
  elsif v_report.reported_user_id is not null and p_action in ('warn', 'suspend', 'ban', 'reinstate') then
    insert into public.account_moderation (user_id, status, reason, expires_at, updated_by, updated_at)
    values (
      v_report.reported_user_id,
      case when p_action = 'reinstate' then 'active' else p_action end,
      p_notes,
      case when p_action = 'suspend' then now() + interval '7 days' else null end,
      auth.uid(), now()
    )
    on conflict (user_id) do update set
      status = excluded.status,
      reason = excluded.reason,
      expires_at = excluded.expires_at,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  end if;

  insert into public.moderation_actions (
    admin_id, report_id, target_user_id, target_meet_id, action, notes
  ) values (
    auth.uid(), p_report_id, v_report.reported_user_id, v_report.reported_meet_id, p_action, p_notes
  );
end;
$$;

drop policy if exists "Users can submit content reports" on public.content_reports;
revoke insert on public.content_reports from authenticated;
grant execute on function public.submit_content_report(uuid, uuid, text, text) to authenticated;

drop policy if exists "Moderators can view all reports" on public.content_reports;
create policy "Moderators can view all reports"
on public.content_reports for select
using (public.is_moderator());

drop policy if exists "Moderators can update reports" on public.content_reports;
create policy "Moderators can update reports"
on public.content_reports for update
using (public.is_moderator())
with check (public.is_moderator());

drop policy if exists "Users can view own moderation status" on public.account_moderation;
create policy "Users can view own moderation status"
on public.account_moderation for select
using (auth.uid() = user_id or public.is_moderator());

drop policy if exists "Moderators can view moderation actions" on public.moderation_actions;
create policy "Moderators can view moderation actions"
on public.moderation_actions for select
using (public.is_moderator());

revoke all on public.moderation_admins from public;
revoke all on public.account_moderation from public;
revoke all on public.moderation_actions from public;
grant select on public.content_reports to authenticated;
grant select on public.account_moderation to authenticated;
grant select on public.moderation_actions to authenticated;
grant execute on function public.is_moderator() to authenticated;
grant execute on function public.is_account_restricted(uuid) to authenticated;
grant execute on function public.moderate_report(uuid, text, text) to authenticated;
