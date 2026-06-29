


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."sync_inspection_archive_compat_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.archived_at := coalesce(new.archived_at, new.archive_timestamp);
  new.archive_timestamp := coalesce(new.archive_timestamp, new.archived_at);
  new.archived_reference := coalesce(new.archived_reference, new.archive_reference);
  new.archive_reference := coalesce(new.archive_reference, new.archived_reference);
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_inspection_archive_compat_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_inspection_start_lock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_next_due timestamptz;
  v_existing_in_progress uuid;
begin
  if new.status <> 'In Progress' then
    return new;
  end if;

  if new.schedule_id is null then
    return new;
  end if;

  select s.next_due into v_next_due
  from public.inspection_schedules s
  where s.id = new.schedule_id
  limit 1;

  if v_next_due is not null and now() < v_next_due then
    raise exception 'LOCKED_UNTIL:%', v_next_due using errcode = 'P0001';
  end if;

  select i.id into v_existing_in_progress
  from public.inspections i
  where i.schedule_id = new.schedule_id
    and i.status = 'In Progress'
    and i.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  limit 1;

  if v_existing_in_progress is not null then
    raise exception 'DUPLICATE_IN_PROGRESS:%', v_existing_in_progress using errcode = 'P0001';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_inspection_start_lock"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."archive_delivery_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "archive_id" "uuid",
    "pdf_generated" boolean DEFAULT false NOT NULL,
    "email_sent" boolean DEFAULT false NOT NULL,
    "archived" boolean DEFAULT false NOT NULL,
    "recipient_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" NOT NULL,
    "failure_reason" "text",
    "retry_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archive_status" "text",
    "archive_last_error" "text",
    "archive_timestamp" timestamp with time zone,
    "archive_reference" "text",
    CONSTRAINT "archive_delivery_logs_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'failed'::"text", 'retrying'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."archive_delivery_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."archive_jobs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "inspection_id" "uuid",
    "archive_id" "uuid",
    "archive_delivery_log_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "archive_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "archive_last_error" "text",
    "archive_timestamp" timestamp with time zone,
    "archive_reference" "text",
    "retry_count" integer DEFAULT 0 NOT NULL,
    "next_retry_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "archive_jobs_archive_status_check" CHECK (("archive_status" = ANY (ARRAY['pending'::"text", 'archived'::"text", 'failed'::"text"]))),
    CONSTRAINT "archive_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'retrying'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."archive_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checklist_template_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "question" "text" NOT NULL,
    "question_type" "text" DEFAULT 'pass_fail'::"text" NOT NULL,
    "required" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inspection_template_items_question_type_check" CHECK (("question_type" = ANY (ARRAY['pass_fail'::"text", 'yes_no'::"text", 'text'::"text", 'number'::"text", 'photo'::"text", 'signature'::"text"])))
);


ALTER TABLE "public"."checklist_template_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."checklist_template_items" IS 'Ordered checklist items belonging to inspection templates';



COMMENT ON COLUMN "public"."checklist_template_items"."question_type" IS 'Question input type, default pass_fail';



CREATE TABLE IF NOT EXISTS "public"."checklist_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."checklist_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."checklist_templates" IS 'Reusable inspection templates that can be assigned to machines';



CREATE TABLE IF NOT EXISTS "public"."company_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "company_name" "text" DEFAULT 'MGMT Inspect'::"text" NOT NULL,
    "logo_url" "text",
    "address" "text",
    "telephone" "text",
    "email" "text",
    "website" "text",
    "report_footer" "text",
    "report_primary_color" "text" DEFAULT '#0f766e'::"text" NOT NULL,
    "report_accent_color" "text" DEFAULT '#0f172a'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "smtp_config" "jsonb",
    "smtp_updated_at" timestamp with time zone,
    CONSTRAINT "company_settings_singleton" CHECK (true)
);


ALTER TABLE "public"."company_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."company_settings"."smtp_config" IS 'Encrypted SMTP configuration payload (password encrypted at application layer)';



COMMENT ON COLUMN "public"."company_settings"."smtp_updated_at" IS 'Timestamp when SMTP config was last updated';



CREATE TABLE IF NOT EXISTS "public"."defects" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "machine_id" "uuid" NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "inspection_item_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "severity" "text" DEFAULT 'Medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'Open'::"text" NOT NULL,
    "assigned_to" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolved_by" "uuid",
    "resolution_notes" "text",
    CONSTRAINT "defects_severity_check" CHECK (("severity" = ANY (ARRAY['Low'::"text", 'Medium'::"text", 'High'::"text", 'Critical'::"text"]))),
    CONSTRAINT "defects_status_check" CHECK (("status" = ANY (ARRAY['Open'::"text", 'In Progress'::"text", 'Awaiting Parts'::"text", 'Resolved'::"text", 'Closed'::"text"])))
);


ALTER TABLE "public"."defects" OWNER TO "postgres";


COMMENT ON TABLE "public"."defects" IS 'Defects raised from failed inspection items';



COMMENT ON COLUMN "public"."defects"."inspection_item_id" IS 'Inspection snapshot item that produced this defect';



COMMENT ON COLUMN "public"."defects"."resolution_notes" IS 'Final notes captured when resolving or closing defect';



