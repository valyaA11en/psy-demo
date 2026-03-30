CREATE TYPE "HomeworkTaskStatus" AS ENUM ('assigned', 'completed', 'cancelled');

CREATE TABLE "homework_tasks" (
    "id" UUID NOT NULL,
    "consultation_id" UUID NOT NULL,
    "client_user_id" UUID NOT NULL,
    "psychologist_user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMPTZ(6),
    "status" "HomeworkTaskStatus" NOT NULL DEFAULT 'assigned',
    "client_note" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "homework_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "homework_tasks_client_user_id_status_created_at_idx"
ON "homework_tasks"("client_user_id", "status", "created_at");

CREATE INDEX "homework_tasks_psychologist_user_id_status_created_at_idx"
ON "homework_tasks"("psychologist_user_id", "status", "created_at");

CREATE INDEX "homework_tasks_consultation_id_idx"
ON "homework_tasks"("consultation_id");

ALTER TABLE "homework_tasks"
ADD CONSTRAINT "homework_tasks_consultation_id_fkey"
FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "homework_tasks"
ADD CONSTRAINT "homework_tasks_client_user_id_fkey"
FOREIGN KEY ("client_user_id") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "homework_tasks"
ADD CONSTRAINT "homework_tasks_psychologist_user_id_fkey"
FOREIGN KEY ("psychologist_user_id") REFERENCES "users"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
