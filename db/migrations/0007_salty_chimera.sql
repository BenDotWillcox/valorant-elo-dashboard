CREATE TABLE "matches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"vlr_match_id" integer NOT NULL,
	"event_name" varchar NOT NULL,
	"region" varchar,
	"stage" varchar,
	"best_of" integer,
	"completed_at" timestamp,
	"team1_id" bigserial NOT NULL,
	"team2_id" bigserial NOT NULL,
	"team1_score" integer,
	"team2_score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "matches_vlr_match_id_unique" UNIQUE("vlr_match_id")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"vlr_player_id" integer,
	"slug" varchar NOT NULL,
	"ign" varchar NOT NULL,
	"name" varchar,
	"team_id" bigserial NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "players_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "player_map_stats" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"match_id" bigserial NOT NULL,
	"map_id" bigserial NOT NULL,
	"game_number" integer NOT NULL,
	"team_id" bigserial NOT NULL,
	"player_id" bigserial NOT NULL,
	"agent" varchar NOT NULL,
	"kills" integer NOT NULL,
	"deaths" integer NOT NULL,
	"assists" integer NOT NULL,
	"first_kills" integer NOT NULL,
	"first_deaths" integer NOT NULL,
	"acs" integer,
	"adr" integer,
	"kast" numeric(5, 2),
	"rounds_played" integer
);
--> statement-breakpoint
CREATE TABLE "match_vetoes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"match_id" bigserial NOT NULL,
	"order_index" integer NOT NULL,
	"action" varchar NOT NULL,
	"map_name" varchar NOT NULL,
	"team_id" bigserial NOT NULL,
	"resulted_game_number" integer
);
--> statement-breakpoint
ALTER TABLE "elo_ratings_current" ADD COLUMN "rating" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "elo_ratings" ADD COLUMN "rating" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team1_id_teams_id_fk" FOREIGN KEY ("team1_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_team2_id_teams_id_fk" FOREIGN KEY ("team2_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_map_stats" ADD CONSTRAINT "player_map_stats_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_map_stats" ADD CONSTRAINT "player_map_stats_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_map_stats" ADD CONSTRAINT "player_map_stats_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_map_stats" ADD CONSTRAINT "player_map_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_vetoes" ADD CONSTRAINT "match_vetoes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_vetoes" ADD CONSTRAINT "match_vetoes_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_map_season_unique_idx" ON "elo_ratings_current" USING btree ("team_id","map_name","season_id");--> statement-breakpoint
ALTER TABLE "elo_ratings_current" DROP COLUMN "global_rating";--> statement-breakpoint
ALTER TABLE "elo_ratings_current" DROP COLUMN "map_offset";--> statement-breakpoint
ALTER TABLE "elo_ratings_current" DROP COLUMN "effective_rating";--> statement-breakpoint
ALTER TABLE "elo_ratings" DROP COLUMN "global_rating";--> statement-breakpoint
ALTER TABLE "elo_ratings" DROP COLUMN "map_offset";--> statement-breakpoint
ALTER TABLE "elo_ratings" DROP COLUMN "effective_rating";