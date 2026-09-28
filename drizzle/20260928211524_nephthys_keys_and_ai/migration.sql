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
	"key_id" text PRIMARY KEY,
	"instance_id" text NOT NULL,
	"user_id" text NOT NULL,
	"api_key" text NOT NULL,
	"key_hint" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nephthys_key_instance_id_user_id_unique" UNIQUE("instance_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nephthys_key" ADD CONSTRAINT "nephthys_key_instance_id_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instance"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "nephthys_key" ADD CONSTRAINT "nephthys_key_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;