# 🚀 Supabase CLI Setup Complete

## Status: ✅ Ready to Deploy

Your project is now configured to manage database migrations with the Supabase CLI.

---

## 📋 What Was Done

### 1. ✅ Supabase CLI Installed
- Installed as dev dependency: `@supabase/cli@latest`
- Initialized Supabase project structure

### 2. ✅ Migrations Moved
- All 12 SQL migrations moved to: `/supabase/migrations/`
- Files are ready to be applied to your database

### 3. ✅ Config Files Created
- `/supabase/config.toml` - Supabase project configuration
- `/supabase/.gitignore` - Secrets protection

### 4. ✅ NPM Scripts Added
Three new commands ready to use:
- `npm run db:link` - Link to your Supabase project (one-time)
- `npm run db:push` - Apply all migrations
- `npm run db:reset` - Reset database (dev only)

### 5. ✅ Project Verified
- No TypeScript errors
- No ESLint errors
- Build successful (17 static routes)

---

## 🎯 Step-by-Step Setup Instructions

### Step 1: Locate Your Supabase Project Reference ID

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **General**
4. Find the **Reference ID** (looks like: `roarsqnfsrompzvapjkl`)
5. Copy it to your clipboard

### Step 2: Link Your Project

Run:
```bash
npm run db:link
```

