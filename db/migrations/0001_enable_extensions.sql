-- Enable required extensions
-- Enable required extensions
create extension if not exists "uuid-ossp";

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'http') THEN
		CREATE EXTENSION IF NOT EXISTS "http";
	END IF;
END
$$;
