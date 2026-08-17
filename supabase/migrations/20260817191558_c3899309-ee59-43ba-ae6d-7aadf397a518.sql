CREATE OR REPLACE FUNCTION public.apply_week_dates(p_season_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int := 0;
  v_inserted int := 0;
  v_locked int[] := '{}';
  r record;
  v_existing_id uuid;
  v_has_final boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can rewrite week dates.';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'No week dates supplied.';
  END IF;

  FOR r IN
    SELECT (x->>'week_number')::int AS week_number,
           (x->>'bowl_date')::date AS bowl_date,
           (x->>'third')::smallint AS third,
           COALESCE((x->>'is_position_round')::boolean, false) AS is_position_round
    FROM jsonb_array_elements(p_rows) x
    ORDER BY (x->>'week_number')::int
  LOOP
    IF r.week_number IS NULL OR r.week_number < 1 THEN
      RAISE EXCEPTION 'Invalid week number in payload.';
    END IF;

    SELECT w.id INTO v_existing_id
    FROM public.weeks w
    WHERE w.season_id = p_season_id AND w.week_number = r.week_number;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.weeks (season_id, week_number, bowl_date, third, is_position_round)
      VALUES (p_season_id, r.week_number, r.bowl_date, r.third, r.is_position_round);
      v_inserted := v_inserted + 1;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.matches m WHERE m.week_id = v_existing_id AND m.status = 'final'
      ) INTO v_has_final;

      IF v_has_final THEN
        -- Finalized weeks keep their historical date; nothing is rewritten.
        v_locked := array_append(v_locked, r.week_number);
      ELSE
        UPDATE public.weeks
        SET bowl_date = r.bowl_date,
            third = r.third,
            is_position_round = r.is_position_round,
            updated_at = now()
        WHERE id = v_existing_id;
        v_updated := v_updated + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'inserted', v_inserted,
    'locked', to_jsonb(v_locked)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_week_dates(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_week_dates(uuid, jsonb) TO authenticated;