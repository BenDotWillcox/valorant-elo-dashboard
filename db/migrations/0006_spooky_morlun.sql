CREATE TABLE "seasons" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"is_active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "seasons_year_unique" UNIQUE("year")
);
--> statement-breakpoint
ALTER TABLE "elo_ratings_current" ADD COLUMN "season_id" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "elo_ratings_current" ADD CONSTRAINT "elo_ratings_current_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;