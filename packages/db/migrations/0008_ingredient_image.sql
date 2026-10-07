ALTER TYPE "public"."attachment_owner_type" ADD VALUE 'ingredient';--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "image_id" uuid;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_image_id_attachments_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;