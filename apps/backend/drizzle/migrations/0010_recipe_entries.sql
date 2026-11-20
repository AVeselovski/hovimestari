ALTER TABLE "entries" DROP CONSTRAINT "entries_kind";--> statement-breakpoint
ALTER TABLE "entries" DROP CONSTRAINT "entries_amounts";--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "recipe_id" uuid;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "servings" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_recipe_user_fk" FOREIGN KEY ("recipe_id","user_id") REFERENCES "public"."recipes"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_recipe_idx" ON "entries" USING btree ("recipe_id","date");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_recipe" CHECK (("entries"."kind" = 'recipe') = ("entries"."recipe_id" IS NOT NULL AND "entries"."servings" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_recipe_fields" CHECK ("entries"."kind" = 'recipe' OR ("entries"."recipe_id" IS NULL AND "entries"."servings" IS NULL));--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_kind" CHECK ("entries"."kind" IN ('food', 'saved_meal', 'estimate', 'recipe'));--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_amounts" CHECK (("entries"."grams" IS NULL OR "entries"."grams" > 0) AND ("entries"."meal_count" IS NULL OR "entries"."meal_count" > 0) AND ("entries"."portion_count" IS NULL OR "entries"."portion_count" > 0) AND ("entries"."servings" IS NULL OR ("entries"."servings" > 0 AND "entries"."servings" <= 100)));