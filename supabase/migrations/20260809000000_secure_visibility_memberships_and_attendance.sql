-- Enforce authorization and privacy rules that cannot safely live in the client.

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
    select
      greatest(1, least(coalesce(p_radius_m, 100), 5000)) as radius_m,
      p_lat as origin_lat,
      p_lng as origin_lng
  )
  select
    l.user_id,
    l.lat,
    l.lng,
    l.heading,
    l.speed,
    l.updated_at
  from public.locations l
  join public.profiles p on p.id = l.user_id
  cross join bounds b
  where auth.uid() is not null
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

create or replace function public.set_meet_attendance(
  p_meet_id uuid,
  p_status text
)
returns public.meet_attendees
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meet public.meets;
  v_attendance public.meet_attendees;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_meet
  from public.meets
  where id = p_meet_id
  for update;

  if not found then
    raise exception 'Meet not found';
  end if;

  if v_meet.status <> 'upcoming' then
    raise exception 'This meet is no longer accepting attendance';
  end if;

  if not v_meet.is_public
    and v_meet.created_by <> auth.uid()
    and not exists (
      select 1 from public.meet_attendees
      where meet_id = p_meet_id and user_id = auth.uid()
    ) then
    raise exception 'This private meet is not available to you';
  end if;

  if p_status is null then
    delete from public.meet_attendees
    where meet_id = p_meet_id and user_id = auth.uid();
    return null;
  end if;

  if p_status not in ('going', 'interested') then
    raise exception 'Invalid attendance status';
  end if;

  if p_status = 'going'
    and v_meet.max_attendees is not null
    and not exists (
      select 1
      from public.meet_attendees
      where meet_id = p_meet_id
        and user_id = auth.uid()
        and status = 'going'
    )
    and (
      select count(*)
      from public.meet_attendees
      where meet_id = p_meet_id and status = 'going'
    ) >= v_meet.max_attendees then
    raise exception 'This meet is full';
  end if;

  insert into public.meet_attendees (meet_id, user_id, status, updated_at)
  values (p_meet_id, auth.uid(), p_status, now())
  on conflict (meet_id, user_id) do update
    set status = excluded.status, updated_at = now()
  returning * into v_attendance;

  return v_attendance;
end;
$$;

revoke all on function public.set_meet_attendance(uuid, text) from public;
grant execute on function public.set_meet_attendance(uuid, text) to authenticated;

create or replace function public.enforce_free_car_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.user_memberships
    where user_id = new.user_id
      and plan = 'premium'
      and status = 'active'
  ) and exists (
    select 1
    from public.cars
    where user_id = new.user_id and id <> coalesce(new.id, gen_random_uuid())
  ) then
    raise exception 'Premium is required to add more than one car';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_free_car_limit on public.cars;
create trigger enforce_free_car_limit
before insert or update of user_id on public.cars
for each row execute function public.enforce_free_car_limit();

drop policy if exists "Users can update their own membership" on public.user_memberships;
drop policy if exists "Users can delete their own membership" on public.user_memberships;
drop policy if exists "Users can create their own membership" on public.user_memberships;
create policy "Users can create their own free membership"
on public.user_memberships for insert
with check (
  auth.uid() = user_id
  and plan = 'free'
  and status = 'active'
  and provider is null
  and provider_customer_id is null
  and provider_subscription_id is null
);

drop policy if exists "Public meets are viewable" on public.meets;
create policy "Users can view accessible meets"
on public.meets for select
using (
  is_public = true
  or auth.uid() = created_by
  or exists (
    select 1 from public.meet_attendees a
    where a.meet_id = meets.id and a.user_id = auth.uid()
  )
);

drop policy if exists "Users can create meets" on public.meets;
create policy "Premium users can create meets"
on public.meets for insert
with check (
  auth.uid() = created_by
  and exists (
    select 1 from public.user_memberships m
    where m.user_id = auth.uid() and m.plan = 'premium' and m.status = 'active'
  )
);

