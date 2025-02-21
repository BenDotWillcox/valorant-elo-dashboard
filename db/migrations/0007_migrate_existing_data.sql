-- Migrate any existing ratings to have global_rating = rating and map_offset = 0
UPDATE elo_ratings 
SET 
  global_rating = rating,
  map_offset = 0,
  effective_rating = rating
WHERE global_rating IS NULL;

-- Set processed = false for any NULL processed flags
UPDATE maps 
SET processed = false 
WHERE processed IS NULL; 