CREATE TABLE "assistant_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"connection_name" text NOT NULL,
	"action" text NOT NULL,
	"entity_ids" uuid[] NOT NULL,
	"summary" jsonb NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "assistant_changes_action" CHECK ("assistant_changes"."action" IN ('entry.added', 'entry.changed', 'entries.marked', 'entries.copied', 'entries.removed', 'entry.restored', 'food.created', 'food.changed', 'portion.added', 'portion.changed', 'favourite.set', 'favourite.unset', 'saved_meal.created', 'saved_meal.changed', 'saved_meal.archived', 'saved_meal.restored', 'targets.set', 'targets.removed', 'deletion.requested')),
	CONSTRAINT "assistant_changes_entity_ids" CHECK (cardinality("assistant_changes"."entity_ids") >= 1)
);
--> statement-breakpoint
ALTER TABLE "assistant_changes" ADD CONSTRAINT "assistant_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_changes" ADD CONSTRAINT "assistant_changes_connection_id_assistant_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."assistant_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_changes_request_key_uq" ON "assistant_changes" USING btree ("connection_id","request_key");--> statement-breakpoint
CREATE INDEX "assistant_changes_connection_idx" ON "assistant_changes" USING btree ("connection_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "assistant_changes_user_idx" ON "assistant_changes" USING btree ("user_id","created_at" DESC NULLS LAST);