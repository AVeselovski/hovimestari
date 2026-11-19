CREATE TABLE "food_lookups" (
	"user_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"looked_up_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_lookups_user_id_food_id_pk" PRIMARY KEY("user_id","food_id")
);
--> statement-breakpoint
ALTER TABLE "food_lookups" ADD CONSTRAINT "food_lookups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_lookups" ADD CONSTRAINT "food_lookups_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_lookups_food_id_idx" ON "food_lookups" USING btree ("food_id");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_off_barcode_uq" ON "foods" USING btree (lpad("barcode", 14, '0')) WHERE "foods"."source" = 'open_food_facts';--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_off_has_barcode" CHECK ("foods"."source" <> 'open_food_facts' OR "foods"."barcode" IS NOT NULL);