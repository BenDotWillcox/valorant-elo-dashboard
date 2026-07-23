-- First make columns nullable
ALTER TABLE elo_ratings 
  ALTER COLUMN global_rating DROP NOT NULL,
  ALTER COLUMN map_offset DROP NOT NULL,
  ALTER COLUMN effective_rating DROP NOT NULL;

-- Then update existing rows with default values
UPDATE elo_ratings 
SET 
  global_rating = rating,
  map_offset = 0,
  effective_rating = rating;

-- Finally make columns NOT NULL again
ALTER TABLE elo_ratings 
  ALTER COLUMN global_rating SET NOT NULL,
  ALTER COLUMN map_offset SET NOT NULL,
  ALTER COLUMN effective_rating SET NOT NULL; 