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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      conversations: {
        Row: {
          id: string
          user_a: string
          user_b: string
          created_at: string
        }
        Insert: {
          id?: string
          user_a: string
          user_b: string
          created_at?: string
        }
        Update: {
          id?: string
          user_a?: string
          user_b?: string
          created_at?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          body: string
          created_at: string
          read_at: string | null
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          body: string
          created_at?: string
          read_at?: string | null
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          body?: string
          created_at?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      actual_standings: {
        Row: {
          advances: boolean | null
          group_name: string
          id: string
          locked_in: boolean | null
          position: number
          team: string
          tournament_id: string
          updated_at: string | null
        }
        Insert: {
          advances?: boolean | null
          group_name: string
          id?: string
          locked_in?: boolean | null
          position: number
          team: string
          tournament_id: string
          updated_at?: string | null
        }
        Update: {
          advances?: boolean | null
          group_name?: string
          id?: string
          locked_in?: boolean | null
          position?: number
          team?: string
          tournament_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      bracket_picks: {
        Row: {
          best_third_groups: Json | null
          bracket_picks: Json
          bracket_scores: Json | null
          final_away_score: number | null
          final_home_score: number | null
          final_winner: string | null
          group_picks: Json
          id: string
          penalty_winner: string | null
          pool_id: string
          submitted_at: string | null
          tournament_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          best_third_groups?: Json | null
          bracket_picks?: Json
          bracket_scores?: Json | null
          final_away_score?: number | null
          final_home_score?: number | null
          final_winner?: string | null
          group_picks?: Json
          id?: string
          penalty_winner?: string | null
          pool_id: string
          submitted_at?: string | null
          tournament_id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          best_third_groups?: Json | null
          bracket_picks?: Json
          bracket_scores?: Json | null
          final_away_score?: number | null
          final_home_score?: number | null
          final_winner?: string | null
          group_picks?: Json
          id?: string
          penalty_winner?: string | null
          pool_id?: string
          submitted_at?: string | null
          tournament_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bracket_picks_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      bracket_scoring_rules: {
        Row: {
          champion_bonus: number | null
          final_exact_bonus: number | null
          final_exact_per_team: number | null
          final_points: number
          final_pts: number | null
          group_exact_bonus: number | null
          group_exact_per_team: number | null
          group_format: string | null
          group_pred_style: string | null
          group_standing_runner_up: number | null
          group_standing_third: number | null
          group_standing_winner: number | null
          group_wld: number | null
          knockout_pred_style: string | null
          pool_id: string
          qf_advances: number | null
          qf_exact_bonus: number | null
          qf_points: number
          qf_pts: number | null
          r16_advances: number | null
          r16_exact_bonus: number | null
          r16_points: number
          r16_pts: number | null
          r32_advances: number | null
          r32_exact_bonus: number | null
          r32_points: number
          r32_pts: number | null
          sf_advances: number | null
          sf_exact_bonus: number | null
          sf_points: number
          sf_pts: number | null
          standings_first: number | null
          standings_second: number | null
          standings_third: number | null
          winner_points: number
          wld_pts: number | null
        }
        Insert: {
          champion_bonus?: number | null
          final_exact_bonus?: number | null
          final_exact_per_team?: number | null
          final_points?: number
          final_pts?: number | null
          group_exact_bonus?: number | null
          group_exact_per_team?: number | null
          group_format?: string | null
          group_pred_style?: string | null
          group_standing_runner_up?: number | null
          group_standing_third?: number | null
          group_standing_winner?: number | null
          group_wld?: number | null
          knockout_pred_style?: string | null
          pool_id: string
          qf_advances?: number | null
          qf_exact_bonus?: number | null
          qf_points?: number
          qf_pts?: number | null
          r16_advances?: number | null
          r16_exact_bonus?: number | null
          r16_points?: number
          r16_pts?: number | null
          r32_advances?: number | null
          r32_exact_bonus?: number | null
          r32_points?: number
          r32_pts?: number | null
          sf_advances?: number | null
          sf_exact_bonus?: number | null
          sf_points?: number
          sf_pts?: number | null
          standings_first?: number | null
          standings_second?: number | null
          standings_third?: number | null
          winner_points?: number
          wld_pts?: number | null
        }
        Update: {
          champion_bonus?: number | null
          final_exact_bonus?: number | null
          final_exact_per_team?: number | null
          final_points?: number
          final_pts?: number | null
          group_exact_bonus?: number | null
          group_exact_per_team?: number | null
          group_format?: string | null
          group_pred_style?: string | null
          group_standing_runner_up?: number | null
          group_standing_third?: number | null
          group_standing_winner?: number | null
          group_wld?: number | null
          knockout_pred_style?: string | null
          pool_id?: string
          qf_advances?: number | null
          qf_exact_bonus?: number | null
          qf_points?: number
          qf_pts?: number | null
          r16_advances?: number | null
          r16_exact_bonus?: number | null
          r16_points?: number
          r16_pts?: number | null
          r32_advances?: number | null
          r32_exact_bonus?: number | null
          r32_points?: number
          r32_pts?: number | null
          sf_advances?: number | null
          sf_exact_bonus?: number | null
          sf_points?: number
          sf_pts?: number | null
          standings_first?: number | null
          standings_second?: number | null
          standings_third?: number | null
          winner_points?: number
          wld_pts?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bracket_scoring_rules_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: true
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      f1_sessions: {
        Row: {
          competition_id: number
          competition_name: string
          created_at: string | null
          date: string
          fastest_lap_driver: string | null
          id: number
          results: Json | null
          scored: boolean | null
          season: number
          session_type: string
          status: string
          teammate_battle_team: string | null
          total_laps: number | null
          tournament_id: string
        }
        Insert: {
          competition_id: number
          competition_name: string
          created_at?: string | null
          date: string
          fastest_lap_driver?: string | null
          id: number
          results?: Json | null
          scored?: boolean | null
          season: number
          session_type: string
          status?: string
          teammate_battle_team?: string | null
          total_laps?: number | null
          tournament_id: string
        }
        Update: {
          competition_id?: number
          competition_name?: string
          created_at?: string | null
          date?: string
          fastest_lap_driver?: string | null
          id?: number
          results?: Json | null
          scored?: boolean | null
          season?: number
          session_type?: string
          status?: string
          teammate_battle_team?: string | null
          total_laps?: number | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "f1_sessions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      fixture_venues: {
        Row: {
          api_fixture_id: number
          away_team: string | null
          city: string | null
          home_team: string | null
          venue: string | null
        }
        Insert: {
          api_fixture_id: number
          away_team?: string | null
          city?: string | null
          home_team?: string | null
          venue?: string | null
        }
        Update: {
          api_fixture_id?: number
          away_team?: string | null
          city?: string | null
          home_team?: string | null
          venue?: string | null
        }
        Relationships: []
      }
      fixtures: {
        Row: {
          api_fixture_id: number | null
          api_sports_fight_id: number | null
          away_logo: string | null
          away_score: number | null
          away_team: string
          card_segment: string | null
          city: string
          date: string
          fight_order: number | null
          fighter1_id: number | null
          fighter1_last_name: string | null
          fighter1_nationality: string | null
          fighter1_photo: string | null
          fighter2_id: number | null
          fighter2_last_name: string | null
          fighter2_nationality: string | null
          fighter2_photo: string | null
          first_scorer_id: number | null
          first_scorer_name: string | null
          first_team_score: string | null
          first_yellow_team: string | null
          home_logo: string | null
          home_score: number | null
          home_team: string
          ht_away_card_pts: number | null
          ht_away_corners: number | null
          ht_away_score: number | null
          ht_home_card_pts: number | null
          ht_home_corners: number | null
          ht_home_score: number | null
          id: number
          is_title_fight: boolean | null
          line_asian_handicap_away: number | null
          line_asian_handicap_home: number | null
          line_card_points: number | null
          line_ht_asian_handicap_away: number | null
          line_ht_asian_handicap_home: number | null
          line_ht_total_points: number | null
          line_total_corners: number | null
          line_total_goals: number | null
          line_total_rounds: number | null
          closing_odds_away: number | null
          closing_odds_draw: number | null
          closing_odds_home: number | null
          live_away_cards: number | null
          live_away_corners: number | null
          live_home_cards: number | null
          live_home_corners: number | null
          odds_away: number | null
          odds_draw: number | null
          odds_home: number | null
          odds_updated_at: string | null
          penalty_winner: string | null
          result_method: string | null
          result_round: number | null
          round: string
          scheduled_rounds: number | null
          scored: boolean | null
          status: string
          tournament_id: string
          venue: string
          weight_class: string | null
        }
        Insert: {
          api_fixture_id?: number | null
          api_sports_fight_id?: number | null
          away_logo?: string | null
          away_score?: number | null
          away_team: string
          card_segment?: string | null
          city: string
          date: string
          fight_order?: number | null
          fighter1_id?: number | null
          fighter1_last_name?: string | null
          fighter1_nationality?: string | null
          fighter1_photo?: string | null
          fighter2_id?: number | null
          fighter2_last_name?: string | null
          fighter2_nationality?: string | null
          fighter2_photo?: string | null
          first_scorer_id?: number | null
          first_scorer_name?: string | null
          first_team_score?: string | null
          first_yellow_team?: string | null
          home_logo?: string | null
          home_score?: number | null
          home_team: string
          ht_away_card_pts?: number | null
          ht_away_corners?: number | null
          ht_away_score?: number | null
          ht_home_card_pts?: number | null
          ht_home_corners?: number | null
          ht_home_score?: number | null
          id: number
          is_title_fight?: boolean | null
          line_asian_handicap_away?: number | null
          line_asian_handicap_home?: number | null
          line_card_points?: number | null
          line_ht_asian_handicap_away?: number | null
          line_ht_asian_handicap_home?: number | null
          line_ht_total_points?: number | null
          line_total_corners?: number | null
          line_total_goals?: number | null
          line_total_rounds?: number | null
          closing_odds_away?: number | null
          closing_odds_draw?: number | null
          closing_odds_home?: number | null
          live_away_cards?: number | null
          live_away_corners?: number | null
          live_home_cards?: number | null
          live_home_corners?: number | null
          odds_away?: number | null
          odds_draw?: number | null
          odds_home?: number | null
          odds_updated_at?: string | null
          penalty_winner?: string | null
          result_method?: string | null
          result_round?: number | null
          round: string
          scheduled_rounds?: number | null
          scored?: boolean | null
          status?: string
          tournament_id?: string
          venue: string
          weight_class?: string | null
        }
        Update: {
          api_fixture_id?: number | null
          api_sports_fight_id?: number | null
          away_logo?: string | null
          away_score?: number | null
          away_team?: string
          card_segment?: string | null
          city?: string
          date?: string
          fight_order?: number | null
          fighter1_id?: number | null
          fighter1_last_name?: string | null
          fighter1_nationality?: string | null
          fighter1_photo?: string | null
          fighter2_id?: number | null
          fighter2_last_name?: string | null
          fighter2_nationality?: string | null
          fighter2_photo?: string | null
          first_scorer_id?: number | null
          first_scorer_name?: string | null
          first_team_score?: string | null
          first_yellow_team?: string | null
          home_logo?: string | null
          home_score?: number | null
          home_team?: string
          ht_away_card_pts?: number | null
          ht_away_corners?: number | null
          ht_away_score?: number | null
          ht_home_card_pts?: number | null
          ht_home_corners?: number | null
          ht_home_score?: number | null
          id?: number
          is_title_fight?: boolean | null
          line_asian_handicap_away?: number | null
          line_asian_handicap_home?: number | null
          line_card_points?: number | null
          line_ht_asian_handicap_away?: number | null
          line_ht_asian_handicap_home?: number | null
          line_ht_total_points?: number | null
          line_total_corners?: number | null
          line_total_goals?: number | null
          line_total_rounds?: number | null
          closing_odds_away?: number | null
          closing_odds_draw?: number | null
          closing_odds_home?: number | null
          live_away_cards?: number | null
          live_away_corners?: number | null
          live_home_cards?: number | null
          live_home_corners?: number | null
          odds_away?: number | null
          odds_draw?: number | null
          odds_home?: number | null
          odds_updated_at?: string | null
          penalty_winner?: string | null
          result_method?: string | null
          result_round?: number | null
          round?: string
          scheduled_rounds?: number | null
          scored?: boolean | null
          status?: string
          tournament_id?: string
          venue?: string
          weight_class?: string | null
        }
        Relationships: []
      }
      friends: {
        Row: {
          created_at: string | null
          friend_user_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          friend_user_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          friend_user_id?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      ghost_entries: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_paid: boolean
          name: string
          pool_id: string | null
          source_ghost_entry_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_paid?: boolean
          name: string
          pool_id?: string | null
          source_ghost_entry_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_paid?: boolean
          name?: string
          pool_id?: string | null
          source_ghost_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ghost_entries_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ghost_entries_source_ghost_entry_id_fkey"
            columns: ["source_ghost_entry_id"]
            isOneToOne: false
            referencedRelation: "ghost_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_pick_copy_prefs: {
        Row: {
          user_id: string
          from_pool_id: string
          to_pool_id: string
          enabled: boolean
          created_at: string
        }
        Insert: {
          user_id: string
          from_pool_id: string
          to_pool_id: string
          enabled: boolean
          created_at?: string
        }
        Update: {
          user_id?: string
          from_pool_id?: string
          to_pool_id?: string
          enabled?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_pick_copy_prefs_from_pool_id_fkey"
            columns: ["from_pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_pick_copy_prefs_to_pool_id_fkey"
            columns: ["to_pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notify_checkpoints: {
        Row: {
          key: string
          last_seen_at: string
        }
        Insert: {
          key: string
          last_seen_at?: string
        }
        Update: {
          key?: string
          last_seen_at?: string
        }
        Relationships: []
      }
      matchday_entries: {
        Row: {
          created_at: string | null
          id: string
          matchday: number
          pool_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          matchday: number
          pool_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          matchday?: number
          pool_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchday_entries_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      member_credits: {
        Row: {
          created_at: string | null
          credits_purchased: number | null
          id: string
          pool_id: string | null
          prepaid_all: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credits_purchased?: number | null
          id?: string
          pool_id?: string | null
          prepaid_all?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          credits_purchased?: number | null
          id?: string
          pool_id?: string | null
          prepaid_all?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_credits_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string | null
          display_name: string
          id: string
          pool_id: string
          reactions: Json | null
          reply_to: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          display_name: string
          id?: string
          pool_id: string
          reactions?: Json | null
          reply_to?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          display_name?: string
          id?: string
          pool_id?: string
          reactions?: Json | null
          reply_to?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_players: {
        Row: {
          id: number
          name: string
          position: string | null
          season: number
          team_id: number | null
          updated_at: string | null
        }
        Insert: {
          id: number
          name: string
          position?: string | null
          season: number
          team_id?: number | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          name?: string
          position?: string | null
          season?: number
          team_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pl_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "pl_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      pl_teams: {
        Row: {
          drawn: number | null
          goal_difference: number | null
          goals_against: number | null
          goals_for: number | null
          id: number
          logo: string | null
          lost: number | null
          name: string
          played: number | null
          points: number | null
          position: number | null
          season: number
          short_name: string | null
          updated_at: string | null
          won: number | null
        }
        Insert: {
          drawn?: number | null
          goal_difference?: number | null
          goals_against?: number | null
          goals_for?: number | null
          id: number
          logo?: string | null
          lost?: number | null
          name: string
          played?: number | null
          points?: number | null
          position?: number | null
          season: number
          short_name?: string | null
          updated_at?: string | null
          won?: number | null
        }
        Update: {
          drawn?: number | null
          goal_difference?: number | null
          goals_against?: number | null
          goals_for?: number | null
          id?: number
          logo?: string | null
          lost?: number | null
          name?: string
          played?: number | null
          points?: number | null
          position?: number | null
          season?: number
          short_name?: string | null
          updated_at?: string | null
          won?: number | null
        }
        Relationships: []
      }
      players: {
        Row: {
          created_at: string | null
          id: number
          name: string
          position: string | null
          shirt_number: number | null
          team_id: number
          team_name: string
          tournament_id: string | null
        }
        Insert: {
          created_at?: string | null
          id: number
          name: string
          position?: string | null
          shirt_number?: number | null
          team_id: number
          team_name: string
          tournament_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          name?: string
          position?: string | null
          shirt_number?: number | null
          team_id?: number
          team_name?: string
          tournament_id?: string | null
        }
        Relationships: []
      }
      pool_changes: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          changes: Json
          id: string
          pool_id: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          changes: Json
          id?: string
          pool_id?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          changes?: Json
          id?: string
          pool_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pool_changes_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_invitation_inviters: {
        Row: {
          created_at: string | null
          id: string
          invitation_id: string
          inviter_user_id: string
          pool_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invitation_id: string
          inviter_user_id: string
          pool_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invitation_id?: string
          inviter_user_id?: string
          pool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_invitation_inviters_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "pool_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_invitation_inviters_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_invitations: {
        Row: {
          created_at: string | null
          id: string
          invited_user_id: string
          pool_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_user_id: string
          pool_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_user_id?: string
          pool_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_invitations_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_invites: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          pool_id: string
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          pool_id: string
          token: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          pool_id?: string
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pool_invites_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_matchweek_selections: {
        Row: {
          created_at: string | null
          fixture_id: number
          id: string
          pool_id: string
          round: string
          source: string
        }
        Insert: {
          created_at?: string | null
          fixture_id: number
          id?: string
          pool_id: string
          round: string
          source?: string
        }
        Update: {
          created_at?: string | null
          fixture_id?: number
          id?: string
          pool_id?: string
          round?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_matchweek_selections_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_members: {
        Row: {
          can_manage_ghosts: boolean
          display_name: string
          id: string
          is_paid: boolean | null
          joined_at: string | null
          last_seen_changes_at: string | null
          pool_id: string
          user_id: string
        }
        Insert: {
          can_manage_ghosts?: boolean
          display_name: string
          id?: string
          is_paid?: boolean | null
          joined_at?: string | null
          last_seen_changes_at?: string | null
          pool_id: string
          user_id: string
        }
        Update: {
          can_manage_ghosts?: boolean
          display_name?: string
          id?: string
          is_paid?: boolean | null
          joined_at?: string | null
          last_seen_changes_at?: string | null
          pool_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_members_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_rules: {
        Row: {
          bonus_points: number | null
          category_id: string
          created_at: string | null
          id: string
          line: number | null
          points: number
          pool_id: string
        }
        Insert: {
          bonus_points?: number | null
          category_id: string
          created_at?: string | null
          id?: string
          line?: number | null
          points: number
          pool_id: string
        }
        Update: {
          bonus_points?: number | null
          category_id?: string
          created_at?: string | null
          id?: string
          line?: number | null
          points?: number
          pool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ruleset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_rules_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      pools: {
        Row: {
          admin_fee_percent: number | null
          admin_id: string
          allow_member_invites: boolean
          archived: boolean | null
          bank_account_number: string | null
          bank_sort_code: string | null
          buy_in_amount: number | null
          created_at: string | null
          deadline_type: string
          id: string
          invite_code: string
          is_active: boolean | null
          is_public: boolean
          name: string
          package_id: string
          payout_structure: string | null
          pick_mode: string | null
          cfb_best10_admin_override: boolean
          cfb_game_mode: string | null
          pl_best_weeks: number | null
          pl_best5_admin_override: boolean
          pl_game_mode: string | null
          prize_season: boolean | null
          prize_weekly: boolean | null
          season_buy_in: number | null
          season_props_enabled: boolean | null
          sport: string
          tournament_id: string
          tournament_scope: string
          updated_at: string | null
          venmo_handle: string | null
          weekly_buy_in: number | null
          weekly_payout_structure: string | null
          zelle_handle: string | null
        }
        Insert: {
          admin_fee_percent?: number | null
          admin_id: string
          allow_member_invites?: boolean
          archived?: boolean | null
          bank_account_number?: string | null
          bank_sort_code?: string | null
          buy_in_amount?: number | null
          created_at?: string | null
          deadline_type?: string
          id?: string
          invite_code: string
          is_active?: boolean | null
          is_public?: boolean
          name: string
          package_id: string
          payout_structure?: string | null
          pick_mode?: string | null
          cfb_best10_admin_override?: boolean
          cfb_game_mode?: string | null
          pl_best_weeks?: number | null
          pl_best5_admin_override?: boolean
          pl_game_mode?: string | null
          prize_season?: boolean | null
          prize_weekly?: boolean | null
          season_buy_in?: number | null
          season_props_enabled?: boolean | null
          sport?: string
          tournament_id?: string
          tournament_scope?: string
          updated_at?: string | null
          venmo_handle?: string | null
          weekly_buy_in?: number | null
          weekly_payout_structure?: string | null
          zelle_handle?: string | null
        }
        Update: {
          admin_fee_percent?: number | null
          admin_id?: string
          allow_member_invites?: boolean
          archived?: boolean | null
          bank_account_number?: string | null
          bank_sort_code?: string | null
          buy_in_amount?: number | null
          created_at?: string | null
          deadline_type?: string
          id?: string
          invite_code?: string
          is_active?: boolean | null
          is_public?: boolean
          name?: string
          package_id?: string
          payout_structure?: string | null
          pick_mode?: string | null
          cfb_best10_admin_override?: boolean
          cfb_game_mode?: string | null
          pl_best_weeks?: number | null
          pl_best5_admin_override?: boolean
          pl_game_mode?: string | null
          prize_season?: boolean | null
          prize_weekly?: boolean | null
          season_buy_in?: number | null
          season_props_enabled?: boolean | null
          sport?: string
          tournament_id?: string
          tournament_scope?: string
          updated_at?: string | null
          venmo_handle?: string | null
          weekly_buy_in?: number | null
          weekly_payout_structure?: string | null
          zelle_handle?: string | null
        }
        Relationships: []
      }
      predictions: {
        Row: {
          fixture_id: number
          id: string
          points_earned: number | null
          pool_id: string
          predicted_away_score: number | null
          predicted_first_scorer_name: string | null
          predicted_home_score: number | null
          predicted_result: string | null
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          fixture_id: number
          id?: string
          points_earned?: number | null
          pool_id: string
          predicted_away_score?: number | null
          predicted_first_scorer_name?: string | null
          predicted_home_score?: number | null
          predicted_result?: string | null
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          fixture_id?: number
          id?: string
          points_earned?: number | null
          pool_id?: string
          predicted_away_score?: number | null
          predicted_first_scorer_name?: string | null
          predicted_home_score?: number | null
          predicted_result?: string | null
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions_v2: {
        Row: {
          category_id: string
          fixture_id: number | null
          id: string
          is_correct: boolean | null
          matchday: string | null
          points_earned: number | null
          pool_id: string
          submitted_at: string | null
          user_id: string
          value_number: number | null
          value_ou: string | null
          value_text: string | null
          value_wld: string | null
          value_yesno: boolean | null
        }
        Insert: {
          category_id: string
          fixture_id?: number | null
          id?: string
          is_correct?: boolean | null
          matchday?: string | null
          points_earned?: number | null
          pool_id: string
          submitted_at?: string | null
          user_id: string
          value_number?: number | null
          value_ou?: string | null
          value_text?: string | null
          value_wld?: string | null
          value_yesno?: boolean | null
        }
        Update: {
          category_id?: string
          fixture_id?: number | null
          id?: string
          is_correct?: boolean | null
          matchday?: string | null
          points_earned?: number | null
          pool_id?: string
          submitted_at?: string | null
          user_id?: string
          value_number?: number | null
          value_ou?: string | null
          value_text?: string | null
          value_wld?: string | null
          value_yesno?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "predictions_v2_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ruleset_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_v2_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string
          id: string
          notify_new_competitions: boolean
          notify_pool_invites: boolean
          odds_format: string
          odds_always_visible: boolean
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name: string
          id: string
          notify_new_competitions?: boolean
          notify_pool_invites?: boolean
          odds_format?: string
          odds_always_visible?: boolean
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string
          id?: string
          notify_new_competitions?: boolean
          notify_pool_invites?: boolean
          odds_format?: string
          odds_always_visible?: boolean
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string | null
          email: string
          hours_before: number
          id: string
          phone: string | null
          pool_id: string
          sent_fixture_ids: number[] | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          hours_before?: number
          id?: string
          phone?: string | null
          pool_id: string
          sent_fixture_ids?: number[] | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          hours_before?: number
          id?: string
          phone?: string | null
          pool_id?: string
          sent_fixture_ids?: number[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      round_facts: {
        Row: {
          brace_players: string[] | null
          clean_sheet_teams: string[] | null
          id: string
          penalty_teams: string[] | null
          red_card_teams: string[] | null
          round_id: string
          tournament_id: string
          updated_at: string | null
        }
        Insert: {
          brace_players?: string[] | null
          clean_sheet_teams?: string[] | null
          id?: string
          penalty_teams?: string[] | null
          red_card_teams?: string[] | null
          round_id: string
          tournament_id: string
          updated_at?: string | null
        }
        Update: {
          brace_players?: string[] | null
          clean_sheet_teams?: string[] | null
          id?: string
          penalty_teams?: string[] | null
          red_card_teams?: string[] | null
          round_id?: string
          tournament_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ruleset_categories: {
        Row: {
          default_points: number
          description: string
          id: string
          input_type: string
          name: string
          prediction_type: string
          requires_line: boolean | null
          sort_order: number | null
          sport: string
        }
        Insert: {
          default_points?: number
          description: string
          id: string
          input_type: string
          name: string
          prediction_type: string
          requires_line?: boolean | null
          sort_order?: number | null
          sport: string
        }
        Update: {
          default_points?: number
          description?: string
          id?: string
          input_type?: string
          name?: string
          prediction_type?: string
          requires_line?: boolean | null
          sort_order?: number | null
          sport?: string
        }
        Relationships: []
      }
      season_prop_rules: {
        Row: {
          category: string
          created_at: string | null
          id: string
          points: number
          pool_id: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          points?: number
          pool_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          points?: number
          pool_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "season_prop_rules_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      season_props: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_correct: boolean | null
          points_earned: number | null
          pool_id: string | null
          user_id: string
          value_text: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          points_earned?: number | null
          pool_id?: string | null
          user_id: string
          value_text?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_correct?: boolean | null
          points_earned?: number | null
          pool_id?: string | null
          user_id?: string
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "season_props_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          allows_draw: boolean
          api_league_id: number | null
          created_at: string | null
          end_date: string | null
          event_date: string | null
          id: string
          logo_url: string | null
          name: string
          notified_at: string | null
          season: number
          sport: string
          status: string
        }
        Insert: {
          allows_draw?: boolean
          api_league_id?: number | null
          created_at?: string | null
          end_date?: string | null
          event_date?: string | null
          id: string
          logo_url?: string | null
          name: string
          notified_at?: string | null
          season: number
          sport: string
          status?: string
        }
        Update: {
          allows_draw?: boolean
          api_league_id?: number | null
          created_at?: string | null
          end_date?: string | null
          event_date?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          notified_at?: string | null
          season?: number
          sport?: string
          status?: string
        }
        Relationships: []
      }
      user_sport_interests: {
        Row: {
          created_at: string
          source: string
          sport: string
          user_id: string
        }
        Insert: {
          created_at?: string
          source?: string
          sport: string
          user_id: string
        }
        Update: {
          created_at?: string
          source?: string
          sport?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sport_interests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_payouts: {
        Row: {
          amount: number | null
          created_at: string | null
          id: string
          matchday: number
          notified: boolean | null
          paid_out: boolean | null
          payout_rank: number
          pool_id: string | null
          winner_user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: string
          matchday: number
          notified?: boolean | null
          paid_out?: boolean | null
          payout_rank?: number
          pool_id?: string | null
          winner_user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: string
          matchday?: number
          notified?: boolean | null
          paid_out?: boolean | null
          payout_rank?: number
          pool_id?: string | null
          winner_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_payouts_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_pending_pool_invitation: {
        Args: { p_pool_id: string; p_user_id: string }
        Returns: boolean
      }
      is_pool_member: {
        Args: { p_pool_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