CREATE TABLE IF NOT EXISTS "public"."email_distribution_recipients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "recipient_type" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "delivery_scope" "text" DEFAULT 'all_inspections'::"text" NOT NULL,
    "department_filter" "text",
    "machine_filter" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_distribution_recipients_scope_check" CHECK (("delivery_scope" = ANY (ARRAY['all_inspections'::"text", 'passed_inspections'::"text", 'failed_inspections'::"text", 'failed_only'::"text", 'defects_only'::"text"]))),
    CONSTRAINT "email_distribution_recipients_type_check" CHECK (("recipient_type" = ANY (ARRAY['to'::"text", 'cc'::"text", 'bcc'::"text"])))
);


ALTER TABLE "public"."email_distribution_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_recipients" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "recipient_type" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "delivery_scope" "text" DEFAULT 'all_inspections'::"text" NOT NULL,
    "department_filter" "text",
    "machine_filter" "uuid",
    "source_recipient_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "email_recipients_scope_check" CHECK (("delivery_scope" = ANY (ARRAY['all_inspections'::"text", 'passed_inspections'::"text", 'failed_inspections'::"text", 'failed_only'::"text", 'defects_only'::"text"]))),
    CONSTRAINT "email_recipients_type_check" CHECK (("recipient_type" = ANY (ARRAY['to'::"text", 'cc'::"text", 'bcc'::"text"])))
);


ALTER TABLE "public"."email_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body" "text" NOT NULL,
    "signature" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_archives" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "content_type" "text" DEFAULT 'application/pdf'::"text" NOT NULL,
    "pdf_base64" "text" NOT NULL,
    "checksum" "text",
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "generated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archive_reference" "text"
);


ALTER TABLE "public"."inspection_archives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_drafts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "draft_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "current_question_index" integer DEFAULT 0 NOT NULL,
    "scroll_position" integer DEFAULT 0 NOT NULL,
    "progress_percent" numeric(5,2) DEFAULT 0 NOT NULL,
    "auto_saved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inspection_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_email_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "archive_id" "uuid",
    "recipient_email" "text" NOT NULL,
    "recipient_type" "text" DEFAULT 'to'::"text" NOT NULL,
    "subject" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "error_message" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inspection_email_history_recipient_type_check" CHECK (("recipient_type" = ANY (ARRAY['to'::"text", 'cc'::"text", 'bcc'::"text"]))),
    CONSTRAINT "inspection_email_history_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."inspection_email_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inspection_engine_events" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "event_type" "text" NOT NULL,
    "inspection_id" "uuid",
    "machine_id" "uuid",
    "schedule_id" "uuid",
    "user_id" "uuid",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inspection_engine_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."inspection_engine_events" IS 'Runtime instrumentation for inspection engine starts, denials, duplicates, completions and cancellations';



COMMENT ON COLUMN "public"."inspection_engine_events"."event_type" IS 'Event type: failed_start|duplicate_start_blocked|start_success|completion_success|cancelled|lock_denial';



CREATE TABLE IF NOT EXISTS "public"."inspection_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "original_template_item_id" "uuid",
    "display_order" integer NOT NULL,
    "question" "text" NOT NULL,
    "question_type" "text" DEFAULT 'pass_fail'::"text" NOT NULL,
    "required" boolean DEFAULT true NOT NULL,
    "answer" "text",
    "comments" "text",
    "completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inspection_items_question_type_check" CHECK (("question_type" = ANY (ARRAY['pass_fail'::"text", 'yes_no'::"text", 'text'::"text", 'number'::"text", 'photo'::"text", 'signature'::"text"])))
);


ALTER TABLE "public"."inspection_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."inspection_items" IS 'Snapshot of inspection questions copied at inspection start';



CREATE TABLE IF NOT EXISTS "public"."inspection_schedules" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "machine_template_id" "uuid" NOT NULL,
    "frequency" "text" NOT NULL,
    "interval_value" integer DEFAULT 1 NOT NULL,
    "custom_cron" "text",
    "next_due" timestamp with time zone NOT NULL,
    "last_generated" timestamp with time zone,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inspection_schedules_frequency_check" CHECK (("frequency" = ANY (ARRAY['Daily'::"text", 'Weekly'::"text", 'Fortnightly'::"text", 'Monthly'::"text", 'Quarterly'::"text", 'Six Monthly'::"text", 'Annually'::"text", 'Custom'::"text"]))),
    CONSTRAINT "inspection_schedules_interval_value_check" CHECK (("interval_value" >= 1))
);


ALTER TABLE "public"."inspection_schedules" OWNER TO "postgres";


COMMENT ON TABLE "public"."inspection_schedules" IS 'Recurring inspection schedule definitions per machine-template assignment';



COMMENT ON COLUMN "public"."inspection_schedules"."machine_template_id" IS 'Machine/template assignment this schedule controls';



CREATE TABLE IF NOT EXISTS "public"."inspections" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "machine_id" "uuid" NOT NULL,
    "operator_id" "uuid" NOT NULL,
    "operator_name" "text" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"(),
    "checklist" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_id" "uuid",
    "template_name" "text",
    "template_version" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'Completed'::"text" NOT NULL,
    "started_by" "uuid",
    "started_at" timestamp with time zone,
    "schedule_id" "uuid",
    "generation_key" "text",
    "due_at" timestamp with time zone,
    "is_overdue" boolean DEFAULT false NOT NULL,
    "completion_source" "text",
    "archive_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "archived_at" timestamp with time zone,
    "archived_reference" "text",
    "archive_retry_count" integer DEFAULT 0 NOT NULL,
    "archive_last_error" "text",
    "archive_last_attempt_at" timestamp with time zone,
    "archive_timestamp" timestamp with time zone,
    "archive_reference" "text",
    CONSTRAINT "inspections_archive_status_check" CHECK (("archive_status" = ANY (ARRAY['pending'::"text", 'archived'::"text", 'failed'::"text"]))),
    CONSTRAINT "inspections_status_check" CHECK (("status" = ANY (ARRAY['In Progress'::"text", 'Completed'::"text", 'Cancelled'::"text"])))
);


