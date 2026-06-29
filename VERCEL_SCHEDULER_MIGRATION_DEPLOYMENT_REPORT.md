# Vercel Scheduler Migration Deployment Report

Date: 2026-06-29
Branch: release-2-development

## Scope

Migrated scheduler execution from in-process background timers to explicit invocation via a secured Vercel Cron API route, while reusing existing maintenance business logic.

## Files Changed

- app/api/cron/daily-maintenance/route.ts (new)
- eslint.config.mjs
- instrumentation.ts
- lib/services/backgroundScheduler.ts
- lib/services/systemHealth.ts
- OPERATIONS_RUNBOOK_CRON_MAINTENANCE.md (new)
- register.node.ts
- package.json
- scripts/runtime-verify-scheduler-automation.ts
- scripts/verify-scheduler-architecture.ts
- scripts/trigger-daily-maintenance.mjs (new)
- vercel.json (new)

## Files Removed

- None

## New API Routes

- /api/cron/daily-maintenance
  - Methods: GET, POST
  - Runtime: nodejs
  - Auth: bearer secret via CRON_SECRET (or VERCEL_CRON_SECRET fallback)
  - Behavior: executes dailyMaintenance.runDailyMaintenance() and returns JSON status/stats

## New Configuration

- vercel.json
  - Cron job configured for /api/cron/daily-maintenance
  - Schedule: 0 7 * * *
  - Time base: UTC (Vercel cron)
  - London mapping:
    - Winter (GMT): 07:00 local
    - Summer (BST): 08:00 local
  - Hobby limitation: one static UTC schedule cannot remain exactly 07:00 Europe/London across DST boundaries

## Environment Variables

Required:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- CRON_SECRET (required in production for cron endpoint auth)

Optional:
- NEXT_PUBLIC_APP_URL
- NEXT_PUBLIC_APP_VERSION
- EMAIL_SUBJECT_PREFIX
- SMTP_CONFIG_ENCRYPTION_KEY

Obsolete for production scheduler runtime:
- BACKGROUND_SCHEDULER_INTERVAL_MS (no longer used by production scheduling)
- BACKGROUND_SCHEDULER_ENABLED (no longer used by production scheduling)

## Local Development Trigger

- npm script: npm run cron:daily-maintenance
- Script target can be overridden via CRON_DAILY_MAINTENANCE_URL
- Uses CRON_SECRET if present

## Verification Results

### TypeScript Compile

- Command: npx tsc --noEmit
- Result: PASS

### Production Build

- Command: npm run build
- Result: PASS
- Includes dynamic route generation for /api/cron/daily-maintenance

### ESLint

- Command (full repository): npm run lint
- Result: PASS (0 errors, warnings remain)

### Scheduler Verification

- Command: npx ts-node --compiler-options '{"module":"commonjs"}' -r tsconfig-paths/register scripts/verify-scheduler-architecture.ts
- Result: PASS (5 passed, 0 failed)

### Cron Endpoint Verification

- Unauthorized request to /api/cron/daily-maintenance: PASS (401)
- Authorized request with Bearer secret: PASS (200)
- Execution returns duration and maintenance stats: PASS

### Duplicate Inspection Verification

- Sequential repeated invocations: PASS (idempotent, skipped when already complete)
- Concurrent invocations: PASS (locking enforced; one completed, others locked)
- Evidence script output: /tmp/runtime_verify_scheduler.json

### Daily Maintenance Verification

- runDailyMaintenance() called through cron route and verification scripts
- Idempotency checks: PASS
- Completion detection and lease behavior: PASS

### Archive Verification

- Runtime verification confirms archive pipeline invocation and no duplicate archive/event keys
- duplicateKeyCount remains 0 for archive-related keyed tables
- Result: PASS

### Report Generation Verification

- Runtime verification confirms archive PDF generation and archive record reuse for repeated calls
- Result: PASS

## Behavior Preservation Notes

The migrated flow keeps existing maintenance responsibilities in dailyMaintenance.runDailyMaintenance():
- inspection scheduling and due handling
- completed to due transitions
- reminders
- queue processing
- archive retries
- health/report-supporting diagnostics refresh
- completion logging and lock-based idempotency

No maintenance business logic was duplicated.

## Operations Runbook

- See OPERATIONS_RUNBOOK_CRON_MAINTENANCE.md for:
  - CRON_SECRET rotation procedure
  - Single-run and looped manual backfill commands
  - Post-change verification checklist
  - Rollback steps

## Remaining Production Risks

1. Repository still has high warning volume; lint passes but warning debt should be reduced over time.
2. CRON_SECRET must be set in production; if missing, production cron route rejects execution.
3. Vercel Hobby cron is UTC-based and single-frequency; exact 07:00 Europe/London year-round is not possible with one daily trigger.
