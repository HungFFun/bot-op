-- Existing accounts: login name = former phone, password = former PIN (same argon2 hash format).
UPDATE "users" SET "username" = "phone" WHERE "username" IS NULL;--> statement-breakpoint
UPDATE "users" SET "password_hash" = "pin_hash" WHERE "password_hash" IS NULL;
