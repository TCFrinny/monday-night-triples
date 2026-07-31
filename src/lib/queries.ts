import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StandingsScope } from "@/lib/league";

export interface Season {
  id: string;
  league_name: string;
  sponsor: string | null;
  display_name: string;
  logo_url: string | null;
  center_name: string;
  season_name: string;
  team_count: number;
  total_weeks: number;
  position_round_weeks: number[];
  third_boundaries: number[];
  handicap_percent: number;
  establishment_threshold: number;
  blind_deduction: number;
  is_active: boolean;
}

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

export const activeSeasonQuery = queryOptions({
  queryKey: ["season", "active"],
  queryFn: async (): Promise<Season | null> => {
    const { data, error } = await supabase
      .from("seasons")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Season | null) ?? null;
  },
});

export const weeksQuery = (seasonId: string | undefined) =>
  queryOptions({
    queryKey: ["weeks", seasonId],
    enabled: Boolean(seasonId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("weeks")
          .select("id, week_number, bowl_date, third, is_position_round")
          .eq("season_id", seasonId!)
          .order("week_number"),
      ),
  });

export const standingsQuery = (seasonId: string | undefined, scope: StandingsScope) =>
  queryOptions({
    queryKey: ["standings", seasonId, scope],
    enabled: Boolean(seasonId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("team_standings_cache")
          .select("*, teams(id, name, slug)")
          .eq("season_id", seasonId!)
          .eq("scope", scope)
          .order("rank"),
      ),
  });

export const weekMatchesQuery = (weekId: string | undefined) =>
  queryOptions({
    queryKey: ["week-matches", weekId],
    enabled: Boolean(weekId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("matches")
          .select(
            "*, team_a:teams!matches_team_a_id_fkey(id, name, slug), team_b:teams!matches_team_b_id_fkey(id, name, slug)",
          )
          .eq("week_id", weekId!)
          .order("sort_order")
          .order("lane_pair"),
      ),
  });

export const matchDetailQuery = (matchId: string) =>
  queryOptions({
    queryKey: ["match", matchId],
    queryFn: async () => {
      const match = await unwrap(
        supabase
          .from("matches")
          .select(
            "*, weeks(id, week_number, third, is_position_round, season_id), team_a:teams!matches_team_a_id_fkey(id, name, slug), team_b:teams!matches_team_b_id_fkey(id, name, slug)",
          )
          .eq("id", matchId)
          .single(),
      );
      const lineups = await unwrap(
        supabase
          .from("match_lineups")
          .select(
            "*, bowler:bowlers!match_lineups_bowler_id_fkey(id, full_name, slug, is_sub), absent:bowlers!match_lineups_absent_bowler_id_fkey(id, full_name, slug), bowler_games(id, game_number, scratch_score, is_blind, frames(id, frame_number, outcome, frame_score, cumulative_score, is_split, first_ball_pins, balls(ball_number, pins, is_split)))",
          )
          .eq("match_id", matchId)
          .order("slot"),
      );
      return { match, lineups } as { match: any; lineups: any[] };
    },
  });

export const teamsQuery = (seasonId: string | undefined) =>
  queryOptions({
    queryKey: ["teams", seasonId],
    enabled: Boolean(seasonId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("teams")
          .select(
            "*, roster_spots(id, team_id, bowler_id, slot, effective_from_week, effective_to_week, bowlers(id, full_name, slug, entry_average, is_sub))",
          )
          .eq("season_id", seasonId!)
          .order("name"),
      ),
  });

/** Every roster assignment (current and historical) for the season. */
export const rosterSpotsQuery = (seasonId: string | undefined) =>
  queryOptions({
    queryKey: ["roster-spots", seasonId],
    enabled: Boolean(seasonId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("roster_spots")
          .select(
            "id, team_id, bowler_id, slot, effective_from_week, effective_to_week, bowlers(id, full_name, slug, entry_average, is_sub), teams!inner(id, name, slug, season_id)",
          )
          .eq("teams.season_id", seasonId!)
          .order("slot"),
      ),
  });


export const teamStandingRowsQuery = (seasonId: string | undefined) =>
  queryOptions({
    queryKey: ["standing-rows", seasonId],
    enabled: Boolean(seasonId),
    queryFn: async () =>
      unwrap(
        supabase.from("team_standings_cache").select("*").eq("season_id", seasonId!),
      ),
  });

