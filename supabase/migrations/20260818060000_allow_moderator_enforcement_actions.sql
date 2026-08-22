-- Moderators must be able to remove content from restricted accounts.

create or replace function public.guard_restricted_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if is_moderator() then
    return new;
  end if;

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