ALTER TABLE "public"."inspections" OWNER TO "postgres";


COMMENT ON TABLE "public"."inspections" IS 'Records of machine inspections completed by operators';



COMMENT ON COLUMN "public"."inspections"."checklist" IS 'Array of inspection items with pass/fail status, fault descriptions, and severity stored as JSONB';



COMMENT ON COLUMN "public"."inspections"."template_name" IS 'Template name snapshot captured when the inspection starts';



COMMENT ON COLUMN "public"."inspections"."template_version" IS 'Template version snapshot captured when the inspection starts';



COMMENT ON COLUMN "public"."inspections"."generation_key" IS 'Idempotency key for scheduler-generated inspections';



COMMENT ON COLUMN "public"."inspections"."due_at" IS 'Scheduled due datetime for this inspection snapshot';



COMMENT ON COLUMN "public"."inspections"."is_overdue" IS 'True when inspection due_at has passed and status is still In Progress';



CREATE TABLE IF NOT EXISTS "public"."machine_inspection_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "machine_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "inspection_frequency" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "machine_inspection_templates_frequency_check" CHECK (("inspection_frequency" = ANY (ARRAY['Daily'::"text", 'Weekly'::"text", 'Fortnightly'::"text", 'Monthly'::"text", 'Quarterly'::"text", 'Six Monthly'::"text", 'Annually'::"text", 'Custom'::"text"])))
);


ALTER TABLE "public"."machine_inspection_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."machine_inspection_templates" IS 'Join table linking machines to multiple inspection templates with schedule metadata';



COMMENT ON COLUMN "public"."machine_inspection_templates"."inspection_frequency" IS 'Inspection cadence for this machine-template assignment';



CREATE TABLE IF NOT EXISTS "public"."machine_types" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."machine_types" OWNER TO "postgres";


COMMENT ON TABLE "public"."machine_types" IS 'Types/categories of machines for classification';



CREATE TABLE IF NOT EXISTS "public"."machines" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "code" "text",
    "name" "text" NOT NULL,
    "area" "text" NOT NULL,
    "type" "text",
    "manufacturer" "text",
    "model" "text",
    "serial_number" "text",
    "installation_date" "date",
    "last_inspection" "date",
    "inspection_deadline" "text" DEFAULT '09:00'::"text" NOT NULL,
    "assigned_user" "text",
    "status" "text" DEFAULT 'Not Started'::"text" NOT NULL,
    "notes" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "template_id" "uuid",
    "inspection_frequency" "text",
    "reminder_days_before_due" integer,
    "grace_period_days" integer,
    "auto_generate_inspections" boolean,
    "custom_interval_value" integer,
    "custom_interval_unit" "text",
    "grace_period" integer,
    "auto_generate_inspection" boolean
);


ALTER TABLE "public"."machines" OWNER TO "postgres";


COMMENT ON TABLE "public"."machines" IS 'Equipment/machines requiring regular inspections';



COMMENT ON COLUMN "public"."machines"."inspection_deadline" IS 'Daily deadline time in HH:MM format (e.g., 09:00)';



COMMENT ON COLUMN "public"."machines"."assigned_user" IS 'Username of operator assigned to this machine, or NULL if not assigned';



COMMENT ON COLUMN "public"."machines"."status" IS 'Current status: Not Started (awaiting inspection), In Progress (under inspection), Completed (inspection done), Overdue (past deadline)';



COMMENT ON COLUMN "public"."machines"."template_id" IS 'Optional inspection template assigned to this machine';



COMMENT ON COLUMN "public"."machines"."inspection_frequency" IS 'Scheduling cadence for the machine';



COMMENT ON COLUMN "public"."machines"."reminder_days_before_due" IS 'Days before due date to send a reminder';



COMMENT ON COLUMN "public"."machines"."grace_period_days" IS 'Days after due date before the machine is considered overdue';



COMMENT ON COLUMN "public"."machines"."auto_generate_inspections" IS 'Whether inspections should be generated automatically';



COMMENT ON COLUMN "public"."machines"."custom_interval_value" IS 'Interval value used when the inspection frequency is custom';



COMMENT ON COLUMN "public"."machines"."custom_interval_unit" IS 'Interval unit used when the inspection frequency is custom';



COMMENT ON COLUMN "public"."machines"."grace_period" IS 'Days after due date before the machine is considered overdue';



COMMENT ON COLUMN "public"."machines"."auto_generate_inspection" IS 'Whether inspections should be generated automatically';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text",
    "type" "text" DEFAULT 'info'::"text" NOT NULL,
    "related_machine_id" "uuid",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."notifications" IS 'User notifications for inspection reminders and alerts';



