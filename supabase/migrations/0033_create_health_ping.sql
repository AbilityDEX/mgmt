-- Create a minimal health check function for infrastructure probes
BEGIN;

CREATE OR REPLACE FUNCTION public.health_ping()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT 1;
$$;

-- Prevent anonymous/public execution; service_role (superuser) can still call this.
REVOKE EXECUTE ON FUNCTION public.health_ping() FROM PUBLIC;

COMMIT;