export const teamStatsQuery = (seasonId: string | undefined, scope: StandingsScope) =>
  queryOptions({
    queryKey: ["team-stats", seasonId, scope],
    enabled: Boolean(seasonId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("team_stats_cache")
          .select("*, teams(id, name, slug)")
          .eq("season_id", seasonId!)
          .eq("scope", scope),
      ),
  });

export const bowlersQuery = (seasonId: string | undefined) =>
  queryOptions({
    queryKey: ["bowlers", seasonId],
    enabled: Boolean(seasonId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("bowlers")
          .select("*, roster_spots(team_id, effective_to_week, teams(id, name, slug))")
          .eq("season_id", seasonId!)
          .order("full_name"),
      ),
  });

export const bowlerStatsQuery = (seasonId: string | undefined, scope: StandingsScope) =>
  queryOptions({
    queryKey: ["bowler-stats", seasonId, scope],
    enabled: Boolean(seasonId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("bowler_stats_cache")
          .select("*, bowlers(id, full_name, slug, is_sub, entry_average)")
          .eq("season_id", seasonId!)
          .eq("scope", scope),
      ),
  });

export const announcementsQuery = (seasonId: string | undefined) =>
  queryOptions({
    queryKey: ["announcements", seasonId],
    enabled: Boolean(seasonId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("announcements")
          .select("*")
          .eq("season_id", seasonId!)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false }),
      ),
  });

export const recentResultsQuery = (seasonId: string | undefined) =>
  queryOptions({
    queryKey: ["recent-results", seasonId],
    enabled: Boolean(seasonId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("matches")
          .select(
            "*, weeks!inner(id, week_number, season_id), team_a:teams!matches_team_a_id_fkey(name, slug), team_b:teams!matches_team_b_id_fkey(name, slug)",
          )
          .eq("weeks.season_id", seasonId!)
          .eq("status", "final")
          .order("finalized_at", { ascending: false })
          .limit(8),
      ),
  });

export const bowlerHistoryQuery = (bowlerId: string | undefined) =>
  queryOptions({
    queryKey: ["bowler-history", bowlerId],
    enabled: Boolean(bowlerId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("match_lineups")
          .select(
            "id, participation, applicable_average, teams(name, slug), matches!inner(id, status, weeks(week_number, third)), bowler_games(game_number, scratch_score, frames(frame_number, outcome, frame_score, cumulative_score, is_split, balls(ball_number, pins, is_split)))",
          )
          .eq("bowler_id", bowlerId!)
          .eq("matches.status", "final"),
      ),
  });

export const teamHistoryQuery = (teamId: string | undefined) =>
  queryOptions({
    queryKey: ["team-history", teamId],
    enabled: Boolean(teamId),
    queryFn: async () => {
      const rows = await unwrap(
        supabase
          .from("matches")
          .select(
            "*, weeks(week_number, third), team_a:teams!matches_team_a_id_fkey(id, name, slug), team_b:teams!matches_team_b_id_fkey(id, name, slug)",
          )
          .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
          .eq("status", "final"),
      );
      return rows as any[];
    },
  });

export const seasonMatchSummaryQuery = (seasonId: string | undefined) =>
  queryOptions({
    queryKey: ["season-match-summary", seasonId],
    enabled: Boolean(seasonId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("matches")
          .select(
            "id, status, lane_pair, sort_order, is_bye, handicap_team_id, handicap_pins, team_a_id, team_b_id, team_a_average, team_b_average, points_a, points_b, scratch_total_a, scratch_total_b, hdcp_total_a, hdcp_total_b, game_points, weeks!inner(id, week_number, third, is_position_round, bowl_date, season_id), team_a:teams!matches_team_a_id_fkey(id, name, slug), team_b:teams!matches_team_b_id_fkey(id, name, slug)",
          )
          .eq("weeks.season_id", seasonId!)
          .order("sort_order"),
      ),
  });

/** Lineup + per-game scratch rows for every finalized match in the season.
 *  Used to derive per-game team totals for legacy finalized matches. */
export const seasonLineupGamesQuery = (seasonId: string | undefined) =>
  queryOptions({
    queryKey: ["season-lineup-games", seasonId],
    enabled: Boolean(seasonId),
    queryFn: async () =>
      unwrap(
        supabase
          .from("match_lineups")
          .select(
            "id, match_id, team_id, participation, applicable_average, matches!inner(id, status, weeks!inner(season_id)), bowler_games(game_number, scratch_score)",
          )
          .eq("matches.weeks.season_id", seasonId!)
          .eq("matches.status", "final"),
      ),
  });