COMMENT ON COLUMN "public"."notifications"."type" IS 'Type: info (general), warning (action needed), error (problem), success (completed)';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "role" "text" DEFAULT 'operator'::"text" NOT NULL,
    "work_area" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'User profiles linked to auth.users. Profiles table is source of truth.';



COMMENT ON COLUMN "public"."profiles"."role" IS 'Role: super_admin (built-in admin), admin (admin user), operator (standard user)';



COMMENT ON COLUMN "public"."profiles"."active" IS 'Whether the user account is enabled/disabled';



CREATE TABLE IF NOT EXISTS "public"."reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "machine_id" "uuid" NOT NULL,
    "report_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "summary" "text",
    "findings" "text",
    "recommendations" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reports" OWNER TO "postgres";


COMMENT ON TABLE "public"."reports" IS 'Generated reports from inspections for management review';



CREATE TABLE IF NOT EXISTS "public"."retention_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "retention_days" integer DEFAULT 90 NOT NULL,
    "use_custom" boolean DEFAULT false NOT NULL,
    "custom_days" integer,
    "max_delivery_retries" integer DEFAULT 3 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "retention_settings_custom_days_check" CHECK ((("custom_days" IS NULL) OR ("custom_days" >= 1))),
    CONSTRAINT "retention_settings_days_check" CHECK ((("retention_days" = ANY (ARRAY[30, 60, 90, 180])) OR "use_custom")),
    CONSTRAINT "retention_settings_retries_check" CHECK (("max_delivery_retries" >= 0))
);


ALTER TABLE "public"."retention_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scheduled_cleanup_runs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "scheduled_cleanup_runs_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'success'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."scheduled_cleanup_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "role" "text" DEFAULT 'operator'::"text" NOT NULL,
    "work_area" "text",
    "phone" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON TABLE "public"."users" IS 'Application-level user mirror table. Source of truth is profiles table. Kept for backward compatibility.';



CREATE TABLE IF NOT EXISTS "public"."work_areas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."work_areas" OWNER TO "postgres";


COMMENT ON TABLE "public"."work_areas" IS 'Physical or logical areas/zones where machines are located';



ALTER TABLE ONLY "public"."archive_delivery_logs"
    ADD CONSTRAINT "archive_delivery_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."archive_jobs"
    ADD CONSTRAINT "archive_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checklist_template_items"
    ADD CONSTRAINT "checklist_template_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checklist_templates"
    ADD CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."defects"
    ADD CONSTRAINT "defects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."defects"
    ADD CONSTRAINT "defects_unique_inspection_item" UNIQUE ("inspection_item_id");



ALTER TABLE ONLY "public"."email_distribution_recipients"
    ADD CONSTRAINT "email_distribution_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_recipients"
    ADD CONSTRAINT "email_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_archives"
    ADD CONSTRAINT "inspection_archives_inspection_id_key" UNIQUE ("inspection_id");



ALTER TABLE ONLY "public"."inspection_archives"
    ADD CONSTRAINT "inspection_archives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_drafts"
    ADD CONSTRAINT "inspection_drafts_inspection_id_user_id_key" UNIQUE ("inspection_id", "user_id");



ALTER TABLE ONLY "public"."inspection_drafts"
    ADD CONSTRAINT "inspection_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_email_history"
    ADD CONSTRAINT "inspection_email_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_engine_events"
    ADD CONSTRAINT "inspection_engine_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_items"
    ADD CONSTRAINT "inspection_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspection_schedules"
    ADD CONSTRAINT "inspection_schedules_machine_template_unique" UNIQUE ("machine_template_id");



ALTER TABLE ONLY "public"."inspection_schedules"
    ADD CONSTRAINT "inspection_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."machine_inspection_templates"
    ADD CONSTRAINT "machine_inspection_templates_machine_template_unique" UNIQUE ("machine_id", "template_id");



ALTER TABLE ONLY "public"."machine_inspection_templates"
    ADD CONSTRAINT "machine_inspection_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."machine_types"
    ADD CONSTRAINT "machine_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."machine_types"
    ADD CONSTRAINT "machine_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."machines"
    ADD CONSTRAINT "machines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retention_settings"
    ADD CONSTRAINT "retention_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_cleanup_runs"
    ADD CONSTRAINT "scheduled_cleanup_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_areas"
    ADD CONSTRAINT "work_areas_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."work_areas"
    ADD CONSTRAINT "work_areas_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_archive_delivery_logs_archive_reference" ON "public"."archive_delivery_logs" USING "btree" ("archive_reference");



CREATE INDEX "idx_archive_delivery_logs_archive_timestamp" ON "public"."archive_delivery_logs" USING "btree" ("archive_timestamp");



CREATE INDEX "idx_archive_delivery_logs_inspection_id" ON "public"."archive_delivery_logs" USING "btree" ("inspection_id", "created_at" DESC);



CREATE INDEX "idx_archive_delivery_logs_status" ON "public"."archive_delivery_logs" USING "btree" ("status", "retry_count", "created_at");



CREATE INDEX "idx_archive_jobs_archive_reference" ON "public"."archive_jobs" USING "btree" ("archive_reference");



CREATE INDEX "idx_archive_jobs_archive_timestamp" ON "public"."archive_jobs" USING "btree" ("archive_timestamp");



CREATE INDEX "idx_archive_jobs_inspection" ON "public"."archive_jobs" USING "btree" ("inspection_id", "created_at" DESC);



