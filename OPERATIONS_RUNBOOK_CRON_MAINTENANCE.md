# Operations Runbook: Vercel Cron Maintenance

## Purpose

Runbook for operating the daily maintenance cron endpoint:
- rotate cron authentication secret safely
- run manual backfills when scheduled executions were missed
- verify post-change health

## Endpoint

- Route: /api/cron/daily-maintenance
- Auth: Authorization header with Bearer token from CRON_SECRET
- Runtime: Next.js Route Handler (nodejs)
- Schedule source: vercel.json (Vercel Hobby compatible single daily cron)

## Schedule And Time Zone Behavior

- Cron expression in vercel.json: 0 7 * * *
- Vercel cron evaluation time zone: UTC
- UTC execution time: 07:00 UTC daily
- London winter time (GMT, UTC+0): 07:00 local
- London summer time (BST, UTC+1): 08:00 local

### Limitation (Vercel Hobby)

Vercel Hobby supports one cron execution per day, and cron schedules are UTC-based.
That means a single cron expression cannot stay fixed at exactly 07:00 Europe/London
across both GMT and BST.

Current implementation uses one daily invocation plus London-date idempotency in the
maintenance service, so work executes at most once per London calendar day even if
manual retries or duplicate requests occur.

### If Strict 07:00 London Is Required Year-Round

- Upgrade to a plan that supports more flexible scheduling.
- Configure two UTC triggers (06:00 and 07:00 UTC) and keep the existing idempotent
  daily guard so only one maintenance cycle runs for a London date.

## Secret Rotation

### Preconditions

- You have Vercel project access.
- You have a secure channel to distribute the new secret to operators.
- You can run a post-rotation test request.

### Steps

1. Generate a new strong secret.
2. In Vercel Project Settings -> Environment Variables, set CRON_SECRET to the new value for Production (and Preview if used).
  Vercel Cron will send Authorization: Bearer <CRON_SECRET> automatically when invoking the endpoint.
3. Redeploy production so the new environment value is active.
4. Trigger one authorized request to validate the new secret:

```bash
curl -X POST "https://<your-domain>/api/cron/daily-maintenance" \
  -H "Authorization: Bearer <NEW_CRON_SECRET>"
```

5. Confirm response status is 200 and includes JSON fields: success, maintenanceDate, durationMs, stats.
6. Confirm an old secret is rejected with 401.

### Rollback

1. Restore the prior CRON_SECRET value in Vercel.
2. Redeploy.
3. Re-run the authorized validation request.

## Manual Backfill Procedure

Use this when maintenance windows were missed and you want to force checks.

### Safety

- Endpoint execution is idempotent.
- Distributed lease and daily completion checks prevent duplicate inspection generation.
- Multiple calls are safe, but still use controlled loops.

### Single Manual Run

```bash
curl -X POST "https://<your-domain>/api/cron/daily-maintenance" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### Local Manual Run (dev)

```bash
CRON_SECRET=<local-secret> npm run cron:daily-maintenance
```

Optional URL override:

```bash
CRON_DAILY_MAINTENANCE_URL="http://localhost:3000/api/cron/daily-maintenance" \
CRON_SECRET=<local-secret> \
npm run cron:daily-maintenance
```

### Controlled Backfill Loop

Run a bounded number of attempts with short spacing:

```bash
for i in 1 2 3 4; do
  curl -s -X POST "https://<your-domain>/api/cron/daily-maintenance" \
    -H "Authorization: Bearer <CRON_SECRET>";
  echo;
  sleep 5;
done
```

Expected behavior after the first successful run on a completed day:
- success: true
- skipped: true
- stats remain unchanged or zeroed for generation actions

## Post-Change Verification Checklist

1. Endpoint unauthorized request returns 401.
2. Authorized request returns 200.
3. Response contains durationMs and stats object.
4. No duplicate generation observed in inspection/scheduler diagnostics.
5. Daily maintenance log shows completed status for current London date.

## Incident Notes

If endpoint returns 500:
- Verify NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured.
- Verify CRON_SECRET in the runtime environment.
- Check platform logs for daily-maintenance and cron-daily-maintenance entries.
