CREATE TABLE "user_two_factor_credentials" (
    "user_id" UUID NOT NULL,
    "totp_secret_encrypted" TEXT NOT NULL,
    "recovery_codes_json" JSONB NOT NULL,
    "enabled_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_two_factor_credentials_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "user_two_factor_credentials"
ADD CONSTRAINT "user_two_factor_credentials_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
