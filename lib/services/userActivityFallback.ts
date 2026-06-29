/**
 * User Activity Fallback
 *
 * Ensures that daily maintenance has run before serving inspection-dependent
 * data to users. If today's maintenance hasn't completed, it runs synchronously.
 *
 * This is a safety net that guarantees the application auto-recovers if the
 * background scheduler missed its run.
 *
 * Usage:
 * - Call at the start of API handlers that serve inspection data
 * - Call in React components that depend on inspection data
 * - Never block page load on this - run asynchronously when possible
 */

import { dailyMaintenance } from './dailyMaintenance';
import { getLondonDateKey } from '../inspectionTime';

let lastFallbackCheckDate: string = '';
let fallbackInProgress: Promise<void> | null = null;

/**
 * Ensure daily maintenance has completed, triggering it if necessary.
 *
 * This is safe to call from:
 * - API routes (synchronously await or asynchronously)
 * - React Server Components
 * - Use sparingly in client-side code due to latency
 *
 * @param supabase - Supabase client
 * @param waitForCompletion - If true, wait for maintenance to complete before returning.
 *                            If false, trigger asynchronously and return immediately.
 * @returns Promise that resolves when maintenance check/execution is complete
 */
export async function ensureDailyMaintenanceCompleted(
  supabase: any,
  waitForCompletion: boolean = true
): Promise<void> {
  const maintenanceDate = getLondonDateKey(new Date());

  // Quick check: has maintenance already been checked today?
  if (lastFallbackCheckDate === maintenanceDate && !waitForCompletion) {
    // Already checked today, skip
    return;
  }

  // If another thread is already running fallback, wait for it
  if (fallbackInProgress && waitForCompletion) {
    await fallbackInProgress;
    return;
  }

  // Check if maintenance has already completed
  const alreadyCompleted = await dailyMaintenance.hasMaintenanceCompletedToday(
    supabase,
    maintenanceDate
  );

  if (alreadyCompleted) {
    lastFallbackCheckDate = maintenanceDate;
    return;
  }

  // Maintenance not completed, need to run it
  const runMaintenance = async () => {
    try {
      console.info(
        `[user-activity-fallback] Running daily maintenance due to user activity on ${maintenanceDate}`
      );

      const result = await dailyMaintenance.runDailyMaintenance(
        supabase,
        'user-activity-fallback'
      );

      if (result.success) {
        console.info(
          `[user-activity-fallback] Daily maintenance completed successfully`,
          {
            durationMs: result.durationMs,
            stats: result.stats,
          }
        );
      } else {
        console.warn(`[user-activity-fallback] Daily maintenance failed`, {
          error: result.error,
        });
      }
    } catch (err) {
      console.error(
        `[user-activity-fallback] Error running daily maintenance`,
        {
          error: err instanceof Error ? err.message : String(err),
        }
      );
    } finally {
      lastFallbackCheckDate = maintenanceDate;
      fallbackInProgress = null;
    }
  };

  if (waitForCompletion) {
    // Synchronous wait - block until maintenance completes
    // Use this in API routes that must ensure data is current
    await runMaintenance();
  } else {
    // Asynchronous - trigger maintenance without blocking
    // Use this in React components to avoid page load delay
    fallbackInProgress = runMaintenance();
  }
}

/**
 * React Server Component hook to trigger maintenance fallback
 * 
 * Safe to use at the top of server components that need current inspection data.
 * Does NOT block rendering when waitForCompletion=false.
 */
export async function triggerMaintenanceFallbackIfNeeded(
  supabase: any,
  waitForCompletion: boolean = false
): Promise<void> {
  try {
    await ensureDailyMaintenanceCompleted(supabase, waitForCompletion);
  } catch (err) {
    // Log but don't throw - fallback failure shouldn't break the page
    console.warn('[user-activity-fallback] Fallback trigger failed (non-blocking)');
  }
}

export const userActivityFallback = {
  ensureDailyMaintenanceCompleted,
  triggerMaintenanceFallbackIfNeeded,
};
