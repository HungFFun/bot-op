CREATE TYPE "public"."price_source" AS ENUM('po_receipt', 'manual', 'import');--> statement-breakpoint
CREATE TABLE "ingredient_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredient_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ingredient_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"unit_price" bigint NOT NULL,
	"source" "price_source" NOT NULL,
	"po_item_id" uuid,
	"recorded_by" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"category_id" uuid,
	"default_supplier_id" uuid,
	"min_order_qty" numeric(12, 3),
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"search_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"zalo_contact" text,
	"address" text,
	"payment_terms" text,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"diff" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredient_prices" ADD CONSTRAINT "ingredient_prices_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_prices" ADD CONSTRAINT "ingredient_prices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_prices" ADD CONSTRAINT "ingredient_prices_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_category_id_ingredient_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ingredient_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_default_supplier_id_suppliers_id_fk" FOREIGN KEY ("default_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredient_prices_ingredient_recorded_idx" ON "ingredient_prices" USING btree ("ingredient_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ingredients_search_text_trgm_idx" ON "ingredients" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "ingredients_category_id_idx" ON "ingredients" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE VIEW "public"."v_latest_price" AS (
  select ingredient_id, supplier_id, unit_price, recorded_at, prev_unit_price
  from (
    select ingredient_id, supplier_id, unit_price, recorded_at,
      lag(unit_price) over w as prev_unit_price,
      row_number() over (partition by ingredient_id order by recorded_at desc, created_at desc) as rn
    from ingredient_prices
    window w as (partition by ingredient_id order by recorded_at, created_at)
  ) ranked
  where rn = 1
);--> statement-breakpoint
CREATE VIEW "public"."v_latest_price_by_supplier" AS (
  select distinct on (ingredient_id, supplier_id) ingredient_id, supplier_id, unit_price, recorded_at
  from ingredient_prices
  order by ingredient_id, supplier_id, recorded_at desc, created_at desc
);