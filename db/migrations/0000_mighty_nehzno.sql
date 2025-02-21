CREATE TABLE "teams" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" varchar NOT NULL,
	"name" varchar NOT NULL,
	"region" varchar,
	"logo_url" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);
