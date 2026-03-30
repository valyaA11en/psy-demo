CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "client_user_id" UUID NOT NULL,
    "psychologist_user_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messages_client_user_id_psychologist_user_id_created_at_idx"
ON "messages"("client_user_id", "psychologist_user_id", "created_at");

CREATE INDEX "messages_client_user_id_psychologist_user_id_read_at_created_at_idx"
ON "messages"("client_user_id", "psychologist_user_id", "read_at", "created_at");

CREATE INDEX "messages_sender_user_id_created_at_idx"
ON "messages"("sender_user_id", "created_at");

ALTER TABLE "messages"
ADD CONSTRAINT "messages_client_user_id_fkey"
FOREIGN KEY ("client_user_id") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "messages"
ADD CONSTRAINT "messages_psychologist_user_id_fkey"
FOREIGN KEY ("psychologist_user_id") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "messages"
ADD CONSTRAINT "messages_sender_user_id_fkey"
FOREIGN KEY ("sender_user_id") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
