-- Friends may see a friend's last known location even after it becomes stale.
-- Public discovery remains limited to active locations by its RPC and policy.

drop policy if exists "Locations read accepted friends" on public.locations;
create policy "Locations read accepted friends"
on public.locations for select
using (
  auth.uid() = user_id
  or (
    not public.is_user_blocked(user_id)
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
