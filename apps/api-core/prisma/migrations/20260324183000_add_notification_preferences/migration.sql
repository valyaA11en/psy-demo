CREATE TABLE "notification_preferences" (
    "user_id" UUID NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "telegram_enabled" BOOLEAN NOT NULL DEFAULT false,
    "booking_updates_enabled" BOOLEAN NOT NULL DEFAULT true,
    "payment_updates_enabled" BOOLEAN NOT NULL DEFAULT true,
    "session_updates_enabled" BOOLEAN NOT NULL DEFAULT true,
    "system_updates_enabled" BOOLEAN NOT NULL DEFAULT true,
    "telegram_chat_id" VARCHAR(64),
    "telegram_linked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "notification_preferences"
ADD CONSTRAINT "notification_preferences_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
