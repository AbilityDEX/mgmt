# Database Migration Setup Guide

## Installation Complete ✅

Supabase CLI has been installed and configured. You can now manage your database migrations with npm scripts.

## Quick Start

### 1. Link Your Supabase Project

Run this command to connect the CLI to your Supabase project:

```bash
npm run db:link
```

**When prompted, enter your Supabase Project Reference ID.**

**How to find your Project Reference ID:**
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **General**
4. Copy the **Reference ID** (it looks like: `roarsqnfsrompzvapjkl`)
5. Paste it when the CLI asks: "Enter your project ref"

### 2. Apply All Migrations to Your Database

After linking, push all migrations with:

```bash
npm run db:push
```

This will:
- Apply all 12 SQL migrations in order
- Create all tables (profiles, machines, inspections, reports, notifications, etc.)
- Create indexes and triggers
- Enable Row-Level Security policies

### 3. Verify Tables Were Created

To check that everything was created successfully, use the Supabase Dashboard:
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project
3. Click **SQL Editor**
4. Run this query to verify all tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see these tables:
- profiles
- users
- machines
- inspections
- reports
- notifications
- work_areas
- machine_types

## Available Commands

| Command | Purpose |
|---------|---------|
| `npm run db:link` | Link CLI to your Supabase project (one-time setup) |
| `npm run db:push` | Apply all pending migrations to your database |
| `npm run db:reset` | ⚠️ DESTRUCTIVE: Drop all tables and reapply migrations (dev only) |

## Environment Variables

The application uses these environment variables (already in `.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Do NOT commit `.env.local` to version control!**

## Migration Files

All migrations are stored in `/supabase/migrations/`:

| File | Purpose |
|------|---------|
| 0001_enable_extensions.sql | Enable PostgreSQL extensions (uuid-ossp) |
| 0002_create_profiles_table.sql | Main user profiles table (source of truth) |
| 0002b_create_users_table.sql | Application-level user mirror table |
| 0003_create_work_areas_table.sql | Work areas lookup table |
| 0004_create_machine_types_table.sql | Machine types lookup table |
| 0005_create_machines_table.sql | Machines/equipment records |
| 0006_create_inspections_table.sql | Inspection records |
| 0007_create_reports_table.sql | Reports from inspections |
| 0008_create_notifications_table.sql | User notifications |
| 0009_create_trigger_functions.sql | Automatic updated_at triggers |
| 0010_create_indexes.sql | Performance indexes |
| 0011_enable_rls_and_policies.sql | Row-level security policies |

## What Gets Created

### Tables

**profiles** - Source of truth for user data
- id, user_id (FK → auth.users), username (unique), email, full_name, phone, role, work_area, active, created_at, updated_at

**machines** - Equipment records
- id, code, name, area, type, manufacturer, model, serial_number, installation_date, last_inspection, inspection_deadline, assigned_user, status, notes, active, created_at, updated_at

**inspections** - Daily inspection records
- id, machine_id (FK), operator_id (FK), operator_name, completed_at, checklist (JSONB), created_at, updated_at

**reports** - Generated reports
- id, inspection_id (FK), machine_id (FK), report_date, summary, findings, recommendations, created_at, updated_at

**notifications** - User alerts
- id, user_id (FK), title, message, type, related_machine_id (FK), read, created_at, updated_at

**work_areas** - Area lookup (ELV, MWE, Administration)
- id, name (unique), description, created_at, updated_at

**machine_types** - Type lookup (Elevator, Pump, etc.)
- id, name (unique), description, created_at, updated_at

**users** - Application-level mirror (non-critical)
- id (FK → auth.users), email, full_name, role, work_area, phone, active, created_at, updated_at

### Indexes

Created on all key columns for performance:
- profiles: user_id, username, email, role, active
- machines: code, area, type, assigned_user, status, active
- inspections: machine_id, operator_id, completed_at
- And more...

### Row-Level Security Policies

All tables have RLS enabled:
- **Profiles**: Users can view/edit own, service role manages all
- **Machines**: Operators see assigned, admins see all
- **Inspections**: Users see own, admins see all
- **Notifications**: Users see own
- **Work areas & Types**: Authenticated users can read

### Automatic Triggers

All tables with `updated_at` column have automatic timestamp triggers.

## Troubleshooting

### "Project Reference ID not found"
- Make sure you copied the correct ID from Dashboard → Settings → General
- Try again with `npm run db:link`

### "Migration failed"
- Check that your Supabase project is active
- Verify your service role key has sufficient permissions
- Try running one migration at a time from the Supabase Dashboard SQL Editor

### "Tables not visible"
- Wait a few seconds for the Supabase cache to update
- Refresh the Dashboard
- Check the **Migrations** tab in the Dashboard to see migration history

### "Authentication errors"
- Make sure NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are correct
- They must match your Supabase project

## Next Steps

1. Run `npm run db:link` to connect to your project
2. Run `npm run db:push` to apply all migrations
3. Verify tables in Supabase Dashboard
4. Start your app with `npm run dev`
5. Login with the system admin:
   - Username: `admin`
   - Password: `Meg4vaux!`

## Resources

- [Supabase CLI Docs](https://supabase.com/docs/guides/cli/getting-started)
- [Supabase Migrations Guide](https://supabase.com/docs/guides/cli/managing-schemas)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

**Project ID:** mgmt  
**Migrations folder:** `/supabase/migrations/`  
**Config file:** `/supabase/config.toml`
