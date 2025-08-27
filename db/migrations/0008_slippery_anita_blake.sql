ALTER TABLE "maps" ADD COLUMN "match_id" bigserial NOT NULL;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "game_number" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;