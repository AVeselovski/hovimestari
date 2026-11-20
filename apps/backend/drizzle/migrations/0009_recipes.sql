CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"food_id" uuid,
	"grams" numeric(5, 1),
	"portion_id" uuid,
	"portion_count" numeric(5, 2),
	"portion_unit" text,
	"portion_name" text,
	"name" text,
	"written_amount" numeric(7, 2),
	"written_unit" text,
	"note" text,
	CONSTRAINT "recipe_ingredients_kind" CHECK (("recipe_ingredients"."food_id" IS NULL) = ("recipe_ingredients"."grams" IS NULL) AND ("recipe_ingredients"."food_id" IS NULL) = ("recipe_ingredients"."name" IS NOT NULL)),
	CONSTRAINT "recipe_ingredients_portion" CHECK (("recipe_ingredients"."portion_count" IS NULL) = ("recipe_ingredients"."portion_unit" IS NULL AND "recipe_ingredients"."portion_name" IS NULL) AND ("recipe_ingredients"."portion_unit" IS NULL OR "recipe_ingredients"."portion_name" IS NULL) AND ("recipe_ingredients"."portion_id" IS NULL OR "recipe_ingredients"."portion_count" IS NOT NULL)),
	CONSTRAINT "recipe_ingredients_portion_counted" CHECK ("recipe_ingredients"."portion_count" IS NULL OR "recipe_ingredients"."food_id" IS NOT NULL),
	CONSTRAINT "recipe_ingredients_grams" CHECK ("recipe_ingredients"."grams" IS NULL OR ("recipe_ingredients"."grams" > 0 AND "recipe_ingredients"."grams" <= 5000)),
	CONSTRAINT "recipe_ingredients_count" CHECK ("recipe_ingredients"."portion_count" IS NULL OR "recipe_ingredients"."portion_count" > 0),
	CONSTRAINT "recipe_ingredients_name_len" CHECK ("recipe_ingredients"."name" IS NULL OR char_length("recipe_ingredients"."name") BETWEEN 1 AND 80),
	CONSTRAINT "recipe_ingredients_note_len" CHECK ("recipe_ingredients"."note" IS NULL OR char_length("recipe_ingredients"."note") BETWEEN 1 AND 80),
	CONSTRAINT "recipe_ingredients_written" CHECK (("recipe_ingredients"."written_amount" IS NULL) = ("recipe_ingredients"."written_unit" IS NULL) AND ("recipe_ingredients"."written_amount" IS NULL OR "recipe_ingredients"."written_amount" > 0)),
	CONSTRAINT "recipe_ingredients_written_unit" CHECK ("recipe_ingredients"."written_unit" IN ('g', 'kg', 'ml', 'dl', 'l', 'tsp', 'tbsp', 'piece', 'clove', 'slice', 'can', 'pack', 'jar', 'bunch', 'pinch', 'handful'))
);
--> statement-breakpoint
CREATE TABLE "recipe_tags" (
	"user_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "recipe_tags_len" CHECK (char_length("recipe_tags"."tag") BETWEEN 1 AND 30)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"servings" integer NOT NULL,
	"time_minutes" integer,
	"steps" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"favourite_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_id_user_uq" UNIQUE("id","user_id"),
	CONSTRAINT "recipes_name_len" CHECK (char_length("recipes"."name") BETWEEN 1 AND 120),
	CONSTRAINT "recipes_servings" CHECK ("recipes"."servings" BETWEEN 1 AND 100),
	CONSTRAINT "recipes_time" CHECK ("recipes"."time_minutes" IS NULL OR "recipes"."time_minutes" BETWEEN 1 AND 1440),
	CONSTRAINT "recipes_steps" CHECK (cardinality("recipes"."steps") <= 40)
);
--> statement-breakpoint
ALTER TABLE "assistant_changes" DROP CONSTRAINT "assistant_changes_action";--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_fk" FOREIGN KEY ("recipe_id","user_id") REFERENCES "public"."recipes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_recipe_fk" FOREIGN KEY ("recipe_id","user_id") REFERENCES "public"."recipes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_ingredients_position_uq" ON "recipe_ingredients" USING btree ("recipe_id","position");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_food_idx" ON "recipe_ingredients" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_user_idx" ON "recipe_ingredients" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_tags_uq" ON "recipe_tags" USING btree ("recipe_id",lower("tag"));--> statement-breakpoint
CREATE INDEX "recipe_tags_user_idx" ON "recipe_tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recipes_user_idx" ON "recipes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "assistant_changes" ADD CONSTRAINT "assistant_changes_action" CHECK ("assistant_changes"."action" IN ('entry.added', 'entry.changed', 'entries.marked', 'entries.copied', 'entries.removed', 'entry.restored', 'food.created', 'food.changed', 'portion.added', 'portion.changed', 'favourite.set', 'favourite.unset', 'saved_meal.created', 'saved_meal.changed', 'saved_meal.archived', 'saved_meal.restored', 'targets.set', 'targets.removed', 'deletion.requested', 'recipe.created', 'recipe.changed', 'recipe.archived', 'recipe.restored', 'recipe.favourite_set', 'recipe.favourite_unset'));