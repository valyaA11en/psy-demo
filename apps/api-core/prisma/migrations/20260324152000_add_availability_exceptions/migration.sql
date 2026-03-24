-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" UUID NOT NULL,
    "psychologist_profile_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "availability_exceptions_psychologist_profile_id_is_active__idx" ON "availability_exceptions"("psychologist_profile_id", "is_active", "starts_at");

-- CreateIndex
CREATE INDEX "availability_exceptions_psychologist_profile_id_ends_at_idx" ON "availability_exceptions"("psychologist_profile_id", "ends_at");

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_psychologist_profile_id_fkey" FOREIGN KEY ("psychologist_profile_id") REFERENCES "psychologist_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
