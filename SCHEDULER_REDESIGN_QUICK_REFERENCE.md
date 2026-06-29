# Scheduler Architecture Redesign - Quick Reference

## What Changed

### Before: High-Frequency Scheduler
- Ran every 60 seconds
- Continuously processed work
- High CPU usage in idle state
- Complex orchestration cycle

### After: Lightweight Watchdog
- Wakes every 30-60 minutes
- Checks if daily work is done
- Near-zero CPU when idle
- Single consolidated daily maintenance job

## Key Files Modified

| File | Change | Impact |
|------|--------|--------|
| `lib/services/backgroundScheduler.ts` | Complete rewrite | Now a watchdog instead of processor |
| `lib/services/dailyMaintenance.ts` | New file | Consolidates all daily work |
| `lib/services/userActivityFallback.ts` | New file | Auto-runs maintenance on user activity |
| `app/api/inspections/route.ts` | Added fallback trigger | Ensures maintenance on data request |
| `app/api/inspection-executions/route.ts` | Added fallback trigger | Ensures maintenance on data request |
| `app/api/schedules/route.ts` | Added fallback trigger | Ensures maintenance on data request |
| `supabase/migrations/0031_daily_maintenance_log.sql` | New migration | Tracks maintenance runs |

## Deployment Steps

### 1. Database Migration
```bash
# Apply migration 0031 to your Supabase database
# This creates the daily_maintenance_log table and helper functions
```

### 2. Deploy Code
```bash
git pull
npm install
npm run build
```

### 3. Verify
```bash
# Run verification tests
npm run verify-scheduler

# Run regression tests
npm run regression-tests

# Monitor logs for first maintenance run
tail -f logs/scheduler.log | grep "daily-maintenance"
```

## Operational Checks

### Check if Today's Maintenance Completed
```sql
SELECT * FROM daily_maintenance_log 
WHERE job_name = 'daily-inspection-maintenance'
  AND maintenance_date = CURRENT_DATE AT TIME ZONE 'Europe/London'
  AND status = 'completed'
ORDER BY completed_at DESC
LIMIT 1;
```

### View Recent Maintenance History
```sql
SELECT 
  maintenance_date,
  status,
  duration_ms,
  started_at,
  completed_at,
  error_message
FROM daily_maintenance_log
WHERE job_name = 'daily-inspection-maintenance'
ORDER BY maintenance_date DESC, started_at DESC
LIMIT 20;
```

### Check Scheduler Lease Status
```sql
SELECT * FROM scheduler_leases 
WHERE name = 'daily-maintenance'
ORDER BY updated_at DESC;
```

### View Maintenance Statistics
```sql
SELECT 
  DATE(started_at AT TIME ZONE 'Europe/London') as date,
  COUNT(*) as run_count,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_runs,
  AVG(duration_ms) as avg_duration_ms,
  MAX(duration_ms) as max_duration_ms
FROM daily_maintenance_log
WHERE job_name = 'daily-inspection-maintenance'
GROUP BY DATE(started_at AT TIME ZONE 'Europe/London')
ORDER BY date DESC;
```

## Monitoring

### What to Look For in Logs

**Good Signs** (Expected):
```
[daily-maintenance] Starting maintenance for 2026-06-29
[daily-maintenance] Inspection scheduler: generated=5, skipped=0, overdue=2
[daily-maintenance] Daily reminders queued: 3
[daily-maintenance] Reminders sent: 2
[daily-maintenance] Emails processed: 15
[daily-maintenance] Completed successfully in 2847ms
```

**Warnings to Investigate**:
```
[daily-maintenance] Could not acquire lease, another instance may be running
[daily-maintenance] Already completed for 2026-06-29, skipping
[background-scheduler] watchdog tick failed
```

### CPU Usage Should Be Low

**Expected**:
- Idle CPU: <0.1% between maintenance runs
- During maintenance: 1-5% for 2-3 minutes
- No sustained >1% CPU when idle

**If High**:
- Check if other services are consuming CPU
- Verify `BACKGROUND_SCHEDULER_ENABLED=true` if scheduler should be running
- Check for stuck processes: `ps aux | grep node`

## Troubleshooting

### Maintenance Never Runs
1. Check if scheduler is enabled: `echo $BACKGROUND_SCHEDULER_ENABLED`
2. Check scheduler logs for errors
3. Verify Supabase connectivity
4. Check if lease is stuck: Query `scheduler_leases` table
5. Try manual trigger: `curl -X POST /api/schedules/run`

### Maintenance Runs Too Frequently
1. Check interval setting: `echo $BACKGROUND_SCHEDULER_INTERVAL_MS`
2. Normal: Every 30-60 minutes
3. If <30 min: Adjust environment variable
4. Check logs for repeated failures (exponential backoff)

### Data Looks Stale
1. Check last maintenance completion: See SQL queries above
2. Trigger manual maintenance: User should trigger fallback when accessing pages
3. For immediate update: Manually call API or wait for user activity

### Duplicate Data Created
This should NOT happen. If it does:
1. Check if multiple instances are running
2. Verify scheduler leases are working
3. Inspect daily_maintenance_log for multiple 'completed' entries
4. Review error logs for recovery issues

## Performance Expectations

| Metric | Value | Notes |
|--------|-------|-------|
| Idle CPU | <0.1% | Minimal background work |
| Maintenance runtime | 2-3 min | Single daily run |
| Watchdog interval | 30-60 min | Configurable |
| First run delay | 30 min | After startup |
| Fallback latency | <100ms | Per API call (cached) |

## Environment Configuration

```bash
# Change watchdog interval (milliseconds)
BACKGROUND_SCHEDULER_INTERVAL_MS=1800000  # 30 min

# Disable scheduler (keep app running)
BACKGROUND_SCHEDULER_ENABLED=false

# Note: Other existing env vars unchanged
# - BACKGROUND_SCHEDULER_ENABLED (old, still works)
# - Any DB/Supabase config remains the same
```

## Rollback Instructions

If you need to revert:

1. Revert the code changes: `git revert <commit>`
2. Redeploy old version
3. Old scheduler will still work (this system is additive)
4. No data loss - all maintenance logs remain

## Questions?

- Check `SCHEDULER_ARCHITECTURE_REDESIGN.md` for detailed architecture
- View verification scripts: `scripts/verify-scheduler-architecture.ts`
- Review regression tests: `scripts/regression-tests.ts`
- Check source code: `lib/services/dailyMaintenance.ts`