CREATE INDEX "idx_archive_jobs_next_retry_at" ON "public"."archive_jobs" USING "btree" ("next_retry_at");



CREATE INDEX "idx_archive_jobs_status" ON "public"."archive_jobs" USING "btree" ("status", "archive_status", "retry_count");



CREATE UNIQUE INDEX "idx_company_settings_singleton" ON "public"."company_settings" USING "btree" ((true));



CREATE INDEX "idx_defects_assigned_to" ON "public"."defects" USING "btree" ("assigned_to");



CREATE INDEX "idx_defects_created_at" ON "public"."defects" USING "btree" ("created_at");



CREATE INDEX "idx_defects_inspection_id" ON "public"."defects" USING "btree" ("inspection_id");



CREATE INDEX "idx_defects_machine_id" ON "public"."defects" USING "btree" ("machine_id");



CREATE INDEX "idx_defects_severity" ON "public"."defects" USING "btree" ("severity");



CREATE INDEX "idx_defects_status" ON "public"."defects" USING "btree" ("status");



CREATE INDEX "idx_email_distribution_recipients_delivery_scope" ON "public"."email_distribution_recipients" USING "btree" ("delivery_scope");



CREATE INDEX "idx_email_distribution_recipients_department" ON "public"."email_distribution_recipients" USING "btree" ("department_filter");



CREATE INDEX "idx_email_distribution_recipients_enabled" ON "public"."email_distribution_recipients" USING "btree" ("enabled", "recipient_type");



CREATE INDEX "idx_email_distribution_recipients_machine" ON "public"."email_distribution_recipients" USING "btree" ("machine_filter");



CREATE INDEX "idx_email_recipients_delivery_scope" ON "public"."email_recipients" USING "btree" ("delivery_scope");



CREATE INDEX "idx_email_recipients_enabled" ON "public"."email_recipients" USING "btree" ("enabled", "recipient_type");



CREATE INDEX "idx_email_recipients_machine_filter" ON "public"."email_recipients" USING "btree" ("machine_filter");



CREATE INDEX "idx_email_recipients_source_recipient" ON "public"."email_recipients" USING "btree" ("source_recipient_id");



CREATE UNIQUE INDEX "idx_inspection_archives_archive_reference" ON "public"."inspection_archives" USING "btree" ("archive_reference") WHERE ("archive_reference" IS NOT NULL);



CREATE INDEX "idx_inspection_archives_generated_at" ON "public"."inspection_archives" USING "btree" ("generated_at");



CREATE UNIQUE INDEX "idx_inspection_archives_inspection_id" ON "public"."inspection_archives" USING "btree" ("inspection_id") WHERE ("inspection_id" IS NOT NULL);



CREATE INDEX "idx_inspection_drafts_inspection_id" ON "public"."inspection_drafts" USING "btree" ("inspection_id");



CREATE INDEX "idx_inspection_drafts_updated_at" ON "public"."inspection_drafts" USING "btree" ("updated_at");



CREATE INDEX "idx_inspection_drafts_user_id" ON "public"."inspection_drafts" USING "btree" ("user_id");



CREATE INDEX "idx_inspection_email_history_inspection" ON "public"."inspection_email_history" USING "btree" ("inspection_id", "created_at" DESC);



CREATE INDEX "idx_inspection_email_history_recipient" ON "public"."inspection_email_history" USING "btree" ("recipient_email");



CREATE INDEX "idx_inspection_email_history_status" ON "public"."inspection_email_history" USING "btree" ("status", "sent_at");



CREATE INDEX "idx_inspection_engine_events_machine_created" ON "public"."inspection_engine_events" USING "btree" ("machine_id", "created_at" DESC);



CREATE INDEX "idx_inspection_engine_events_type_created" ON "public"."inspection_engine_events" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "idx_inspection_items_display_order" ON "public"."inspection_items" USING "btree" ("inspection_id", "display_order");



CREATE INDEX "idx_inspection_items_inspection_id" ON "public"."inspection_items" USING "btree" ("inspection_id");



CREATE INDEX "idx_inspection_schedules_active_next_due" ON "public"."inspection_schedules" USING "btree" ("active", "next_due");



CREATE INDEX "idx_inspection_schedules_machine_template_id" ON "public"."inspection_schedules" USING "btree" ("machine_template_id");



CREATE INDEX "idx_inspection_template_items_display_order" ON "public"."checklist_template_items" USING "btree" ("template_id", "display_order");



CREATE INDEX "idx_inspection_template_items_template_id" ON "public"."checklist_template_items" USING "btree" ("template_id");



CREATE INDEX "idx_inspections_archive_reference" ON "public"."inspections" USING "btree" ("archive_reference");



CREATE INDEX "idx_inspections_archive_status" ON "public"."inspections" USING "btree" ("archive_status", "archive_retry_count", "completed_at");



CREATE INDEX "idx_inspections_archive_timestamp" ON "public"."inspections" USING "btree" ("archive_timestamp");



CREATE INDEX "idx_inspections_archived_at" ON "public"."inspections" USING "btree" ("archived_at");



CREATE INDEX "idx_inspections_completed_at" ON "public"."inspections" USING "btree" ("completed_at");



CREATE INDEX "idx_inspections_due_at" ON "public"."inspections" USING "btree" ("due_at");



