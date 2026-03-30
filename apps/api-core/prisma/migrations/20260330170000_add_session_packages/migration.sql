CREATE TYPE "ClientSessionPackageStatus" AS ENUM ('active', 'completed', 'cancelled');

CREATE TABLE "session_package_offers" (
    "id" UUID NOT NULL,
    "psychologist_user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "session_count" INTEGER NOT NULL,
    "discount_percent" INTEGER NOT NULL,
    "total_price" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'RUB',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_package_offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_session_packages" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "client_user_id" UUID NOT NULL,
    "psychologist_user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "total_sessions" INTEGER NOT NULL,
    "remaining_sessions" INTEGER NOT NULL,
    "discount_percent" INTEGER NOT NULL,
    "price_amount" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'RUB',
    "status" "ClientSessionPackageStatus" NOT NULL DEFAULT 'active',
    "idempotency_key" VARCHAR(128),
    "purchased_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_session_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_session_package_usages" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "consultation_id" UUID NOT NULL,
    "used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_session_package_usages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_session_packages_client_user_id_idempotency_key_key"
ON "client_session_packages"("client_user_id", "idempotency_key");

CREATE UNIQUE INDEX "client_session_package_usages_consultation_id_key"
ON "client_session_package_usages"("consultation_id");

CREATE INDEX "session_package_offers_psychologist_user_id_is_active_idx"
ON "session_package_offers"("psychologist_user_id", "is_active");

CREATE INDEX "client_session_packages_client_user_id_status_purchased_at_idx"
ON "client_session_packages"("client_user_id", "status", "purchased_at");

CREATE INDEX "client_session_packages_psychologist_user_id_status_purchased_at_idx"
ON "client_session_packages"("psychologist_user_id", "status", "purchased_at");

CREATE INDEX "client_session_packages_offer_id_idx"
ON "client_session_packages"("offer_id");

CREATE INDEX "client_session_package_usages_package_id_released_at_idx"
ON "client_session_package_usages"("package_id", "released_at");

ALTER TABLE "session_package_offers"
ADD CONSTRAINT "session_package_offers_psychologist_user_id_fkey"
FOREIGN KEY ("psychologist_user_id") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "client_session_packages"
ADD CONSTRAINT "client_session_packages_offer_id_fkey"
FOREIGN KEY ("offer_id") REFERENCES "session_package_offers"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "client_session_packages"
ADD CONSTRAINT "client_session_packages_client_user_id_fkey"
FOREIGN KEY ("client_user_id") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "client_session_packages"
ADD CONSTRAINT "client_session_packages_psychologist_user_id_fkey"
FOREIGN KEY ("psychologist_user_id") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "client_session_package_usages"
ADD CONSTRAINT "client_session_package_usages_package_id_fkey"
FOREIGN KEY ("package_id") REFERENCES "client_session_packages"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "client_session_package_usages"
ADD CONSTRAINT "client_session_package_usages_consultation_id_fkey"
FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
