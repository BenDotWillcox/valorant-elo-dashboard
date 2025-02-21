CREATE TABLE "elo_ratings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"team_id" bigserial NOT NULL,
	"map_name" varchar NOT NULL,
	"rating" numeric NOT NULL,
	"rating_date" timestamp NOT NULL,
	"map_played_id" bigserial NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "elo_ratings_current" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"team_id" bigserial NOT NULL,
	"map_name" varchar NOT NULL,
	"rating" numeric NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "elo_ratings" ADD CONSTRAINT "elo_ratings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_ratings" ADD CONSTRAINT "elo_ratings_map_played_id_maps_id_fk" FOREIGN KEY ("map_played_id") REFERENCES "public"."maps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elo_ratings_current" ADD CONSTRAINT "elo_ratings_current_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;