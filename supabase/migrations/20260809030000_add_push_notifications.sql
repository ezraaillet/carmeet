-- Device tokens and a server-side queue for Expo push notifications.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  enabled boolean not null default true,
  constraint push_tokens_platform_check check (platform in ('ios', 'android')),
  constraint push_tokens_token_key unique (expo_push_token)
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

create index if not exists idx_push_tokens_user_id
  on public.push_tokens(user_id)
  where enabled = true;

create index if not exists idx_notification_events_pending
  on public.notification_events(created_at)
  where sent_at is null;

create or replace trigger set_push_tokens_updated_at
before update on public.push_tokens
for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;
alter table public.notification_events enable row level security;

create policy "Users manage their own push tokens"
on public.push_tokens for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can view their own notification events"
on public.notification_events for select
using (auth.uid() = recipient_user_id);

grant select, insert, update, delete on public.push_tokens to authenticated;
grant select on public.notification_events to authenticated;

create or replace function public.enqueue_notification(
  p_recipient_user_id uuid,
  p_notification_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notification_events (
    recipient_user_id,
    notification_type,
    title,
    body,
    data
  )
  values (
    p_recipient_user_id,
    p_notification_type,
    p_title,
    p_body,
    coalesce(p_data, '{}'::jsonb)
  );
$$;

revoke all on function public.enqueue_notification(uuid, text, text, text, jsonb) from public;
revoke execute on function public.enqueue_notification(uuid, text, text, text, jsonb) from authenticated;

create or replace function public.enqueue_friend_request_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.enqueue_notification(
      new.to_user_id,
      'friend_request',
      'New friend request',
      'Someone wants to connect with you on Cruizr.',
      jsonb_build_object('request_id', new.id, 'user_id', new.from_user_id)
    );
  elsif tg_op = 'UPDATE' and new.status = 'accepted'
    and old.status is distinct from new.status then
    perform public.enqueue_notification(
      new.from_user_id,
      'friend_request_accepted',
      'Friend request accepted',
      'You are now connected on Cruizr.',
      jsonb_build_object('request_id', new.id, 'user_id', new.to_user_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists enqueue_friend_request_notification on public.friend_requests;
create trigger enqueue_friend_request_notification
after insert or update of status on public.friend_requests
for each row execute function public.enqueue_friend_request_notification();

create or replace function public.enqueue_attendance_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meet public.meets;
  v_should_notify boolean := false;
begin
  select * into v_meet from public.meets where id = new.meet_id;

  if tg_op = 'INSERT' then
    v_should_notify := true;
  elsif tg_op = 'UPDATE' then
    v_should_notify := old.status is distinct from new.status;
  end if;

  if v_meet.created_by <> new.user_id and v_should_notify then
    perform public.enqueue_notification(
      v_meet.created_by,
      'meet_attendance',
      'Meet attendance updated',
      'Someone updated their attendance for your meet.',
      jsonb_build_object('meet_id', new.meet_id, 'user_id', new.user_id, 'status', new.status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists enqueue_attendance_notification on public.meet_attendees;
create trigger enqueue_attendance_notification
after insert or update of status on public.meet_attendees
for each row execute function public.enqueue_attendance_notification();

create or replace function public.enqueue_meet_update_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  attendee record;
  v_type text;
  v_title text;
  v_body text;
begin
  if old.status is distinct from new.status and new.status = 'cancelled' then
    v_type := 'meet_cancelled';
    v_title := 'Meet cancelled';
    v_body := new.title || ' was cancelled.';
  elsif old.start_time is distinct from new.start_time
    or old.end_time is distinct from new.end_time
    or old.location_name is distinct from new.location_name
    or old.address is distinct from new.address then
    v_type := 'meet_updated';
    v_title := 'Meet updated';
    v_body := new.title || ' has new details.';
  else
    return new;
  end if;

  for attendee in
    select user_id from public.meet_attendees
    where meet_id = new.id and user_id <> new.created_by
  loop
    perform public.enqueue_notification(
      attendee.user_id,
      v_type,
      v_title,
      v_body,
      jsonb_build_object('meet_id', new.id)
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists enqueue_meet_update_notifications on public.meets;
create trigger enqueue_meet_update_notifications
after update on public.meets
for each row execute function public.enqueue_meet_update_notifications();
