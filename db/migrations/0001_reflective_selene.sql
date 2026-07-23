CREATE TABLE "maps" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"map_name" varchar NOT NULL,
	"winner_team_id" bigserial NOT NULL,
	"loser_team_id" bigserial NOT NULL,
	"winner_rounds" integer NOT NULL,
	"loser_rounds" integer NOT NULL,
	"event_name" varchar,
	"region" varchar,
	"completed_at" timestamp,
	"processed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_loser_team_id_teams_id_fk" FOREIGN KEY ("loser_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;