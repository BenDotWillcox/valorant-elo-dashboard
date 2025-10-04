-- Add performance indexes for frequently queried columns
-- This migration significantly improves query performance by adding indexes on foreign keys and date columns

-- Maps table indexes
CREATE INDEX IF NOT EXISTS idx_maps_winner_team_id ON maps(winner_team_id);
CREATE INDEX IF NOT EXISTS idx_maps_loser_team_id ON maps(loser_team_id);
CREATE INDEX IF NOT EXISTS idx_maps_completed_at ON maps(completed_at);
CREATE INDEX IF NOT EXISTS idx_maps_winner_team_completed ON maps(winner_team_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_maps_loser_team_completed ON maps(loser_team_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_maps_match_id ON maps(match_id);

-- Player map stats indexes
CREATE INDEX IF NOT EXISTS idx_player_map_stats_player_id ON player_map_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_map_stats_map_id ON player_map_stats(map_id);
CREATE INDEX IF NOT EXISTS idx_player_map_stats_team_id ON player_map_stats(team_id);

-- Matches table indexes
CREATE INDEX IF NOT EXISTS idx_matches_team1_id ON matches(team1_id);
CREATE INDEX IF NOT EXISTS idx_matches_team2_id ON matches(team2_id);
CREATE INDEX IF NOT EXISTS idx_matches_event_name ON matches(event_name);

-- ELO ratings current table index
CREATE INDEX IF NOT EXISTS idx_elo_ratings_current_team_id ON elo_ratings_current(team_id);

