CREATE TABLE "mood_entries" (
    "id" UUID NOT NULL,
    "client_user_id" UUID NOT NULL,
    "recorded_for_date" DATE NOT NULL,
    "mood_score" INTEGER NOT NULL,
    "emotions_json" JSONB,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mood_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mood_entries_client_user_id_recorded_for_date_key"
ON "mood_entries"("client_user_id", "recorded_for_date");

CREATE INDEX "mood_entries_client_user_id_recorded_for_date_idx"
ON "mood_entries"("client_user_id", "recorded_for_date");

CREATE INDEX "mood_entries_recorded_for_date_idx"
ON "mood_entries"("recorded_for_date");

ALTER TABLE "mood_entries"
ADD CONSTRAINT "mood_entries_mood_score_check"
CHECK ("mood_score" >= 1 AND "mood_score" <= 10);

ALTER TABLE "mood_entries"
ADD CONSTRAINT "mood_entries_client_user_id_fkey"
FOREIGN KEY ("client_user_id") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
