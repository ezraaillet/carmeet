-- Avoid mutual RLS policy evaluation between meets and meet_attendees.

create or replace function public.can_access_meet(p_meet_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.meets m
    where m.id = p_meet_id
      and (
        m.is_public = true
        or m.created_by = auth.uid()
        or exists (
          select 1
          from public.meet_attendees a
          where a.meet_id = m.id and a.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.can_access_meet(uuid) from public;
grant execute on function public.can_access_meet(uuid) to authenticated;

drop policy if exists "Users can view accessible meets" on public.meets;
create policy "Users can view accessible meets"
on public.meets for select
using (public.can_access_meet(id));

drop policy if exists "Users can view accessible meet attendees" on public.meet_attendees;
create policy "Users can view accessible meet attendees"
on public.meet_attendees for select
using (
  auth.uid() = user_id
  or public.can_access_meet(meet_id)
);