drop policy if exists "Users can update their own meets" on public.meets;
create policy "Premium users can update their own meets"
on public.meets for update
using (
  auth.uid() = created_by
  and exists (
    select 1 from public.user_memberships m
    where m.user_id = auth.uid() and m.plan = 'premium' and m.status = 'active'
  )
)
with check (auth.uid() = created_by);

drop policy if exists "Users can delete their own meets" on public.meets;
create policy "Premium users can delete their own meets"
on public.meets for delete
using (
  auth.uid() = created_by
  and exists (
    select 1 from public.user_memberships m
    where m.user_id = auth.uid() and m.plan = 'premium' and m.status = 'active'
  )
);

drop policy if exists "Users can join meets" on public.meet_attendees;
drop policy if exists "Users can update their attendance" on public.meet_attendees;
drop policy if exists "Users can leave meets" on public.meet_attendees;
drop policy if exists "Users can view attendees" on public.meet_attendees;
create policy "Users can view accessible meet attendees"
on public.meet_attendees for select
using (
  auth.uid() is not null
  and (
    auth.uid() = user_id
  or exists (
    select 1 from public.meets m
    where m.id = meet_attendees.meet_id
      and (m.is_public = true or m.created_by = auth.uid())
  ))
);

drop policy if exists "Users can view cars" on public.cars;
create policy "Users can view visible cars"
on public.cars for select
using (
  auth.uid() is not null
  and (
    auth.uid() = user_id
  or exists (
    select 1 from public.profiles p
    where p.id = cars.user_id
      and (
        coalesce(p.profile_visibility, 'public') = 'public'
        or (
            coalesce(p.profile_visibility, 'public') = 'friends'
          and exists (
            select 1 from public.friendships f
            where f.status = 'accepted'
              and ((f.user_id = auth.uid() and f.friend_id = cars.user_id)
                or (f.friend_id = auth.uid() and f.user_id = cars.user_id))
          )
        )
      )
  ))
);

drop policy if exists "Users can view profile customizations" on public.profile_customizations;
create policy "Users can view visible profile customizations"
on public.profile_customizations for select
using (
  auth.uid() is not null
  and (
    auth.uid() = user_id
  or exists (
    select 1 from public.profiles p
    where p.id = profile_customizations.user_id
      and coalesce(p.profile_visibility, 'public') = 'public'
  ))
);

drop policy if exists "Users can manage their own customizations" on public.profile_customizations;
create policy "Premium users can manage their own customizations"
on public.profile_customizations for all
using (
  auth.uid() = user_id
  and exists (
    select 1 from public.user_memberships m
    where m.user_id = auth.uid() and m.plan = 'premium' and m.status = 'active'
  )
)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.user_memberships m
    where m.user_id = auth.uid() and m.plan = 'premium' and m.status = 'active'
  )
);

drop policy if exists "profiles read all" on public.profiles;
create policy "Users can view visible profiles"
on public.profiles for select
using (
  auth.uid() is not null
  and (
    auth.uid() = id
  or coalesce(profile_visibility, 'public') = 'public'
  or (
    coalesce(profile_visibility, 'public') = 'friends'
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.user_id = auth.uid() and f.friend_id = profiles.id)
          or (f.friend_id = auth.uid() and f.user_id = profiles.id))
    )
  ))
);

drop policy if exists "locations read everyone" on public.locations;
drop policy if exists "locations read accepted friends" on public.locations;
create policy "Locations read accepted friends"
on public.locations for select
using (
  auth.uid() = user_id
  or (
    updated_at >= now() - interval '2 minutes'
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

create policy "Locations delete own"
on public.locations for delete
using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meets'
  ) then
    alter publication supabase_realtime add table public.meets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meet_attendees'
  ) then
    alter publication supabase_realtime add table public.meet_attendees;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friend_requests'
  ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
end;
$$;
