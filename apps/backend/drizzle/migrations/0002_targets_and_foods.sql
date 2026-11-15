CREATE TYPE "public"."food_source" AS ENUM('fineli', 'open_food_facts', 'user');--> statement-breakpoint
CREATE TABLE "food_favourites" (
	"user_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_favourites_user_id_food_id_pk" PRIMARY KEY("user_id","food_id")
);
--> statement-breakpoint
CREATE TABLE "food_portions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"user_id" uuid,
	"fineli_unit" text,
	"name" text,
	"grams" numeric(6, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_portions_one_label" CHECK (("food_portions"."fineli_unit" IS NULL) <> ("food_portions"."name" IS NULL)),
	CONSTRAINT "food_portions_fineli_unit_known" CHECK ("food_portions"."fineli_unit" IN ('KPL_S', 'KPL_M', 'KPL_L', 'KPL_VALM', 'PORTS', 'PORTM', 'PORTL', 'DL', 'RKL', 'TL')),
	CONSTRAINT "food_portions_fineli_unowned" CHECK ("food_portions"."fineli_unit" IS NULL OR "food_portions"."user_id" IS NULL),
	CONSTRAINT "food_portions_grams_positive" CHECK ("food_portions"."grams" > 0 AND "food_portions"."grams" <= 5000)
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "food_source" NOT NULL,
	"user_id" uuid,
	"fineli_id" integer,
	"name" text NOT NULL,
	"name_en" text,
	"energy_kcal" numeric(6, 2) NOT NULL,
	"protein_g" numeric(6, 3) NOT NULL,
	"carbs_g" numeric(6, 3) NOT NULL,
	"fat_g" numeric(6, 3) NOT NULL,
	"barcode" text,
	"fineli_type" text,
	"fineli_process" text,
	"retired_at" timestamp with time zone,
	"search_name" text GENERATED ALWAYS AS (food_search_norm(name)) STORED,
	"search_name_en" text GENERATED ALWAYS AS (coalesce(food_search_norm(name_en), '')) STORED,
	"search_all" text GENERATED ALWAYS AS (food_search_norm(name || ' ' || coalesce(name_en, ''))) STORED,
	"search_head" text GENERATED ALWAYS AS (food_search_head(name)) STORED,
	"search_head_en" text GENERATED ALWAYS AS (coalesce(food_search_head(name_en), '')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foods_fineli_id_unique" UNIQUE("fineli_id"),
	CONSTRAINT "foods_owner_matches_source" CHECK (("foods"."source" = 'user') = ("foods"."user_id" IS NOT NULL)),
	CONSTRAINT "foods_fineli_id_matches_source" CHECK (("foods"."source" = 'fineli') = ("foods"."fineli_id" IS NOT NULL)),
	CONSTRAINT "foods_values_in_range" CHECK ("foods"."energy_kcal" BETWEEN 0 AND 1000 AND "foods"."protein_g" BETWEEN 0 AND 100 AND "foods"."carbs_g" BETWEEN 0 AND 100 AND "foods"."fat_g" BETWEEN 0 AND 100),
	CONSTRAINT "foods_barcode_digits" CHECK ("foods"."barcode" ~ '^[0-9]{8,14}$')
);
--> statement-breakpoint
CREATE TABLE "target_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"energy_kcal_lower" numeric(6, 1) NOT NULL,
	"energy_kcal_upper" numeric(6, 1) NOT NULL,
	"protein_g_lower" numeric(5, 1) NOT NULL,
	"protein_g_upper" numeric(5, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "target_changes_energy_range" CHECK (0 < "target_changes"."energy_kcal_lower" AND "target_changes"."energy_kcal_lower" <= "target_changes"."energy_kcal_upper"),
	CONSTRAINT "target_changes_protein_range" CHECK (0 < "target_changes"."protein_g_lower" AND "target_changes"."protein_g_lower" <= "target_changes"."protein_g_upper")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "food_name_language" text DEFAULT 'fi' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "time_zone" text DEFAULT 'Europe/Helsinki' NOT NULL;--> statement-breakpoint
ALTER TABLE "food_favourites" ADD CONSTRAINT "food_favourites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_favourites" ADD CONSTRAINT "food_favourites_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_portions" ADD CONSTRAINT "food_portions_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_portions" ADD CONSTRAINT "food_portions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_changes" ADD CONSTRAINT "target_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_favourites_food_id_idx" ON "food_favourites" USING btree ("food_id");--> statement-breakpoint
CREATE UNIQUE INDEX "food_portions_fineli_unit_uq" ON "food_portions" USING btree ("food_id","fineli_unit") WHERE "food_portions"."fineli_unit" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "food_portions_food_id_idx" ON "food_portions" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "food_portions_user_id_idx" ON "food_portions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_user_barcode_uq" ON "foods" USING btree ("user_id","barcode") WHERE "foods"."source" = 'user' AND "foods"."barcode" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "foods_user_id_idx" ON "foods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "foods_search_all_trgm" ON "foods" USING gin ("search_all" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "target_changes_user_date_uq" ON "target_changes" USING btree ("user_id","effective_from");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_food_name_language" CHECK ("users"."food_name_language" IN ('fi', 'en'));