CREATE TABLE "interview_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"candidate_id" uuid,
	"industry" text NOT NULL,
	"level" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"transcript" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"plan" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
