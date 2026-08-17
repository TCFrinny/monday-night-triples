CREATE OR REPLACE FUNCTION public.shift_schedule_dates(
  p_season_id uuid,
  p_from_week integer,
  p_days integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moved integer;
  v_blocked integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can shift the schedule.';
  END IF;

  IF p_days IS NULL OR p_days <= 0 OR p_days % 7 <> 0 THEN
    RAISE EXCEPTION 'Shifts must be a positive whole number of weeks (multiples of 7 days).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.weeks w
    WHERE w.season_id = p_season_id AND w.week_number = p_from_week
  ) THEN
    RAISE EXCEPTION 'Week % does not exist in this season.', p_from_week;
  END IF;

  SELECT MIN(w.week_number) INTO v_blocked
  FROM public.weeks w
  JOIN public.matches m ON m.week_id = w.id
  WHERE w.season_id = p_season_id
    AND w.week_number >= p_from_week
    AND m.status = 'final';

  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'Week % already has finalized results; postponing it would rewrite played history.', v_blocked;
  END IF;

  UPDATE public.weeks w
  SET bowl_date = w.bowl_date + p_days,
      updated_at = now()
  WHERE w.season_id = p_season_id
    AND w.week_number >= p_from_week
    AND w.bowl_date IS NOT NULL;

  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.shift_schedule_dates(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shift_schedule_dates(uuid, integer, integer) TO authenticated;