When prompted:
- **Enter your project ref**: Paste your Reference ID (from Step 1)
- You may be asked to authenticate - follow the browser prompt
- It will create `.supabase/config.local.toml` (this is secret, don't commit it)

### Step 3: Push Migrations

After successful linking, run:
```bash
npm run db:push
```

This will:
- Execute all 12 migrations in order
- Create all tables and indexes
- Set up Row-Level Security
- Install triggers and functions

### Step 4: Verify Database Creation

In your browser:
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor**
4. Run this query to verify:

```sql
SELECT 
  table_name,
  row_count,
  total_bytes
FROM (
  SELECT 
    schemaname,
    tablename,
    n_live_tup as row_count,
    pg_total_relation_size(schemaname||'.'||tablename) as total_bytes
  FROM pg_stat_user_tables
) t
WHERE schemaname = 'public'
ORDER BY tablename;
```

Expected output (8 tables):
- inspections
- machines
- notifications
- profiles
- reports
- users
- work_areas
- machine_types

### Step 5: Verify Application Works

1. Start the app:
   ```bash
   npm run dev
   ```

2. Open http://localhost:3000

3. Login with system admin:
   - **Username**: `admin`
   - **Password**: `Meg4vaux!`

---

## 📂 Project Structure

```
/workspaces/mgmt
├── package.json                 (npm scripts added)
├── supabase/                    (NEW!)
│   ├── config.toml              (Project config)
│   ├── .gitignore               (Protects secrets)
│   └── migrations/              (12 SQL files)
│       ├── 0001_enable_extensions.sql
│       ├── 0002_create_profiles_table.sql
│       ├── 0002b_create_users_table.sql
│       ├── 0003_create_work_areas_table.sql
│       ├── 0004_create_machine_types_table.sql
│       ├── 0005_create_machines_table.sql
│       ├── 0006_create_inspections_table.sql
│       ├── 0007_create_reports_table.sql
│       ├── 0008_create_notifications_table.sql
│       ├── 0009_create_trigger_functions.sql
│       ├── 0010_create_indexes.sql
│       └── 0011_enable_rls_and_policies.sql
├── db/                          (old location - can keep or delete)
│   └── migrations/              (original files still here)
└── DATABASE_SETUP.md            (Setup guide)
```

---

## 🔐 Environment Variables

Already configured in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**⚠️ Never commit .env.local to Git!**

---

## 📦 What Each Migration Creates

| # | Name | Creates |
|---|------|---------|
| 0001 | Extensions | uuid-ossp, http PostgreSQL extensions |
| 0002 | Profiles | Main user table (source of truth) |
| 0002b | Users | Application mirror table |
| 0003 | Work Areas | ELV, MWE, Administration areas |
| 0004 | Machine Types | Elevator, Pump, Compressor, etc. |
| 0005 | Machines | Equipment records table |
| 0006 | Inspections | Daily inspection records |
| 0007 | Reports | Inspection reports |
| 0008 | Notifications | User alerts |
| 0009 | Triggers | Automatic updated_at timestamps |
| 0010 | Indexes | Performance indexes on all tables |
| 0011 | RLS Policies | Row-level security for data access |

---

## ⚙️ Available Commands

```bash
# Link project to CLI (one-time, creates .supabase/config.local.toml)
npm run db:link

# Push all pending migrations to database
npm run db:push

# Reset database (DESTRUCTIVE - dev only!)
npm run db:reset

# View migration status
npx supabase migration list --linked

# Pull latest schema from remote
npx supabase db pull

# Squash all migrations into one
npx supabase migration list --linked | head -1 | xargs -I {} supabase db push --version {}
```

---

## 🆘 Troubleshooting

### "Project ref not found"
**Solution:** Make sure you copied the correct Reference ID from Dashboard → Settings → General

### "Permission denied" or "service role key invalid"
**Solution:** Check `.supabase/config.local.toml` - it should match your project

### "Migration failed: relation already exists"
**Solution:** This is normal if you've run migrations before. The migrations use `create table if not exists`

### "Tables not visible in Dashboard"
**Solution:** 
- Refresh the Dashboard page (F5)
- Wait 5 seconds for cache
- Check the **Migrations** tab to see migration history

### "Build fails with SUPABASE_SERVICE_ROLE_KEY error"
**Solution:** Make sure `.env.local` has all three required variables and they're not empty

---

## 📚 Database Schema Highlights

### Profiles Table (Source of Truth)
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT ('super_admin', 'admin', 'operator'),
  work_area TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Machines Table
```sql
CREATE TABLE machines (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  type TEXT,
  assigned_user TEXT,
  inspection_deadline TEXT,  -- HH:MM format
  status TEXT,               -- Not Started, In Progress, Completed, Overdue
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Inspections Table
```sql
CREATE TABLE inspections (
  id UUID PRIMARY KEY,
  machine_id UUID REFERENCES machines ON DELETE CASCADE,
  operator_id UUID REFERENCES auth.users ON DELETE CASCADE,
  operator_name TEXT NOT NULL,
  completed_at TIMESTAMP,
  checklist JSONB,  -- Array of {id, label, status, faultDescription, severity}
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## ✨ Key Features Enabled

- ✅ **Row-Level Security** - Data automatically filtered by user role
- ✅ **Automatic Timestamps** - `updated_at` auto-updates on every change
- ✅ **Performance Indexes** - Optimized queries on frequently used columns
- ✅ **Cascading Deletes** - Related records cleaned up automatically
- ✅ **JSONB Storage** - Flexible inspection checklists
- ✅ **Service Role** - Admin operations via API

---

## 🎓 Learning Resources

- [Supabase CLI Getting Started](https://supabase.com/docs/guides/cli/getting-started)
- [Managing Migrations](https://supabase.com/docs/guides/cli/managing-schemas)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)

---

## ✅ Checklist

Before deploying to production:

- [ ] Run `npm run db:link` with correct Project Reference ID
- [ ] Run `npm run db:push` successfully
- [ ] Verify all 8 tables created in Dashboard
- [ ] Test login with admin account
- [ ] Create test user via admin panel
- [ ] Create test machine
- [ ] Complete test inspection
- [ ] Check admin reports page
- [ ] Verify no TypeScript errors: `npm run lint`
- [ ] Verify build succeeds: `npm run build`

---

## 🚀 Ready to Go!

Your database migration system is now fully configured and ready to deploy.

**Next step:** Run `npm run db:link` 👉 [See Step 2 above](#step-2-link-your-project)
