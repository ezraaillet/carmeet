-- Allow users to hide and disconnect unwanted accounts.

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_pkey primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id)
);

create index if not exists idx_user_blocks_blocked_id
  on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "Users can view their own blocks" on public.user_blocks;
create policy "Users can view their own blocks"
on public.user_blocks for select
using (auth.uid() = blocker_id);

drop policy if exists "Users can create their own blocks" on public.user_blocks;
create policy "Users can create their own blocks"
on public.user_blocks for insert
with check (auth.uid() = blocker_id and blocker_id <> blocked_id);

drop policy if exists "Users can remove their own blocks" on public.user_blocks;
create policy "Users can remove their own blocks"
on public.user_blocks for delete
using (auth.uid() = blocker_id);

create or replace function public.block_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_blocked_id is null or p_blocked_id = auth.uid() then
    raise exception 'Invalid user to block';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (auth.uid(), p_blocked_id)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.friend_requests
  where (from_user_id = auth.uid() and to_user_id = p_blocked_id)
     or (from_user_id = p_blocked_id and to_user_id = auth.uid());

  delete from public.friendships
  where (user_id = auth.uid() and friend_id = p_blocked_id)
     or (user_id = p_blocked_id and friend_id = auth.uid());
end;
$$;

create or replace function public.unblock_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from public.user_blocks
  where blocker_id = auth.uid() and blocked_id = p_blocked_id;
end;
$$;

create or replace function public.is_user_blocked(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = p_user_id)
       or (b.blocker_id = p_user_id and b.blocked_id = auth.uid())
  );
$$;

revoke all on function public.block_user(uuid) from public;
revoke all on function public.unblock_user(uuid) from public;
revoke all on function public.is_user_blocked(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.is_user_blocked(uuid) to authenticated;

create or replace function public.get_nearby_public_locations(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 100
)
returns table (
  user_id uuid,
  lat double precision,
  lng double precision,
  heading double precision,
  speed double precision,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select greatest(1, least(coalesce(p_radius_m, 100), 5000)) as radius_m,
      p_lat as origin_lat, p_lng as origin_lng
  )
  select l.user_id, l.lat, l.lng, l.heading, l.speed, l.updated_at
  from public.locations l
  join public.profiles p on p.id = l.user_id
  cross join bounds b
  where auth.uid() is not null
    and not public.is_user_blocked(l.user_id)
    and coalesce(p.profile_visibility, 'public') = 'public'
    and p.location_visibility = 'everyone'
    and l.updated_at >= now() - interval '2 minutes'
    and l.lat between b.origin_lat - (b.radius_m / 111111.0)
      and b.origin_lat + (b.radius_m / 111111.0)
    and l.lng between b.origin_lng - (b.radius_m / (111111.0 * greatest(cos(radians(b.origin_lat)), 0.01)))
      and b.origin_lng + (b.radius_m / (111111.0 * greatest(cos(radians(b.origin_lat)), 0.01)))
    and 6371000 * 2 * asin(sqrt(
      power(sin(radians(l.lat - b.origin_lat) / 2), 2) +
      cos(radians(b.origin_lat)) * cos(radians(l.lat)) *
      power(sin(radians(l.lng - b.origin_lng) / 2), 2)
    )) <= b.radius_m;
$$;

revoke all on function public.get_nearby_public_locations(double precision, double precision, double precision) from public;
grant execute on function public.get_nearby_public_locations(double precision, double precision, double precision) to authenticated;

drop policy if exists "Users can view accessible meets" on public.meets;
create policy "Users can view accessible meets"
on public.meets for select
using (
  not public.is_user_blocked(created_by)
  and (
    is_public = true
    or auth.uid() = created_by
    or exists (
      select 1 from public.meet_attendees a
      where a.meet_id = meets.id and a.user_id = auth.uid()
    )
  )
);

drop policy if exists "Users can view visible profiles" on public.profiles;
create policy "Users can view visible profiles"
on public.profiles for select
using (
  auth.uid() = id
  or (
    not public.is_user_blocked(id)
    and (
      coalesce(profile_visibility, 'public') = 'public'
      or (
        coalesce(profile_visibility, 'public') = 'friends'
        and exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.user_id = auth.uid() and f.friend_id = profiles.id)
              or (f.friend_id = auth.uid() and f.user_id = profiles.id))
        )
      )
    )
  )
);

drop policy if exists "Locations read accepted friends" on public.locations;
create policy "Locations read accepted friends"
on public.locations for select
using (
  auth.uid() = user_id
  or (
    not public.is_user_blocked(user_id)
    and updated_at >= now() - interval '2 minutes'
    and exists (
      select 1 from public.friendships f
      join public.profiles p on p.id = locations.user_id
      where f.status = 'accepted'
        and p.location_visibility <> 'none'
        and ((f.user_id = auth.uid() and f.friend_id = locations.user_id)
          or (f.friend_id = auth.uid() and f.user_id = locations.user_id))
    )
  )
);

drop policy if exists "Users can view accessible meet attendees" on public.meet_attendees;
create policy "Users can view accessible meet attendees"
on public.meet_attendees for select
using (
  auth.uid() is not null
  and not public.is_user_blocked(user_id)
  and (
    auth.uid() = user_id
    or exists (
      select 1 from public.meets m
      where m.id = meet_attendees.meet_id
        and (m.is_public = true or m.created_by = auth.uid())
    )
  )
);

drop policy if exists "friend_requests_read_own" on public.friend_requests;
create policy "friend_requests_read_own"
on public.friend_requests for select to authenticated
using (
  (auth.uid() = from_user_id or auth.uid() = to_user_id)
  and not public.is_user_blocked(case when auth.uid() = from_user_id then to_user_id else from_user_id end)
);

drop policy if exists "friend_requests_insert_own" on public.friend_requests;
create policy "friend_requests_insert_own"
on public.friend_requests for insert to authenticated
with check (
  auth.uid() = from_user_id
  and not public.is_user_blocked(to_user_id)
);

drop policy if exists "friendships select participants" on public.friendships;
create policy "friendships select participants"
on public.friendships for select
using (
  (auth.uid() = user_id or auth.uid() = friend_id)
  and not public.is_user_blocked(case when auth.uid() = user_id then friend_id else user_id end)
);
