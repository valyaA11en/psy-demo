-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('pending', 'active', 'blocked', 'deleted');

-- CreateEnum
CREATE TYPE "PsychologistApprovalStatus" AS ENUM ('draft', 'pending_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');

-- CreateEnum
CREATE TYPE "AppointmentSlotStatus" AS ENUM ('open', 'held', 'booked', 'blocked', 'cancelled');

-- CreateEnum
CREATE TYPE "AppointmentSlotSource" AS ENUM ('generated', 'manual');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('scheduled', 'completed', 'cancelled_by_client', 'cancelled_by_psychologist', 'cancelled_by_admin');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentEventType" AS ENUM ('created', 'succeeded', 'failed', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "FileVisibility" AS ENUM ('private', 'public');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'pending',
    "last_login_at" TIMESTAMPTZ(6),
    "email_verified_at" TIMESTAMPTZ(6),
    "phone_hash" VARCHAR(255),
    "is_2fa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "client_profiles" (
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(255),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Yekaterinburg',
    "birth_year" INTEGER,
    "preferences_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "psychologist_profiles" (
    "user_id" UUID NOT NULL,
    "public_slug" VARCHAR(128) NOT NULL,
    "first_name" VARCHAR(128) NOT NULL,
    "last_name" VARCHAR(128) NOT NULL,
    "public_title" VARCHAR(255),
    "bio" TEXT,
    "experience_years" INTEGER NOT NULL DEFAULT 0,
    "price_from" INTEGER,
    "price_to" INTEGER,
    "languages_json" JSONB,
    "formats_json" JSONB,
    "approval_status" "PsychologistApprovalStatus" NOT NULL DEFAULT 'draft',
    "rating_avg" DECIMAL(3,2) DEFAULT 0,
    "reviews_count" INTEGER NOT NULL DEFAULT 0,
    "moderated_by_user_id" UUID,
    "moderation_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "psychologist_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "specializations" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "psychologist_specializations" (
    "psychologist_profile_id" UUID NOT NULL,
    "specialization_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "psychologist_specializations_pkey" PRIMARY KEY ("psychologist_profile_id","specialization_id")
);

