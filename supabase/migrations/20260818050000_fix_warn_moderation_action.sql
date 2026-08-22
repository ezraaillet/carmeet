-- Map warn to the account_moderation status value warned.

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
  v_account_status text;
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
    v_account_status := case p_action
      when 'warn' then 'warned'
      when 'suspend' then 'suspended'
      when 'reinstate' then 'active'
      else p_action
    end;

    insert into public.account_moderation (user_id, status, reason, expires_at, updated_by, updated_at)
    values (
      v_report.reported_user_id,
      v_account_status,
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
