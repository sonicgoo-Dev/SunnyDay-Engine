CREATE TABLE "ws"."detail_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"source" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws"."list_mail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
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
	"bulk" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws"."list_person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"phone_digits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"in_mail" boolean DEFAULT false NOT NULL,
	"in_google" boolean DEFAULT false NOT NULL,
	"in_phone" boolean DEFAULT false NOT NULL,
	"in_count" integer DEFAULT 0 NOT NULL,
	"out_count" integer DEFAULT 0 NOT NULL,
	"first_at" timestamp with time zone,
	"last_at" timestamp with time zone,
	"bucket" text DEFAULT 'person' NOT NULL,
	"state" text DEFAULT 'new' NOT NULL,
	"look_run_id" uuid,
	"proposal" jsonb,
	"details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contact_id" uuid,
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws"."list_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"from_at" timestamp with time zone NOT NULL,
	"to_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'reading' NOT NULL,
	"paused_why" text,
	"parts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"messages_read" integer DEFAULT 0 NOT NULL,
	"to_look" integer DEFAULT 0 NOT NULL,
	"looked" integer DEFAULT 0 NOT NULL,
	"last_problem" text,
	"started_by" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ws"."mailbox" ADD COLUMN "can_read_contacts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ws"."detail_source" ADD CONSTRAINT "detail_source_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."detail_source" ADD CONSTRAINT "detail_source_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "ws"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."list_mail" ADD CONSTRAINT "list_mail_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."list_mail" ADD CONSTRAINT "list_mail_run_id_list_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "ws"."list_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."list_mail" ADD CONSTRAINT "list_mail_mailbox_id_mailbox_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "ws"."mailbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."list_person" ADD CONSTRAINT "list_person_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."list_person" ADD CONSTRAINT "list_person_look_run_id_list_run_id_fk" FOREIGN KEY ("look_run_id") REFERENCES "ws"."list_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."list_person" ADD CONSTRAINT "list_person_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "ws"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."list_run" ADD CONSTRAINT "list_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "detail_source_by_contact" ON "ws"."detail_source" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "list_mail_once" ON "ws"."list_mail" USING btree ("mailbox_id","provider_id");--> statement-breakpoint
CREATE INDEX "list_mail_by_run" ON "ws"."list_mail" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "list_person_by_state" ON "ws"."list_person" USING btree ("workspace_id","state","bucket");--> statement-breakpoint
CREATE INDEX "list_person_to_look" ON "ws"."list_person" USING btree ("look_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "list_run_one_per_year" ON "ws"."list_run" USING btree ("workspace_id","year");--> statement-breakpoint
-- Rule 1: every new customer table goes behind the wall in the same change that makes it.
SELECT core.put_behind_wall('ws.list_run');
--> statement-breakpoint
SELECT core.put_behind_wall('ws.list_mail');
--> statement-breakpoint
SELECT core.put_behind_wall('ws.list_person');
--> statement-breakpoint
SELECT core.put_behind_wall('ws.detail_source');
