CREATE TABLE "cook_ingredients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"cook_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"from_line_id" uuid,
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
	CONSTRAINT "cook_ingredients_kind" CHECK (("cook_ingredients"."food_id" IS NULL) = ("cook_ingredients"."grams" IS NULL) AND ("cook_ingredients"."food_id" IS NULL) = ("cook_ingredients"."name" IS NOT NULL)),
	CONSTRAINT "cook_ingredients_portion" CHECK (("cook_ingredients"."portion_count" IS NULL) = ("cook_ingredients"."portion_unit" IS NULL AND "cook_ingredients"."portion_name" IS NULL) AND ("cook_ingredients"."portion_unit" IS NULL OR "cook_ingredients"."portion_name" IS NULL) AND ("cook_ingredients"."portion_id" IS NULL OR "cook_ingredients"."portion_count" IS NOT NULL)),
	CONSTRAINT "cook_ingredients_portion_counted" CHECK ("cook_ingredients"."portion_count" IS NULL OR "cook_ingredients"."food_id" IS NOT NULL),
	CONSTRAINT "cook_ingredients_grams" CHECK ("cook_ingredients"."grams" IS NULL OR ("cook_ingredients"."grams" > 0 AND "cook_ingredients"."grams" <= 5000)),
	CONSTRAINT "cook_ingredients_count" CHECK ("cook_ingredients"."portion_count" IS NULL OR "cook_ingredients"."portion_count" > 0),
	CONSTRAINT "cook_ingredients_name_len" CHECK ("cook_ingredients"."name" IS NULL OR char_length("cook_ingredients"."name") BETWEEN 1 AND 80),
	CONSTRAINT "cook_ingredients_note_len" CHECK ("cook_ingredients"."note" IS NULL OR char_length("cook_ingredients"."note") BETWEEN 1 AND 80),
	CONSTRAINT "cook_ingredients_written" CHECK (("cook_ingredients"."written_amount" IS NULL) = ("cook_ingredients"."written_unit" IS NULL) AND ("cook_ingredients"."written_amount" IS NULL OR "cook_ingredients"."written_amount" > 0)),
	CONSTRAINT "cook_ingredients_written_unit" CHECK ("cook_ingredients"."written_unit" IN ('g', 'kg', 'ml', 'dl', 'l', 'tsp', 'tbsp', 'piece', 'clove', 'slice', 'can', 'pack', 'jar', 'bunch', 'pinch', 'handful'))
);
--> statement-breakpoint
CREATE TABLE "cooks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"date" date NOT NULL,
	"servings" integer NOT NULL,
	"basis_energy_kcal" numeric(7, 2) NOT NULL,
	"basis_protein_g" numeric(7, 3) NOT NULL,
	"basis_carbs_g" numeric(7, 3) NOT NULL,
	"basis_fat_g" numeric(7, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cooks_id_user_uq" UNIQUE("id","user_id"),
	CONSTRAINT "cooks_id_recipe_user_uq" UNIQUE("id","recipe_id","user_id"),
	CONSTRAINT "cooks_servings" CHECK ("cooks"."servings" BETWEEN 1 AND 100),
	CONSTRAINT "cooks_basis" CHECK ("cooks"."basis_energy_kcal" >= 0 AND "cooks"."basis_protein_g" >= 0 AND "cooks"."basis_carbs_g" >= 0 AND "cooks"."basis_fat_g" >= 0)
);
--> statement-breakpoint
ALTER TABLE "assistant_changes" DROP CONSTRAINT "assistant_changes_action";--> statement-breakpoint
ALTER TABLE "entries" DROP CONSTRAINT "entries_recipe_fields";--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "cook_id" uuid;--> statement-breakpoint
ALTER TABLE "cook_ingredients" ADD CONSTRAINT "cook_ingredients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cook_ingredients" ADD CONSTRAINT "cook_ingredients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cook_ingredients" ADD CONSTRAINT "cook_ingredients_cook_fk" FOREIGN KEY ("cook_id","user_id") REFERENCES "public"."cooks"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooks" ADD CONSTRAINT "cooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooks" ADD CONSTRAINT "cooks_recipe_fk" FOREIGN KEY ("recipe_id","user_id") REFERENCES "public"."recipes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cook_ingredients_position_uq" ON "cook_ingredients" USING btree ("cook_id","position");--> statement-breakpoint
CREATE INDEX "cook_ingredients_food_idx" ON "cook_ingredients" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "cook_ingredients_user_idx" ON "cook_ingredients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cooks_recipe_idx" ON "cooks" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "cooks_user_idx" ON "cooks" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_cook_fk" FOREIGN KEY ("cook_id","recipe_id","user_id") REFERENCES "public"."cooks"("id","recipe_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_cook_idx" ON "entries" USING btree ("cook_id");--> statement-breakpoint
ALTER TABLE "assistant_changes" ADD CONSTRAINT "assistant_changes_action" CHECK ("assistant_changes"."action" IN ('entry.added', 'entry.changed', 'entries.marked', 'entries.copied', 'entries.removed', 'entry.restored', 'food.created', 'food.changed', 'portion.added', 'portion.changed', 'favourite.set', 'favourite.unset', 'saved_meal.created', 'saved_meal.changed', 'saved_meal.archived', 'saved_meal.restored', 'targets.set', 'targets.removed', 'deletion.requested', 'recipe.created', 'recipe.changed', 'recipe.archived', 'recipe.restored', 'recipe.favourite_set', 'recipe.favourite_unset', 'cook.logged'));--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_recipe_fields" CHECK ("entries"."kind" = 'recipe' OR ("entries"."recipe_id" IS NULL AND "entries"."servings" IS NULL AND "entries"."cook_id" IS NULL));