CREATE UNIQUE INDEX "idx_inspections_generation_key_unique" ON "public"."inspections" USING "btree" ("generation_key") WHERE ("generation_key" IS NOT NULL);



CREATE INDEX "idx_inspections_is_overdue" ON "public"."inspections" USING "btree" ("is_overdue");



CREATE INDEX "idx_inspections_machine_id" ON "public"."inspections" USING "btree" ("machine_id");



CREATE INDEX "idx_inspections_operator_id" ON "public"."inspections" USING "btree" ("operator_id");



CREATE INDEX "idx_inspections_schedule_status" ON "public"."inspections" USING "btree" ("schedule_id", "status", "started_at");



CREATE INDEX "idx_inspections_started_at" ON "public"."inspections" USING "btree" ("started_at");



CREATE INDEX "idx_inspections_status" ON "public"."inspections" USING "btree" ("status");



CREATE INDEX "idx_machine_inspection_templates_active" ON "public"."machine_inspection_templates" USING "btree" ("active");



CREATE INDEX "idx_machine_inspection_templates_machine_id" ON "public"."machine_inspection_templates" USING "btree" ("machine_id");



CREATE INDEX "idx_machine_inspection_templates_template_id" ON "public"."machine_inspection_templates" USING "btree" ("template_id");



CREATE INDEX "idx_machines_active" ON "public"."machines" USING "btree" ("active");



CREATE INDEX "idx_machines_area" ON "public"."machines" USING "btree" ("area");



CREATE INDEX "idx_machines_assigned_user" ON "public"."machines" USING "btree" ("assigned_user");



CREATE INDEX "idx_machines_code" ON "public"."machines" USING "btree" ("code");



CREATE INDEX "idx_machines_status" ON "public"."machines" USING "btree" ("status");



CREATE INDEX "idx_machines_template_id" ON "public"."machines" USING "btree" ("template_id");



CREATE INDEX "idx_machines_type" ON "public"."machines" USING "btree" ("type");



CREATE INDEX "idx_notifications_created_at" ON "public"."notifications" USING "btree" ("created_at");



CREATE INDEX "idx_notifications_read" ON "public"."notifications" USING "btree" ("read");



CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_active" ON "public"."profiles" USING "btree" ("active");



CREATE INDEX "idx_profiles_email" ON "public"."profiles" USING "btree" ("email");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_profiles_user_id" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_username" ON "public"."profiles" USING "btree" ("username");



CREATE INDEX "idx_reports_inspection_id" ON "public"."reports" USING "btree" ("inspection_id");



CREATE INDEX "idx_reports_machine_id" ON "public"."reports" USING "btree" ("machine_id");



CREATE INDEX "idx_reports_report_date" ON "public"."reports" USING "btree" ("report_date");



CREATE UNIQUE INDEX "idx_retention_settings_singleton" ON "public"."retention_settings" USING "btree" ((true));



CREATE INDEX "idx_scheduled_cleanup_runs_started_at" ON "public"."scheduled_cleanup_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_users_active" ON "public"."users" USING "btree" ("active");



CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email");



CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");



CREATE OR REPLACE TRIGGER "sync_inspection_archive_compat_columns" BEFORE INSERT OR UPDATE ON "public"."inspections" FOR EACH ROW EXECUTE FUNCTION "public"."sync_inspection_archive_compat_columns"();



CREATE OR REPLACE TRIGGER "update_archive_jobs_updated_at" BEFORE UPDATE ON "public"."archive_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_company_settings_updated_at" BEFORE UPDATE ON "public"."company_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_defects_updated_at" BEFORE UPDATE ON "public"."defects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_email_distribution_recipients_updated_at" BEFORE UPDATE ON "public"."email_distribution_recipients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_email_recipients_updated_at" BEFORE UPDATE ON "public"."email_recipients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_email_templates_updated_at" BEFORE UPDATE ON "public"."email_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_inspection_drafts_updated_at" BEFORE UPDATE ON "public"."inspection_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_inspection_email_history_updated_at" BEFORE UPDATE ON "public"."inspection_email_history" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_inspection_schedules_updated_at" BEFORE UPDATE ON "public"."inspection_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_inspection_templates_updated_at" BEFORE UPDATE ON "public"."checklist_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_inspections_updated_at" BEFORE UPDATE ON "public"."inspections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_machine_types_updated_at" BEFORE UPDATE ON "public"."machine_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_machines_updated_at" BEFORE UPDATE ON "public"."machines" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_notifications_updated_at" BEFORE UPDATE ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_reports_updated_at" BEFORE UPDATE ON "public"."reports" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_retention_settings_updated_at" BEFORE UPDATE ON "public"."retention_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_scheduled_cleanup_runs_updated_at" BEFORE UPDATE ON "public"."scheduled_cleanup_runs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_work_areas_updated_at" BEFORE UPDATE ON "public"."work_areas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "validate_inspection_start_lock_trigger" BEFORE INSERT OR UPDATE ON "public"."inspections" FOR EACH ROW EXECUTE FUNCTION "public"."validate_inspection_start_lock"();



