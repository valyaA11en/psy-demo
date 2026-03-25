ALTER TABLE "reviews"
ADD COLUMN "consultation_id" UUID;

CREATE UNIQUE INDEX "reviews_consultation_id_key" ON "reviews"("consultation_id");

ALTER TABLE "reviews"
ADD CONSTRAINT "reviews_consultation_id_fkey"
FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "reviews"
ADD CONSTRAINT "reviews_psychologist_user_id_fkey"
FOREIGN KEY ("psychologist_user_id") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
