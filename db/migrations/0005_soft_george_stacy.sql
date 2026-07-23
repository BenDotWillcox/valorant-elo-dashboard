ALTER TABLE "elo_ratings" RENAME COLUMN "rating" TO "effective_rating";--> statement-breakpoint
ALTER TABLE "elo_ratings_current" RENAME COLUMN "rating" TO "effective_rating";--> statement-breakpoint
DROP INDEX "team_map_unique_idx";--> statement-breakpoint
ALTER TABLE "elo_ratings" ADD COLUMN "global_rating" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "elo_ratings" ADD COLUMN "map_offset" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "elo_ratings_current" ADD COLUMN "global_rating" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "elo_ratings_current" ADD COLUMN "map_offset" numeric NOT NULL;