ALTER TABLE ONLY "public"."archive_delivery_logs"
    ADD CONSTRAINT "archive_delivery_logs_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "public"."inspection_archives"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."archive_delivery_logs"
    ADD CONSTRAINT "archive_delivery_logs_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."archive_jobs"
    ADD CONSTRAINT "archive_jobs_archive_delivery_log_id_fkey" FOREIGN KEY ("archive_delivery_log_id") REFERENCES "public"."archive_delivery_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."archive_jobs"
    ADD CONSTRAINT "archive_jobs_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "public"."inspection_archives"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."archive_jobs"
    ADD CONSTRAINT "archive_jobs_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checklist_template_items"
    ADD CONSTRAINT "checklist_template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."defects"
    ADD CONSTRAINT "defects_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."defects"
    ADD CONSTRAINT "defects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."defects"
    ADD CONSTRAINT "defects_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."defects"
    ADD CONSTRAINT "defects_inspection_item_id_fkey" FOREIGN KEY ("inspection_item_id") REFERENCES "public"."inspection_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."defects"
    ADD CONSTRAINT "defects_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."defects"
    ADD CONSTRAINT "defects_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_distribution_recipients"
    ADD CONSTRAINT "email_distribution_recipients_machine_filter_fkey" FOREIGN KEY ("machine_filter") REFERENCES "public"."machines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_recipients"
    ADD CONSTRAINT "email_recipients_machine_filter_fkey" FOREIGN KEY ("machine_filter") REFERENCES "public"."machines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_recipients"
    ADD CONSTRAINT "email_recipients_source_recipient_id_fkey" FOREIGN KEY ("source_recipient_id") REFERENCES "public"."email_distribution_recipients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_archives"
    ADD CONSTRAINT "inspection_archives_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_archives"
    ADD CONSTRAINT "inspection_archives_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_drafts"
    ADD CONSTRAINT "inspection_drafts_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_drafts"
    ADD CONSTRAINT "inspection_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_email_history"
    ADD CONSTRAINT "inspection_email_history_archive_id_fkey" FOREIGN KEY ("archive_id") REFERENCES "public"."inspection_archives"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_email_history"
    ADD CONSTRAINT "inspection_email_history_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_email_history"
    ADD CONSTRAINT "inspection_email_history_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_engine_events"
    ADD CONSTRAINT "inspection_engine_events_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_engine_events"
    ADD CONSTRAINT "inspection_engine_events_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_engine_events"
    ADD CONSTRAINT "inspection_engine_events_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."inspection_schedules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_engine_events"
    ADD CONSTRAINT "inspection_engine_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspection_items"
    ADD CONSTRAINT "inspection_items_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspection_schedules"
    ADD CONSTRAINT "inspection_schedules_machine_template_id_fkey" FOREIGN KEY ("machine_template_id") REFERENCES "public"."machine_inspection_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."inspection_schedules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."machine_inspection_templates"
    ADD CONSTRAINT "machine_inspection_templates_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."machine_inspection_templates"
    ADD CONSTRAINT "machine_inspection_templates_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."machines"
    ADD CONSTRAINT "machines_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_related_machine_id_fkey" FOREIGN KEY ("related_machine_id") REFERENCES "public"."machines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can read all machines" ON "public"."machines" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND (("profiles"."role" = 'admin'::"text") OR ("profiles"."role" = 'super_admin'::"text"))))));



CREATE POLICY "Admins can view all inspections" ON "public"."inspections" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "Admins can view all reports" ON "public"."reports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."user_id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['admin'::"text", 'super_admin'::"text"]))))));



CREATE POLICY "Anyone can look up profiles for login" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can manage own drafts" ON "public"."inspection_drafts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can read all users" ON "public"."users" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read archive delivery logs" ON "public"."archive_delivery_logs" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read archive jobs" ON "public"."archive_jobs" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read cleanup runs" ON "public"."scheduled_cleanup_runs" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read company settings" ON "public"."company_settings" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read defects" ON "public"."defects" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read distribution recipients" ON "public"."email_distribution_recipients" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read email recipients" ON "public"."email_recipients" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read email templates" ON "public"."email_templates" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read inspection archives" ON "public"."inspection_archives" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read inspection email history" ON "public"."inspection_email_history" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read inspection items" ON "public"."inspection_items" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read inspection schedules" ON "public"."inspection_schedules" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read inspection template items" ON "public"."checklist_template_items" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read inspection templates" ON "public"."checklist_templates" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read machine inspection templates" ON "public"."machine_inspection_templates" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read machine types" ON "public"."machine_types" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read retention settings" ON "public"."retention_settings" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Authenticated users can read work areas" ON "public"."work_areas" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Operators can read assigned machines" ON "public"."machines" FOR SELECT USING (("assigned_user" = ( SELECT "profiles"."username"
   FROM "public"."profiles"
  WHERE ("profiles"."user_id" = "auth"."uid"()))));



CREATE POLICY "Service role can manage archive delivery logs" ON "public"."archive_delivery_logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage archive jobs" ON "public"."archive_jobs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage cleanup runs" ON "public"."scheduled_cleanup_runs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage company settings" ON "public"."company_settings" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage defects" ON "public"."defects" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage distribution recipients" ON "public"."email_distribution_recipients" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage email recipients" ON "public"."email_recipients" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage email templates" ON "public"."email_templates" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage inspection archives" ON "public"."inspection_archives" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage inspection drafts" ON "public"."inspection_drafts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage inspection email history" ON "public"."inspection_email_history" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage inspection items" ON "public"."inspection_items" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage inspection schedules" ON "public"."inspection_schedules" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage inspection template items" ON "public"."checklist_template_items" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage inspection templates" ON "public"."checklist_templates" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage inspections" ON "public"."inspections" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage machine inspection templates" ON "public"."machine_inspection_templates" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage machine types" ON "public"."machine_types" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage machines" ON "public"."machines" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage notifications" ON "public"."notifications" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage profiles" ON "public"."profiles" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage reports" ON "public"."reports" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage retention settings" ON "public"."retention_settings" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage users" ON "public"."users" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage work areas" ON "public"."work_areas" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view inspections they performed" ON "public"."inspections" FOR SELECT USING (("auth"."uid"() = "operator_id"));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view reports for their inspections" ON "public"."reports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."inspections" "i"
  WHERE (("i"."id" = "reports"."inspection_id") AND ("i"."operator_id" = "auth"."uid"())))));



