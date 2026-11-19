CREATE TABLE "assistant_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"access" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_connections_key_hash_unique" UNIQUE("key_hash"),
	CONSTRAINT "assistant_connections_name_len" CHECK (char_length("assistant_connections"."name") BETWEEN 1 AND 64),
	CONSTRAINT "assistant_connections_access" CHECK ("assistant_connections"."access" IN ('read', 'read_write'))
);
--> statement-breakpoint
ALTER TABLE "assistant_connections" ADD CONSTRAINT "assistant_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_connections_user_idx" ON "assistant_connections" USING btree ("user_id","created_at" DESC NULLS LAST);