export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_pinned: boolean
          message: string
          season_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          message: string
          season_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          message?: string
          season_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      balls: {
        Row: {
          ball_number: number
          created_at: string
          frame_id: string
          id: string
          is_split: boolean
          pins: number
        }
        Insert: {
          ball_number: number
          created_at?: string
          frame_id: string
          id?: string
          is_split?: boolean
          pins: number
        }
        Update: {
          ball_number?: number
          created_at?: string
          frame_id?: string
          id?: string
          is_split?: boolean
          pins?: number
        }
        Relationships: [
          {
            foreignKeyName: "balls_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
        ]
      }
      bowler_games: {
        Row: {
          created_at: string
          game_number: number
          id: string
          is_blind: boolean
          is_complete: boolean
          lineup_id: string
          scratch_score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          game_number: number
          id?: string
          is_blind?: boolean
          is_complete?: boolean
          lineup_id: string
          scratch_score?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          game_number?: number
          id?: string
          is_blind?: boolean
          is_complete?: boolean
          lineup_id?: string
          scratch_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bowler_games_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "match_lineups"
            referencedColumns: ["id"]
          },
        ]
      }
      bowler_stats_cache: {
        Row: {
          average: number
          bowler_id: string
          clean_frames: number
          clean_games: number
          first_ball_count: number
          first_ball_dist: Json
          first_ball_eight_plus: number
          first_ball_nine_plus: number
          first_ball_pins: number
          frames: number
          games: number
          high_game: number
          high_set: number
          id: string
          longest_mark_streak: number
          longest_strike_streak: number
          low_game: number
          low_set: number
          opens: number
          pinfall: number
          scope: string
          season_id: string
          sets: number
          spare_attempts: number
          spares: number
          split_conversions: number
          split_opens: number
          split_ten_boxes: number
          splits: number
          strikes: number
          ten_boxes: number
          updated_at: string
        }
        Insert: {
          average?: number
          bowler_id: string
          clean_frames?: number
          clean_games?: number
          first_ball_count?: number
          first_ball_dist?: Json
          first_ball_eight_plus?: number
          first_ball_nine_plus?: number
          first_ball_pins?: number
          frames?: number
          games?: number
          high_game?: number
          high_set?: number
          id?: string
          longest_mark_streak?: number
          longest_strike_streak?: number
          low_game?: number
          low_set?: number
          opens?: number
          pinfall?: number
          scope: string
          season_id: string
          sets?: number
          spare_attempts?: number
          spares?: number
          split_conversions?: number
          split_opens?: number
          split_ten_boxes?: number
          splits?: number
          strikes?: number
          ten_boxes?: number
          updated_at?: string
        }
        Update: {
          average?: number
          bowler_id?: string
          clean_frames?: number
          clean_games?: number
          first_ball_count?: number
          first_ball_dist?: Json
          first_ball_eight_plus?: number
          first_ball_nine_plus?: number
          first_ball_pins?: number
          frames?: number
          games?: number
          high_game?: number
          high_set?: number
          id?: string
          longest_mark_streak?: number
          longest_strike_streak?: number
          low_game?: number
          low_set?: number
          opens?: number
          pinfall?: number
          scope?: string
          season_id?: string
          sets?: number
          spare_attempts?: number
          spares?: number
          split_conversions?: number
          split_opens?: number
          split_ten_boxes?: number
          splits?: number
          strikes?: number
          ten_boxes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bowler_stats_cache_bowler_id_fkey"
            columns: ["bowler_id"]
            isOneToOne: false
            referencedRelation: "bowlers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bowler_stats_cache_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      bowlers: {
        Row: {
          created_at: string
          entry_average: number
          full_name: string
          id: string
          is_active: boolean
          is_sub: boolean
          notes: string | null
          season_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entry_average?: number
          full_name: string
          id?: string
          is_active?: boolean
          is_sub?: boolean
          notes?: string | null
          season_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entry_average?: number
          full_name?: string
          id?: string
          is_active?: boolean
          is_sub?: boolean
          notes?: string | null
          season_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bowlers_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      frames: {
        Row: {
          created_at: string
          cumulative_score: number
          first_ball_pins: number | null
          frame_number: number
          frame_score: number
          game_id: string
          id: string
          is_split: boolean
          outcome: Database["public"]["Enums"]["frame_outcome"]
          split_converted: boolean
        }
        Insert: {
          created_at?: string
          cumulative_score?: number
          first_ball_pins?: number | null
          frame_number: number
          frame_score?: number
          game_id: string
          id?: string
          is_split?: boolean
          outcome?: Database["public"]["Enums"]["frame_outcome"]
          split_converted?: boolean
        }
        Update: {
          created_at?: string
          cumulative_score?: number
          first_ball_pins?: number | null
          frame_number?: number
          frame_score?: number
          game_id?: string
          id?: string
          is_split?: boolean
          outcome?: Database["public"]["Enums"]["frame_outcome"]
          split_converted?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "frames_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "bowler_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "frames_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "v_game_context"
            referencedColumns: ["game_id"]
          },
        ]
      }
      match_lineups: {
        Row: {
          absent_bowler_id: string | null
          applicable_average: number
          applicable_average_truncated: number
          average_source: Database["public"]["Enums"]["average_source"]
          bowler_id: string | null
          created_at: string
          games_before: number
          id: string
          match_id: string
          participation: Database["public"]["Enums"]["participation_type"]
          slot: number
          team_id: string
          updated_at: string
        }
        Insert: {
          absent_bowler_id?: string | null
          applicable_average?: number
          applicable_average_truncated?: number
          average_source?: Database["public"]["Enums"]["average_source"]
          bowler_id?: string | null
          created_at?: string
          games_before?: number
          id?: string
          match_id: string
          participation?: Database["public"]["Enums"]["participation_type"]
          slot: number
          team_id: string
          updated_at?: string
        }
        Update: {
          absent_bowler_id?: string | null
          applicable_average?: number
          applicable_average_truncated?: number
          average_source?: Database["public"]["Enums"]["average_source"]
          bowler_id?: string | null
          created_at?: string
          games_before?: number
          id?: string
          match_id?: string
          participation?: Database["public"]["Enums"]["participation_type"]
          slot?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_lineups_absent_bowler_id_fkey"
            columns: ["absent_bowler_id"]
            isOneToOne: false
            referencedRelation: "bowlers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_lineups_bowler_id_fkey"
            columns: ["bowler_id"]
            isOneToOne: false
            referencedRelation: "bowlers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_lineups_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          finalized_at: string | null
          game_points: Json
          handicap_pins: number
          handicap_team_id: string | null
          hdcp_total_a: number
          hdcp_total_b: number
          id: string
          is_bye: boolean
          lane_pair: string | null
          points_a: number
          points_b: number
          scratch_total_a: number
          scratch_total_b: number
          sort_order: number
          status: Database["public"]["Enums"]["match_status"]
          team_a_average: number | null
          team_a_id: string
          team_b_average: number | null
          team_b_id: string | null
          updated_at: string
          week_id: string
        }
        Insert: {
          created_at?: string
          finalized_at?: string | null
          game_points?: Json
          handicap_pins?: number
          handicap_team_id?: string | null
          hdcp_total_a?: number
          hdcp_total_b?: number
          id?: string
          is_bye?: boolean
          lane_pair?: string | null
          points_a?: number
          points_b?: number
          scratch_total_a?: number
          scratch_total_b?: number
          sort_order?: number
          status?: Database["public"]["Enums"]["match_status"]
          team_a_average?: number | null
          team_a_id: string
          team_b_average?: number | null
          team_b_id?: string | null
          updated_at?: string
          week_id: string
        }
        Update: {
          created_at?: string
          finalized_at?: string | null
          game_points?: Json
          handicap_pins?: number
          handicap_team_id?: string | null
          hdcp_total_a?: number
          hdcp_total_b?: number
          id?: string
          is_bye?: boolean
          lane_pair?: string | null
          points_a?: number
          points_b?: number
          scratch_total_a?: number
          scratch_total_b?: number
          sort_order?: number
          status?: Database["public"]["Enums"]["match_status"]
          team_a_average?: number | null
          team_a_id?: string
          team_b_average?: number | null
          team_b_id?: string | null
          updated_at?: string
          week_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_handicap_team_id_fkey"
            columns: ["handicap_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_spots: {
        Row: {
          bowler_id: string
          created_at: string
          effective_from_week: number
          effective_to_week: number | null
          id: string
          slot: number
          team_id: string
          updated_at: string
        }
        Insert: {
          bowler_id: string
          created_at?: string
          effective_from_week?: number
          effective_to_week?: number | null
          id?: string
          slot: number
          team_id: string
          updated_at?: string
        }
        Update: {
          bowler_id?: string
          created_at?: string
          effective_from_week?: number
          effective_to_week?: number | null
          id?: string
          slot?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_spots_bowler_id_fkey"
            columns: ["bowler_id"]
            isOneToOne: false
            referencedRelation: "bowlers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_spots_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          blind_deduction: number
          center_name: string
          created_at: string
          display_name: string
          establishment_threshold: number
          handicap_percent: number
          id: string
          is_active: boolean
          league_name: string
          logo_url: string | null
          position_round_weeks: number[]
          season_name: string
          sponsor: string | null
          team_count: number
          third_boundaries: number[]
          total_weeks: number
          updated_at: string
        }
        Insert: {
          blind_deduction?: number
          center_name?: string
          created_at?: string
          display_name?: string
          establishment_threshold?: number
          handicap_percent?: number
          id?: string
          is_active?: boolean
          league_name?: string
          logo_url?: string | null
          position_round_weeks?: number[]
          season_name: string
          sponsor?: string | null
          team_count?: number
          third_boundaries?: number[]
          total_weeks?: number
          updated_at?: string
        }
        Update: {
          blind_deduction?: number
          center_name?: string
          created_at?: string
          display_name?: string
          establishment_threshold?: number
          handicap_percent?: number
          id?: string
          is_active?: boolean
          league_name?: string
          logo_url?: string | null
          position_round_weeks?: number[]
          season_name?: string
          sponsor?: string | null
          team_count?: number
          third_boundaries?: number[]
          total_weeks?: number
          updated_at?: string
        }
        Relationships: []
      }
      team_standings_cache: {
        Row: {
          hdcp_pinfall: number
          id: string
          matches_played: number
          points: number
          previous_rank: number | null
          rank: number
          scope: string
          scratch_pinfall: number
          season_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          hdcp_pinfall?: number
          id?: string
          matches_played?: number
          points?: number
          previous_rank?: number | null
          rank?: number
          scope: string
          scratch_pinfall?: number
          season_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          hdcp_pinfall?: number
          id?: string
          matches_played?: number
          points?: number
          previous_rank?: number | null
          rank?: number
          scope?: string
          scratch_pinfall?: number
          season_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_standings_cache_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_standings_cache_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_stats_cache: {
        Row: {
          first_ball_count: number
          first_ball_eight_plus: number
          first_ball_nine_plus: number
          first_ball_pins: number
          frames: number
          game_points: number
          hdcp_avg: number
          hdcp_pinfall: number
          high_hdcp_game: number
          high_hdcp_set: number
          high_scratch_game: number
          high_scratch_set: number
          id: string
          matches: number
          opens: number
          points: number
          points_possible: number
          scope: string
          scratch_avg: number
          scratch_pinfall: number
          season_id: string
          set_points: number
          spare_attempts: number
          spares: number
          split_conversions: number
          splits: number
          strikes: number
          team_id: string
          ten_boxes: number
          updated_at: string
        }
        Insert: {
          first_ball_count?: number
          first_ball_eight_plus?: number
          first_ball_nine_plus?: number
          first_ball_pins?: number
          frames?: number
          game_points?: number
          hdcp_avg?: number
          hdcp_pinfall?: number
          high_hdcp_game?: number
          high_hdcp_set?: number
          high_scratch_game?: number
          high_scratch_set?: number
          id?: string
          matches?: number
          opens?: number
          points?: number
          points_possible?: number
          scope: string
          scratch_avg?: number
          scratch_pinfall?: number
          season_id: string
          set_points?: number
          spare_attempts?: number
          spares?: number
          split_conversions?: number
          splits?: number
          strikes?: number
          team_id: string
          ten_boxes?: number
          updated_at?: string
        }
        Update: {
          first_ball_count?: number
          first_ball_eight_plus?: number
          first_ball_nine_plus?: number
          first_ball_pins?: number
          frames?: number
          game_points?: number
          hdcp_avg?: number
          hdcp_pinfall?: number
          high_hdcp_game?: number
          high_hdcp_set?: number
          high_scratch_game?: number
          high_scratch_set?: number
          id?: string
          matches?: number
          opens?: number
          points?: number
          points_possible?: number
          scope?: string
          scratch_avg?: number
          scratch_pinfall?: number
          season_id?: string
          set_points?: number
          spare_attempts?: number
          spares?: number
          split_conversions?: number
          splits?: number
          strikes?: number
          team_id?: string
          ten_boxes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_stats_cache_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_stats_cache_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          season_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          season_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          season_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weeks: {
        Row: {
          bowl_date: string | null
          created_at: string
          id: string
          is_position_round: boolean
          season_id: string
          third: number
          updated_at: string
          week_number: number
        }
        Insert: {
          bowl_date?: string | null
          created_at?: string
          id?: string
          is_position_round?: boolean
          season_id: string
          third?: number
          updated_at?: string
          week_number: number
        }
        Update: {
          bowl_date?: string | null
          created_at?: string
          id?: string
          is_position_round?: boolean
          season_id?: string
          third?: number
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_game_context: {
        Row: {
          bowler_id: string | null
          game_id: string | null
          game_number: number | null
          is_blind: boolean | null
          lineup_id: string | null
          match_id: string | null
          match_status: Database["public"]["Enums"]["match_status"] | null
          participation:
            | Database["public"]["Enums"]["participation_type"]
            | null
          scratch_score: number | null
          season_id: string | null
          team_id: string | null
          third: number | null
          week_id: string | null
          week_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bowler_games_lineup_id_fkey"
            columns: ["lineup_id"]
            isOneToOne: false
            referencedRelation: "match_lineups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_lineups_bowler_id_fkey"
            columns: ["bowler_id"]
            isOneToOne: false
            referencedRelation: "bowlers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_lineups_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_lineups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "weeks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_exists: { Args: never; Returns: boolean }
      bootstrap_first_admin: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      refresh_season_aggregates: {
        Args: { p_season_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      average_source: "entry" | "current"
      frame_outcome: "strike" | "spare" | "ten_box" | "open" | "incomplete"
      match_status: "scheduled" | "in_progress" | "final"
      participation_type: "rostered" | "sub" | "blind"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      average_source: ["entry", "current"],
      frame_outcome: ["strike", "spare", "ten_box", "open", "incomplete"],
      match_status: ["scheduled", "in_progress", "final"],
      participation_type: ["rostered", "sub", "blind"],
    },
  },
} as const
