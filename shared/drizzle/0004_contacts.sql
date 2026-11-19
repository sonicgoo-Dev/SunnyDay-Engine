CREATE TABLE "ws"."contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"business" boolean DEFAULT false NOT NULL,
	"full_name" text NOT NULL,
	"goes_by" text,
	"company" text,
	"business_role" text,
	"buyer_stage" text,
	"seller_stage" text,
	"preferred_way" text,
	"best_times" text,
	"no_text" boolean DEFAULT false NOT NULL,
	"no_email" boolean DEFAULT false NOT NULL,
	"mailing_address" text,
	"home_address" text,
	"birthday" date,
	"wedding_anniversary" date,
	"home_purchase_date" date,
	"client_since" date,
	"personal_notes" text,
	"buyer_wants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seller_wants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"found_by" text,
	"found_by_other" text,
	"referred_by_id" uuid,
	"referred_by_name" text,
	"found_recorded_at" timestamp with time zone,
	"household_id" uuid,
	"put_away_at" timestamp with time zone,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws"."contact_way" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"label" text DEFAULT 'mobile' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws"."custom_field" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws"."custom_value" (
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "custom_value_contact_id_field_id_pk" PRIMARY KEY("contact_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "ws"."family_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relation" text NOT NULL,
	"birthday" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws"."household" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws"."nickname" (
	"contact_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"nickname" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws"."story_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"by_user_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ws"."contact" ADD CONSTRAINT "contact_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."contact" ADD CONSTRAINT "contact_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "ws"."household"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."contact" ADD CONSTRAINT "contact_referred_by_fk" FOREIGN KEY ("referred_by_id") REFERENCES "ws"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."contact_way" ADD CONSTRAINT "contact_way_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."contact_way" ADD CONSTRAINT "contact_way_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "ws"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."custom_field" ADD CONSTRAINT "custom_field_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."custom_value" ADD CONSTRAINT "custom_value_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."custom_value" ADD CONSTRAINT "custom_value_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "ws"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."custom_value" ADD CONSTRAINT "custom_value_field_id_custom_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "ws"."custom_field"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."family_member" ADD CONSTRAINT "family_member_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."family_member" ADD CONSTRAINT "family_member_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "ws"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."household" ADD CONSTRAINT "household_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."nickname" ADD CONSTRAINT "nickname_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "ws"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."nickname" ADD CONSTRAINT "nickname_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."story_event" ADD CONSTRAINT "story_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "core"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ws"."story_event" ADD CONSTRAINT "story_event_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "ws"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_by_name" ON "ws"."contact" USING btree ("workspace_id","full_name");--> statement-breakpoint
CREATE INDEX "contact_by_household" ON "ws"."contact" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "contact_way_by_contact" ON "ws"."contact_way" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "contact_way_by_value" ON "ws"."contact_way" USING btree ("workspace_id","kind","value");--> statement-breakpoint
CREATE INDEX "family_by_household" ON "ws"."family_member" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "story_by_contact" ON "ws"."story_event" USING btree ("contact_id","at");--> statement-breakpoint
-- Rule 1: every new customer table goes behind the wall in the same change that makes it.
SELECT core.put_behind_wall('ws.household');
--> statement-breakpoint
SELECT core.put_behind_wall('ws.contact');
--> statement-breakpoint
SELECT core.put_behind_wall('ws.nickname');
--> statement-breakpoint
SELECT core.put_behind_wall('ws.contact_way');
--> statement-breakpoint
SELECT core.put_behind_wall('ws.family_member');
--> statement-breakpoint
SELECT core.put_behind_wall('ws.custom_field');
--> statement-breakpoint
SELECT core.put_behind_wall('ws.custom_value');
--> statement-breakpoint
SELECT core.put_behind_wall('ws.story_event');
