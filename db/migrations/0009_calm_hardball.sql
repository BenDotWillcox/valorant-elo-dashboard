CREATE TABLE "etl_runs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"status" varchar(16) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"failed_step" varchar(128),
	"error" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "etl_runs_status_check" CHECK ("status" IN ('running', 'success', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "etl_runs_status_started_at_idx" ON "etl_runs" USING btree ("status", "started_at");
--> statement-breakpoint
ALTER TABLE "etl_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Server-internal telemetry: the app reads this table through its direct
-- PostgreSQL connection, so Data API roles intentionally receive no policy.
REVOKE ALL ON TABLE "etl_runs" FROM PUBLIC, anon, authenticated, service_role;
