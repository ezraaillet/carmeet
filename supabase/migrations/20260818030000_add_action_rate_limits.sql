-- Add server-side volume limits for common abuse vectors.

create or replace function public.guard_action_rate_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if tg_table_name = 'friend_requests' then
    select count(*) into v_count
    from public.friend_requests
    where from_user_id = new.from_user_id
      and created_at > now() - interval '1 hour';

    if v_count >= 30 then
      raise exception 'Friend request limit reached. Try again later.';
    end if;
  elsif tg_table_name = 'meets' then
    select count(*) into v_count
    from public.meets
    where created_by = new.created_by
      and created_at > now() - interval '24 hours';

    if v_count >= 10 then
      raise exception 'Meet creation limit reached. Try again later.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists rate_limit_friend_requests on public.friend_requests;
create trigger rate_limit_friend_requests
before insert on public.friend_requests
for each row execute function public.guard_action_rate_limits();

drop trigger if exists rate_limit_meets on public.meets;
create trigger rate_limit_meets
before insert on public.meets
for each row execute function public.guard_action_rate_limits();
