SET local check_function_bodies = off;

CREATE TABLE "public"."applications" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "company"         text,
  "title"           text,
  "location"        text,
  "url"             text,
  "description"     text,
  "status"          text                     NOT NULL DEFAULT 'saved'::text,
  "tailored_resume" text,
  "applied_at"      timestamp with time zone,
  "last_update_at"  timestamp with time zone DEFAULT now(),
  "notes"           text,
  "created_at"      timestamp with time zone DEFAULT now(),
  CONSTRAINT "applications_pkey" PRIMARY KEY (id),
  CONSTRAINT "applications_status_check"
    CHECK ((status = ANY (ARRAY['saved'::text, 'tailored'::text, 'applied'::text, 'interviewing'::text, 'offer'::text, 'rejected'::text, 'withdrawn'::text]))),
  CONSTRAINT "applications_url_key" UNIQUE (url)
);

ALTER TABLE "public"."applications"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."status_events" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "application_id" uuid,
  "status"         text                     NOT NULL,
  "source"         text                     NOT NULL,
  "email_id"       text,
  "email_subject"  text,
  "summary"        text,
  "created_at"     timestamp with time zone DEFAULT now(),
  CONSTRAINT "status_events_email_id_key" UNIQUE (email_id),
  CONSTRAINT "status_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."status_events"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

ALTER TABLE "public"."status_events"
  ADD CONSTRAINT "status_events_application_id_fkey" FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE CASCADE;

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."applications" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."applications" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."applications" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."applications" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."status_events" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."status_events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."status_events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."status_events" TO "service_role";

