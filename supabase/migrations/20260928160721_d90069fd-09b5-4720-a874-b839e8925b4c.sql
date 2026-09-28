create or replace function public.correct_entry_average(p_bowler_id uuid, p_new_average numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old numeric;
  v_snapshots integer;
  v_matches uuid[];
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admin role required';
  end if;
  if p_new_average is null or p_new_average < 0 or p_new_average > 300 then
    raise exception 'Invalid entering average';
  end if;

  select entry_average into v_old from public.bowlers where id = p_bowler_id;
  if v_old is null then
    raise exception 'Bowler not found';
  end if;
  if v_old = p_new_average then
    raise exception 'New average equals the current entering average';
  end if;

  update public.bowlers set entry_average = p_new_average where id = p_bowler_id;

  update public.match_lineups ml
  set applicable_average = p_new_average,
      applicable_average_truncated = floor(p_new_average)
  where ml.average_source = 'entry'
    and (ml.bowler_id = p_bowler_id or ml.absent_bowler_id = p_bowler_id);
  get diagnostics v_snapshots = row_count;
  select array_agg(distinct ml.match_id) into v_matches
  from public.match_lineups ml
  where ml.average_source = 'entry'
    and (ml.bowler_id = p_bowler_id or ml.absent_bowler_id = p_bowler_id);

  return jsonb_build_object(
    'old_average', v_old,
    'new_average', p_new_average,
    'snapshots_updated', v_snapshots,
    'match_ids', coalesce(v_matches, '{}'::uuid[])
  );
end;
$$;