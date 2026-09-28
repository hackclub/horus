CREATE TABLE "ai_settings" (
	"user_id" text PRIMARY KEY,
	"api_key" text NOT NULL,
	"key_hint" text NOT NULL,
	"model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nephthys_key" (
	"instance_id" text PRIMARY KEY,
	"api_key" text NOT NULL,
	"key_hint" text NOT NULL,
	"host" text NOT NULL,
	"set_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nephthys_key" ADD CONSTRAINT "nephthys_key_instance_id_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instance"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nephthys_key" ADD CONSTRAINT "nephthys_key_set_by_user_id_fkey" FOREIGN KEY ("set_by") REFERENCES "user"("id") ON DELETE SET NULL;