ALTER TABLE "public"."archive_delivery_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."archive_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checklist_template_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checklist_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."defects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_distribution_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_archives" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_email_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_engine_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspection_schedules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inspections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."machine_inspection_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."machine_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."machines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."retention_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."scheduled_cleanup_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_areas" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bytea_to_text"("data" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "postgres";
GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "anon";
GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http"("request" "public"."http_request") TO "service_role";



GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_delete"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_get"("uri" character varying, "data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_head"("uri" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_header"("field" character varying, "value" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "postgres";
GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "anon";
GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_list_curlopt"() TO "service_role";



GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_patch"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_post"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_put"("uri" character varying, "content" character varying, "content_type" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "postgres";
GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "anon";
GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_reset_curlopt"() TO "service_role";



GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."http_set_curlopt"("curlopt" character varying, "value" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_inspection_archive_compat_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_inspection_archive_compat_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_inspection_archive_compat_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."text_to_bytea"("data" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "postgres";
GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "anon";
GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "authenticated";
GRANT ALL ON FUNCTION "public"."urlencode"("string" "bytea") TO "service_role";



GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "postgres";
GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."urlencode"("data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "postgres";
GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."urlencode"("string" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_inspection_start_lock"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_inspection_start_lock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_inspection_start_lock"() TO "service_role";


















GRANT ALL ON TABLE "public"."archive_delivery_logs" TO "anon";
GRANT ALL ON TABLE "public"."archive_delivery_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."archive_delivery_logs" TO "service_role";



GRANT ALL ON TABLE "public"."archive_jobs" TO "anon";
GRANT ALL ON TABLE "public"."archive_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."archive_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_template_items" TO "anon";
GRANT ALL ON TABLE "public"."checklist_template_items" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_template_items" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_templates" TO "anon";
GRANT ALL ON TABLE "public"."checklist_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_templates" TO "service_role";



GRANT ALL ON TABLE "public"."company_settings" TO "anon";
GRANT ALL ON TABLE "public"."company_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."company_settings" TO "service_role";



GRANT ALL ON TABLE "public"."defects" TO "anon";
GRANT ALL ON TABLE "public"."defects" TO "authenticated";
GRANT ALL ON TABLE "public"."defects" TO "service_role";



GRANT ALL ON TABLE "public"."email_distribution_recipients" TO "anon";
GRANT ALL ON TABLE "public"."email_distribution_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."email_distribution_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."email_recipients" TO "anon";
GRANT ALL ON TABLE "public"."email_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."email_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."email_templates" TO "anon";
GRANT ALL ON TABLE "public"."email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."email_templates" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_archives" TO "anon";
GRANT ALL ON TABLE "public"."inspection_archives" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_archives" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_drafts" TO "anon";
GRANT ALL ON TABLE "public"."inspection_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_email_history" TO "anon";
GRANT ALL ON TABLE "public"."inspection_email_history" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_email_history" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_engine_events" TO "anon";
GRANT ALL ON TABLE "public"."inspection_engine_events" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_engine_events" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_items" TO "anon";
GRANT ALL ON TABLE "public"."inspection_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_items" TO "service_role";



GRANT ALL ON TABLE "public"."inspection_schedules" TO "anon";
GRANT ALL ON TABLE "public"."inspection_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_schedules" TO "service_role";



GRANT ALL ON TABLE "public"."inspections" TO "anon";
GRANT ALL ON TABLE "public"."inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."inspections" TO "service_role";



GRANT ALL ON TABLE "public"."machine_inspection_templates" TO "anon";
GRANT ALL ON TABLE "public"."machine_inspection_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."machine_inspection_templates" TO "service_role";



GRANT ALL ON TABLE "public"."machine_types" TO "anon";
GRANT ALL ON TABLE "public"."machine_types" TO "authenticated";
GRANT ALL ON TABLE "public"."machine_types" TO "service_role";



GRANT ALL ON TABLE "public"."machines" TO "anon";
GRANT ALL ON TABLE "public"."machines" TO "authenticated";
GRANT ALL ON TABLE "public"."machines" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reports" TO "anon";
GRANT ALL ON TABLE "public"."reports" TO "authenticated";
GRANT ALL ON TABLE "public"."reports" TO "service_role";



GRANT ALL ON TABLE "public"."retention_settings" TO "anon";
GRANT ALL ON TABLE "public"."retention_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."retention_settings" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_cleanup_runs" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_cleanup_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_cleanup_runs" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."work_areas" TO "anon";
GRANT ALL ON TABLE "public"."work_areas" TO "authenticated";
GRANT ALL ON TABLE "public"."work_areas" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































