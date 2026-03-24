CREATE TABLE "telegram_link_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "telegram_chat_id" VARCHAR(64),
    "telegram_user_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_link_tokens_token_hash_key" ON "telegram_link_tokens"("token_hash");
CREATE INDEX "telegram_link_tokens_user_id_expires_at_idx" ON "telegram_link_tokens"("user_id", "expires_at");
CREATE INDEX "telegram_link_tokens_user_id_used_at_revoked_at_idx" ON "telegram_link_tokens"("user_id", "used_at", "revoked_at");

ALTER TABLE "telegram_link_tokens"
ADD CONSTRAINT "telegram_link_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
