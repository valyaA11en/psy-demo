ALTER TABLE "complaints"
ADD COLUMN "consultation_id" UUID;

CREATE UNIQUE INDEX "complaints_consultation_id_author_user_id_key"
ON "complaints"("consultation_id", "author_user_id");

CREATE INDEX "complaints_consultation_id_idx"
ON "complaints"("consultation_id");

ALTER TABLE "complaints"
ADD CONSTRAINT "complaints_consultation_id_fkey"
FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "complaints"
ADD CONSTRAINT "complaints_assigned_admin_id_fkey"
FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
