-- Create seasons table first
CREATE TABLE IF NOT EXISTS seasons (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Then create elo tables that reference it
CREATE TABLE IF NOT EXISTS elo_ratings (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id),
  global_rating NUMERIC NOT NULL,
  map_name VARCHAR NOT NULL,
  map_offset NUMERIC NOT NULL,
  effective_rating NUMERIC NOT NULL,
  rating_date TIMESTAMP NOT NULL,
  map_played_id BIGINT REFERENCES maps(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elo_ratings_current (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id),
  season_id BIGINT NOT NULL REFERENCES seasons(id),
  global_rating NUMERIC NOT NULL,
  map_name VARCHAR NOT NULL,
  map_offset NUMERIC NOT NULL,
  effective_rating NUMERIC NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
); 