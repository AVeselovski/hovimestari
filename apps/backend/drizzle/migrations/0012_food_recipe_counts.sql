ALTER TABLE "foods" ADD COLUMN "fineli_recipe_uses" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "fineli_recipe_foods" integer;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_fineli_recipe_counts" CHECK ("foods"."fineli_recipe_uses" >= 0 AND ("foods"."fineli_recipe_foods" IS NULL OR "foods"."fineli_recipe_foods" >= 0));