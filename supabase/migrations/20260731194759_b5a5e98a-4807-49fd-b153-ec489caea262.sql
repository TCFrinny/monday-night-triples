-- 1. Clean up duplicate simultaneously-active roster rows (test data, no finalized matches).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY team_id, slot ORDER BY created_at DESC, id DESC) AS rn
  FROM public.roster_spots
  WHERE effective_to_week IS NULL
)
DELETE FROM public.roster_spots rs
USING ranked r
WHERE rs.id = r.id AND r.rn > 1;

-- Safety: if any bowler still appears active on two teams, keep the newest.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY bowler_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.roster_spots
  WHERE effective_to_week IS NULL
)
DELETE FROM public.roster_spots rs
USING ranked r
WHERE rs.id = r.id AND r.rn > 1;

-- 2. One active assignment per team + slot.
CREATE UNIQUE INDEX IF NOT EXISTS roster_spots_active_team_slot_uniq
  ON public.roster_spots (team_id, slot)
  WHERE effective_to_week IS NULL;

-- 3. A bowler can only be an active roster member of one team at a time.
CREATE UNIQUE INDEX IF NOT EXISTS roster_spots_active_bowler_uniq
  ON public.roster_spots (bowler_id)
  WHERE effective_to_week IS NULL;