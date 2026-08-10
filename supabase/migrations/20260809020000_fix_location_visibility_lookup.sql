-- Keep location visibility checks out of nested RLS evaluation.

create or replace function public.can_view_friend_location(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.friendships f
      join public.profiles p on p.id = p_user_id
      where f.status = 'accepted'
        and coalesce(p.location_visibility, 'friends') <> 'none'
        and ((f.user_id = auth.uid() and f.friend_id = p_user_id)
          or (f.friend_id = auth.uid() and f.user_id = p_user_id))
    );
$$;

revoke all on function public.can_view_friend_location(uuid) from public;
grant execute on function public.can_view_friend_location(uuid) to authenticated;

drop policy if exists "Locations read accepted friends" on public.locations;
create policy "Locations read accepted friends"
on public.locations for select
using (
  auth.uid() is not null
  and (
    auth.uid() = user_id
    or (
      updated_at >= now() - interval '2 minutes'
      and public.can_view_friend_location(user_id)
    )
  )
);
