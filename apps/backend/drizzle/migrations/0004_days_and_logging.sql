CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"position" bigserial NOT NULL,
	"status" text NOT NULL,
	"eaten_at" timestamp with time zone,
	"kind" text NOT NULL,
	"food_id" uuid,
	"grams" numeric(5, 1),
	"portion_id" uuid,
	"portion_count" numeric(5, 2),
	"portion_unit" text,
	"portion_name" text,
	"saved_meal_id" uuid,
	"meal_count" numeric(5, 2),
	"name" text,
	"note" text,
	"basis_energy_kcal" numeric(7, 2) NOT NULL,
	"basis_protein_g" numeric(7, 3) NOT NULL,
	"basis_carbs_g" numeric(7, 3) NOT NULL,
	"basis_fat_g" numeric(7, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_status" CHECK ("entries"."status" IN ('planned', 'eaten')),
	CONSTRAINT "entries_kind" CHECK ("entries"."kind" IN ('food', 'saved_meal', 'estimate')),
	CONSTRAINT "entries_eaten_at" CHECK (("entries"."status" = 'eaten') = ("entries"."eaten_at" IS NOT NULL)),
	CONSTRAINT "entries_food" CHECK (("entries"."kind" = 'food') = ("entries"."food_id" IS NOT NULL AND "entries"."grams" IS NOT NULL)),
	CONSTRAINT "entries_food_fields" CHECK ("entries"."kind" = 'food' OR ("entries"."food_id" IS NULL AND "entries"."grams" IS NULL AND "entries"."portion_count" IS NULL)),
	CONSTRAINT "entries_meal" CHECK (("entries"."kind" = 'saved_meal') = ("entries"."saved_meal_id" IS NOT NULL AND "entries"."meal_count" IS NOT NULL)),
	CONSTRAINT "entries_meal_fields" CHECK ("entries"."kind" = 'saved_meal' OR ("entries"."saved_meal_id" IS NULL AND "entries"."meal_count" IS NULL)),
	CONSTRAINT "entries_estimate" CHECK (("entries"."kind" = 'estimate') = ("entries"."name" IS NOT NULL)),
	CONSTRAINT "entries_note" CHECK ("entries"."note" IS NULL OR "entries"."kind" = 'estimate'),
	CONSTRAINT "entries_portion" CHECK (("entries"."portion_count" IS NULL) = ("entries"."portion_unit" IS NULL AND "entries"."portion_name" IS NULL) AND ("entries"."portion_unit" IS NULL OR "entries"."portion_name" IS NULL) AND ("entries"."portion_id" IS NULL OR "entries"."portion_count" IS NOT NULL)),
	CONSTRAINT "entries_amounts" CHECK (("entries"."grams" IS NULL OR "entries"."grams" > 0) AND ("entries"."meal_count" IS NULL OR "entries"."meal_count" > 0) AND ("entries"."portion_count" IS NULL OR "entries"."portion_count" > 0)),
	CONSTRAINT "entries_basis" CHECK ("entries"."basis_energy_kcal" >= 0 AND "entries"."basis_protein_g" >= 0 AND "entries"."basis_carbs_g" >= 0 AND "entries"."basis_fat_g" >= 0)
);
--> statement-breakpoint
CREATE TABLE "removed_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"row" jsonb NOT NULL,
	"removed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source" text,
	"energy_kcal" numeric(6, 1) NOT NULL,
	"protein_g" numeric(5, 1) NOT NULL,
	"carbs_g" numeric(5, 1) NOT NULL,
	"fat_g" numeric(5, 1) NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_meals_id_user_uq" UNIQUE("id","user_id"),
	CONSTRAINT "saved_meals_values_in_range" CHECK ("saved_meals"."energy_kcal" BETWEEN 0 AND 10000 AND "saved_meals"."protein_g" BETWEEN 0 AND 1000 AND "saved_meals"."carbs_g" BETWEEN 0 AND 1000 AND "saved_meals"."fat_g" BETWEEN 0 AND 1000)
);
--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_saved_meal_user_fk" FOREIGN KEY ("saved_meal_id","user_id") REFERENCES "public"."saved_meals"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removed_entries" ADD CONSTRAINT "removed_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_meals" ADD CONSTRAINT "saved_meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entries_user_date_idx" ON "entries" USING btree ("user_id","date","position");--> statement-breakpoint
CREATE INDEX "entries_user_eaten_idx" ON "entries" USING btree ("user_id","eaten_at" DESC NULLS LAST,"position" DESC NULLS LAST) WHERE "entries"."eaten_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entries_food_id_idx" ON "entries" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "entries_saved_meal_id_idx" ON "entries" USING btree ("saved_meal_id");--> statement-breakpoint
CREATE INDEX "removed_entries_user_removed_idx" ON "removed_entries" USING btree ("user_id","removed_at");--> statement-breakpoint
CREATE INDEX "saved_meals_user_id_idx" ON "saved_meals" USING btree ("user_id");