CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'telegram');

CREATE TYPE "NotificationStatus" AS ENUM ('queued', 'processing', 'sent', 'failed');

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app',
    "type" VARCHAR(128) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "payload_json" JSONB,
    "dedup_key" VARCHAR(255) NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "queued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_started_at" TIMESTAMPTZ(6),
    "next_attempt_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(128),
    "last_error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_user_id_channel_dedup_key_key"
ON "notifications"("user_id", "channel", "dedup_key");

CREATE INDEX "notifications_user_id_created_at_idx"
ON "notifications"("user_id", "created_at");

CREATE INDEX "notifications_user_id_read_at_created_at_idx"
ON "notifications"("user_id", "read_at", "created_at");

CREATE INDEX "notifications_status_next_attempt_at_created_at_idx"
ON "notifications"("status", "next_attempt_at", "created_at");

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