-- CreateTable
CREATE TABLE "availability_rules" (
    "id" UUID NOT NULL,
    "psychologist_profile_id" UUID NOT NULL,
    "weekday" "Weekday" NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "slot_duration_min" INTEGER NOT NULL,
    "buffer_min" INTEGER NOT NULL DEFAULT 0,
    "timezone" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_slots" (
    "id" UUID NOT NULL,
    "psychologist_profile_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "AppointmentSlotStatus" NOT NULL DEFAULT 'open',
    "source" "AppointmentSlotSource" NOT NULL DEFAULT 'generated',
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointment_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" UUID NOT NULL,
    "client_user_id" UUID NOT NULL,
    "psychologist_user_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'scheduled',
    "meeting_provider" VARCHAR(64),
    "meeting_room_id" VARCHAR(255),
    "meeting_join_token_ref" VARCHAR(255),
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "client_message" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason_code" VARCHAR(64),
    "cancelled_by_user_id" UUID,
    "idempotency_key" VARCHAR(128),
    "rescheduled_from_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_status_history" (
    "id" UUID NOT NULL,
    "consultation_id" UUID NOT NULL,
    "from_status" "ConsultationStatus",
    "to_status" "ConsultationStatus" NOT NULL,
    "changed_by_user_id" UUID,
    "changed_by_role" VARCHAR(64),
    "reason_code" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultation_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "consultation_id" UUID NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "provider_payment_id" VARCHAR(128) NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(8) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" VARCHAR(128),
    "paid_at" TIMESTAMPTZ(6),
    "refunded_at" TIMESTAMPTZ(6),
    "failure_code" VARCHAR(64),
    "failure_message" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "event_type" "PaymentEventType" NOT NULL,
    "payload_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "device_info_hash" VARCHAR(255),
    "ip_hash" VARCHAR(255),
    "user_agent_hash" VARCHAR(255),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "rotated_from_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "consent_type" VARCHAR(128) NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "granted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "source" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_role" VARCHAR(64),
    "action" VARCHAR(128) NOT NULL,
    "entity_type" VARCHAR(128) NOT NULL,
    "entity_id" VARCHAR(128) NOT NULL,
    "ip_hash" VARCHAR(255),
    "user_agent_hash" VARCHAR(255),
    "request_id" VARCHAR(128),
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "client_user_id" UUID NOT NULL,
    "psychologist_user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "status" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "target_user_id" UUID,
    "type" VARCHAR(64) NOT NULL,
    "text" TEXT NOT NULL,
    "status" VARCHAR(64) NOT NULL,
    "assigned_admin_id" UUID,
    "resolution_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "psychologist_profile_id" UUID,
    "bucket" VARCHAR(128) NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "purpose" VARCHAR(128) NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "visibility" "FileVisibility" NOT NULL DEFAULT 'private',
    "checksum" VARCHAR(255),
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "psychologist_profiles_public_slug_key" ON "psychologist_profiles"("public_slug");

-- CreateIndex
CREATE INDEX "psychologist_profiles_approval_status_idx" ON "psychologist_profiles"("approval_status");

-- CreateIndex
CREATE INDEX "psychologist_profiles_price_from_price_to_idx" ON "psychologist_profiles"("price_from", "price_to");

-- CreateIndex
CREATE UNIQUE INDEX "specializations_slug_key" ON "specializations"("slug");

-- CreateIndex
CREATE INDEX "availability_rules_psychologist_profile_id_is_active_weekda_idx" ON "availability_rules"("psychologist_profile_id", "is_active", "weekday");

-- CreateIndex
CREATE INDEX "appointment_slots_psychologist_profile_id_starts_at_idx" ON "appointment_slots"("psychologist_profile_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointment_slots_status_starts_at_idx" ON "appointment_slots"("status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_slots_psychologist_profile_id_starts_at_ends_at_key" ON "appointment_slots"("psychologist_profile_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "consultations_client_user_id_scheduled_at_idx" ON "consultations"("client_user_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "consultations_psychologist_user_id_scheduled_at_idx" ON "consultations"("psychologist_user_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "consultations_slot_id_idx" ON "consultations"("slot_id");

-- CreateIndex
CREATE INDEX "consultations_status_scheduled_at_idx" ON "consultations"("status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "consultations_client_user_id_idempotency_key_key" ON "consultations"("client_user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "consultation_status_history_consultation_id_idx" ON "consultation_status_history"("consultation_id");

-- CreateIndex
CREATE INDEX "consultation_status_history_created_at_idx" ON "consultation_status_history"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_id_key" ON "payments"("provider_payment_id");

-- CreateIndex
CREATE INDEX "payments_consultation_id_idx" ON "payments"("consultation_id");

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_consultation_id_idempotency_key_key" ON "payments"("consultation_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "payment_events_payment_id_created_at_idx" ON "payment_events"("payment_id", "created_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_revoked_at_idx" ON "refresh_tokens"("revoked_at");

-- CreateIndex
CREATE INDEX "consent_records_user_id_consent_type_version_idx" ON "consent_records"("user_id", "consent_type", "version");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "reviews_psychologist_user_id_status_idx" ON "reviews"("psychologist_user_id", "status");

-- CreateIndex
CREATE INDEX "complaints_status_idx" ON "complaints"("status");

-- CreateIndex
CREATE INDEX "complaints_assigned_admin_id_idx" ON "complaints"("assigned_admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_object_key_key" ON "files"("object_key");

-- CreateIndex
CREATE INDEX "files_owner_user_id_idx" ON "files"("owner_user_id");

-- CreateIndex
CREATE INDEX "files_purpose_idx" ON "files"("purpose");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "psychologist_profiles" ADD CONSTRAINT "psychologist_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "psychologist_profiles" ADD CONSTRAINT "psychologist_profiles_moderated_by_user_id_fkey" FOREIGN KEY ("moderated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "psychologist_specializations" ADD CONSTRAINT "psychologist_specializations_psychologist_profile_id_fkey" FOREIGN KEY ("psychologist_profile_id") REFERENCES "psychologist_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "psychologist_specializations" ADD CONSTRAINT "psychologist_specializations_specialization_id_fkey" FOREIGN KEY ("specialization_id") REFERENCES "specializations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_psychologist_profile_id_fkey" FOREIGN KEY ("psychologist_profile_id") REFERENCES "psychologist_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_slots" ADD CONSTRAINT "appointment_slots_psychologist_profile_id_fkey" FOREIGN KEY ("psychologist_profile_id") REFERENCES "psychologist_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_psychologist_user_id_fkey" FOREIGN KEY ("psychologist_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "appointment_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_rescheduled_from_id_fkey" FOREIGN KEY ("rescheduled_from_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_status_history" ADD CONSTRAINT "consultation_status_history_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_status_history" ADD CONSTRAINT "consultation_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_rotated_from_id_fkey" FOREIGN KEY ("rotated_from_id") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_client_user_id_fkey" FOREIGN KEY ("client_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_psychologist_profile_id_fkey" FOREIGN KEY ("psychologist_profile_id") REFERENCES "psychologist_profiles"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

