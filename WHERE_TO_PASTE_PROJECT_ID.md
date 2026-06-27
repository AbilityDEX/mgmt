# Where to Paste Your Supabase Project Reference ID

## Quick Answer

When you run:
```bash
npm run db:link
```

The CLI will ask:
```
What is your Supabase project's reference ID?
```

**Paste your Reference ID here in the terminal.**

---

## Where to Find It

### Step 1: Go to Supabase Dashboard
https://supabase.com/dashboard

### Step 2: Select Your Project
- Click on the project you created
- You should see it in the list

### Step 3: Go to Project Settings
Click **Settings** in the left sidebar (gear icon)

### Step 4: Go to General Tab
The **General** tab should open by default

### Step 5: Copy Reference ID
Look for **Reference ID** - it's a short alphanumeric code:

Example: `roarsqnfsrompzvapjkl`

**Click the copy icon (📋) next to it**

---

## Complete Command Flow

### Command 1: Link Your Project
```bash
npm run db:link
```

Output:
```
What is your Supabase project's reference ID?
```

**→ Paste your Reference ID here (example: roarsqnfsrompzvapjkl)**

Then press Enter.

You may see:
```
Updating supabase remote to: https://your-project.supabase.co
Generating types...
```

This is normal! It's setting up the connection.

### Command 2: Push Migrations
```bash
npm run db:push
```

Output:
```
Connecting to remote database...
Applying 12 migrations...
✓ 0001_enable_extensions.sql
✓ 0002_create_profiles_table.sql
✓ 0002b_create_users_table.sql
✓ 0003_create_work_areas_table.sql
✓ 0004_create_machine_types_table.sql
✓ 0005_create_machines_table.sql
✓ 0006_create_inspections_table.sql
✓ 0007_create_reports_table.sql
✓ 0008_create_notifications_table.sql
✓ 0009_create_trigger_functions.sql
✓ 0010_create_indexes.sql
✓ 0011_enable_rls_and_policies.sql
```

All done! ✅

---

## Visual Guide

### Screenshot Locations

#### 1. Supabase Dashboard
```
https://supabase.com/dashboard
        ↓
[Your Project Name]  ← Click here
        ↓
Settings (left sidebar, gear icon)
        ↓
General tab (should be open)
        ↓
Reference ID: roarsqnfsrompzvapjkl  ← Copy this!
```

#### 2. CLI Prompt
```
$ npm run db:link

What is your Supabase project's reference ID? █
                                              ↑ 
                                    Paste here → roarsqnfsrompzvapjkl
```

---

## What Gets Stored

After you run `npm run db:link`, the CLI creates:

### `.supabase/config.local.toml` (NEW FILE - SECRET!)
```
[auth]
enable_signup = false
jwt_expiry_secs = 3600
jwt_secret = "your-jwt-secret-here"

[api]
postgres_url = "postgresql://postgres:password@..."
```

**⚠️ THIS FILE CONTAINS SECRETS - DO NOT COMMIT TO GIT**

The `.gitignore` already protects it, but be careful!

---

## Test Your Connection

After running `npm run db:link`, you can verify the connection:

```bash
npx supabase projects list --linked
```

You should see your project:
```
mgmt (roarsqnfsrompzvapjkl)
```

---

## Common Issues

### "Reference ID not found"
❌ Wrong: `my-awesome-project`
✅ Correct: `roarsqnfsrompzvapjkl`

The ID is in **Settings → General**, not your project name!

### "Authentication failed"
- Make sure you're logged into Supabase in your browser
- Try running again: `npm run db:link`

### "Already linked"
If you run `npm run db:link` twice, it just updates the link. No problem!

---

## Summary

1. Go to https://supabase.com/dashboard
2. Open your project → Settings → General
3. Copy the **Reference ID**
4. Run: `npm run db:link`
5. Paste the ID when prompted
6. Run: `npm run db:push`
7. ✅ Done!

---

**Next:** [Back to main setup guide](./SUPABASE_SETUP_INSTRUCTIONS.md)
