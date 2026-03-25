CREATE TYPE "FileStatus" AS ENUM ('pending', 'uploaded', 'deleted');

ALTER TABLE "files"
ADD COLUMN "original_filename" VARCHAR(255),
ADD COLUMN "status" "FileStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

ALTER TABLE "files"
ALTER COLUMN "uploaded_at" DROP NOT NULL,
ALTER COLUMN "uploaded_at" DROP DEFAULT;

UPDATE "files"
SET
  "status" = 'uploaded',
  "created_at" = COALESCE("uploaded_at", CURRENT_TIMESTAMP)
WHERE "uploaded_at" IS NOT NULL;

ALTER TABLE "files"
ADD CONSTRAINT "files_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "files_owner_user_id_status_idx" ON "files"("owner_user_id", "status");
