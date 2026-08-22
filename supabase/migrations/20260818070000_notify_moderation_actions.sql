-- Notify users when an account moderation action changes their status.

create or replace function public.enqueue_moderation_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_expires_at timestamptz;
  v_title text;
  v_body text;
begin
  if new.target_user_id is null
    or new.action not in ('warn', 'suspend', 'ban', 'reinstate') then
    return new;
  end if;

  select status, expires_at
    into v_status, v_expires_at
  from public.account_moderation
  where user_id = new.target_user_id;

  if new.action = 'warn' then
    v_title := 'Account warning';
    v_body := 'Your account received a warning. Reason: '
      || coalesce(nullif(new.notes, ''), 'Community guidelines violation')
      || '. Please review the guidelines or contact support if you believe this is incorrect.';
  elsif new.action = 'suspend' then
    v_title := 'Account suspended';
    v_body := 'Your account is suspended until '
      || coalesce(to_char(v_expires_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI UTC'), 'further notice')
      || '. Reason: '
      || coalesce(nullif(new.notes, ''), 'Community guidelines violation')
      || '. Contact support to appeal.';
  elsif new.action = 'ban' then
    v_title := 'Account banned';
    v_body := 'Your account has been permanently banned. Reason: '
      || coalesce(nullif(new.notes, ''), 'Community guidelines violation')
      || '. Contact support to appeal.';
  else
    v_title := 'Account access restored';
    v_body := 'Your account has been reinstated and access is restored.';
  end if;

  perform public.enqueue_notification(
    new.target_user_id,
    'moderation_' || new.action,
    v_title,
    v_body,
    jsonb_build_object(
      'moderation_action', new.action,
      'moderation_status', v_status,
      'expires_at', v_expires_at,
      'report_id', new.report_id,
      'appeal', true
    )
  );

  return new;
end;
$$;

drop trigger if exists enqueue_moderation_notification on public.moderation_actions;
create trigger enqueue_moderation_notification
after insert on public.moderation_actions
for each row execute function public.enqueue_moderation_notification();
