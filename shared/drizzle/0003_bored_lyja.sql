CREATE TABLE "core"."job" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe" text,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ws"."ai_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent" text NOT NULL,
	"micros" bigint NOT NULL,
	"spent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws"."mail_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"thread_id" text,
	"direction" text NOT NULL,
	"from_name" text,
	"from_email" text,
	"to_line" text,
	"subject" text,
	"excerpt" text,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws"."mailbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"role" text NOT NULL,
	"address" text NOT NULL,
	"sealed" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_problem" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."workspace" ADD COLUMN "last_turn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."job" ADD CONSTRAINT "job_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."ai_spend" ADD CONSTRAINT "ai_spend_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."mail_message" ADD CONSTRAINT "mail_message_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."mail_message" ADD CONSTRAINT "mail_message_mailbox_id_mailbox_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "ws"."mailbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."mailbox" ADD CONSTRAINT "mailbox_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_due" ON "core"."job" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_one_waiting" ON "core"."job" USING btree ("workspace_id","kind","dedupe") WHERE status in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "ai_spend_month" ON "ws"."ai_spend" USING btree ("workspace_id","spent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_message_once" ON "ws"."mail_message" USING btree ("mailbox_id","provider_id");--> statement-breakpoint
CREATE INDEX "mail_message_recent" ON "ws"."mail_message" USING btree ("workspace_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mailbox_one_per_address" ON "ws"."mailbox" USING btree ("workspace_id","address");--> statement-breakpoint
-- Rule 1: every new customer table goes behind the wall in the same change that makes it.
SELECT core.put_behind_wall('ws.mailbox');
--> statement-breakpoint
SELECT core.put_behind_wall('ws.mail_message');
--> statement-breakpoint
SELECT core.put_behind_wall('ws.ai_spend');
