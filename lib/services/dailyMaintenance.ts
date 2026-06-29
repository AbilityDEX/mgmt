/**
 * Daily Maintenance Service
 *
 * Consolidates all daily automated work into a single idempotent operation.
 * Runs once per calendar day (London time).
 *
 * Responsibilities:
 * - Generate inspections due for the current day
 * - Mark inspections as Due when their scheduled day arrives
 * - Mark overdue inspections
 * - Send daily reminder emails
 * - Process archive/PDF/email queue work
 * - Update cached dashboard statistics
 * - Record completion in maintenance log
 *
 * Uses scheduler leases and generation keys for idempotency.
 * Never creates duplicates across multiple runs on the same day.
 */

import { createClient } from '@supabase/supabase-js';
import * as inspectionScheduling from './inspectionScheduling';
import * as reminders from './reminders';
import * as archivePipeline from './archivePipeline';
import * as emailQueue from './emailQueue';
import * as systemHealth from './systemHealth';
import { getLondonDateKey } from '../inspectionTime';

// Simple logger wrapper for consistent output
const logger = {
  info: (msg: string, details?: Record<string, unknown>) =>
    console.info(`[daily-maintenance] ${msg}`, details),
  warn: (msg: string, details?: Record<string, unknown>) =>
    console.warn(`[daily-maintenance] ${msg}`, details),
  error: (msg: string, details?: Record<string, unknown>) =>
    console.error(`[daily-maintenance] ${msg}`, details),
  debug: (msg: string, details?: Record<string, unknown>) =>
    console.log(`[daily-maintenance] ${msg}`, details),
};

interface MaintenanceResult {
  success: boolean;
  logId?: string;
  maintenanceDate: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  owner: string;
  stats: {
    inspectionsChecked: number;
    inspectionsGenerated: number;
    inspectionsSkipped: number;
    overdueMarked: number;
    remindersQueued: number;
    remindersSent: number;
    emailsProcessed: number;
    archiveRetries: number;
  };
  error?: string;
}

/**
 * Check if today's maintenance has already completed successfully
 */
export async function hasMaintenanceCompletedToday(
  supabase: any,
  maintenanceDate: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('daily_maintenance_log')
      .select('id')
      .eq('job_name', 'daily-inspection-maintenance')
      .eq('maintenance_date', maintenanceDate)
      .eq('status', 'completed')
      .maybeSingle();

    if (error) {
      logger.warn(
        `[daily-maintenance] Error checking completion status: ${error.message}`
      );
      return false;
    }

    return !!data;
  } catch (err) {
    logger.error(
      `[daily-maintenance] Unexpected error checking completion: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

/**
 * Record start of maintenance run
 */
async function startMaintenanceRun(
  supabase: any,
  maintenanceDate: string,
  owner: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('start_maintenance_run', {
      p_job_name: 'daily-inspection-maintenance',
      p_maintenance_date: maintenanceDate,
      p_owner: owner,
    });

    if (error) {
      logger.error(
        `[daily-maintenance] Failed to record run start: ${error.message}`
      );
      return null;
    }

    return data as string;
  } catch (err) {
    logger.error(
      `[daily-maintenance] Error recording run start: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return null;
  }
}

/**
 * Record successful completion of maintenance run
 */
async function completeMaintenanceRun(
  supabase: any,
  logId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('complete_maintenance_run', {
      p_log_id: logId,
    });

    if (error) {
      logger.error(
        `[daily-maintenance] Failed to record completion: ${error.message}`
      );
      return false;
    }

    return data as boolean;
  } catch (err) {
    logger.error(
      `[daily-maintenance] Error recording completion: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

/**
 * Record failure of maintenance run
 */
async function failMaintenanceRun(
  supabase: any,
  logId: string,
  errorMessage: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('fail_maintenance_run', {
      p_log_id: logId,
      p_error_message: errorMessage.substring(0, 1000),
    });

    if (error) {
      logger.error(
        `[daily-maintenance] Failed to record failure: ${error.message}`
      );
      return false;
    }

    return data as boolean;
  } catch (err) {
    logger.error(
      `[daily-maintenance] Error recording failure: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

/**
 * Try to acquire scheduler lease for daily maintenance
 */
async function acquireMaintenanceLease(
  supabase: any,
  owner: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('try_acquire_scheduler_lock', {
      p_name: 'daily-maintenance',
      p_owner: owner,
      p_lease_seconds: 300, // 5 minute lease for maintenance job
    });

    if (error) {
      logger.warn(
        `[daily-maintenance] Failed to acquire lease: ${error.message}`
      );
      return false;
    }

    return data as boolean;
  } catch (err) {
    logger.error(
      `[daily-maintenance] Error acquiring lease: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return false;
  }
}

/**
 * Release scheduler lease for daily maintenance
 */
async function releaseMaintenanceLease(
  supabase: any,
  owner: string
): Promise<void> {
  try {
    const { error } = await supabase.rpc('release_scheduler_lock', {
      p_name: 'daily-maintenance',
      p_owner: owner,
    });

    if (error) {
      logger.warn(`[daily-maintenance] Failed to release lease: ${error.message}`);
    }
  } catch (err) {
    logger.error(
      `[daily-maintenance] Error releasing lease: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/**
 * Execute all daily maintenance work
 *
 * This is the core maintenance job. It:
 * 1. Acquires a distributed lease
 * 2. Evaluates due inspections and generates drafts
 * 3. Queues and sends daily reminders
 * 4. Processes email queue
 * 5. Retries failed archive operations
 * 6. Refreshes system health cache
 * 7. Records completion
 *
 * Fully idempotent - safe to call multiple times on same day.
 */
export async function runDailyMaintenance(
  supabase: any,
  owner: string = 'app-scheduler'
): Promise<MaintenanceResult> {
  const startedAt = new Date();
  const maintenanceDate = getLondonDateKey(new Date());

  logger.info(`[daily-maintenance] Starting maintenance for ${maintenanceDate}`);

  const result: MaintenanceResult = {
    success: false,
    maintenanceDate,
    startedAt,
    owner,
    stats: {
      inspectionsChecked: 0,
      inspectionsGenerated: 0,
      inspectionsSkipped: 0,
      overdueMarked: 0,
      remindersQueued: 0,
      remindersSent: 0,
      emailsProcessed: 0,
      archiveRetries: 0,
    },
  };

  let logId: string | null = null;

  try {
    // Check if already completed today
    const alreadyCompleted = await hasMaintenanceCompletedToday(
      supabase,
      maintenanceDate
    );

    if (alreadyCompleted) {
      logger.info(
        `[daily-maintenance] Already completed for ${maintenanceDate}, skipping`
      );
      result.success = true;
      result.completedAt = new Date();
      result.durationMs = result.completedAt.getTime() - startedAt.getTime();
      return result;
    }

    // Record maintenance run start
    logId = await startMaintenanceRun(supabase, maintenanceDate, owner);
    if (!logId) {
      throw new Error('Failed to record maintenance run start');
    }

    result.logId = logId;

    // Try to acquire distributed lease
    const leaseAcquired = await acquireMaintenanceLease(supabase, owner);
    if (!leaseAcquired) {
      logger.warn(
        `[daily-maintenance] Could not acquire lease, another instance may be running`
      );
      throw new Error('Could not acquire scheduler lease');
    }

    try {
      // Step 1: Evaluate and generate inspections
      logger.debug(`[daily-maintenance] Running inspection scheduler`);
      const schedulingResult = await inspectionScheduling.runInspectionScheduler();
      result.stats.inspectionsChecked = schedulingResult.checkedCount ?? 0;
      result.stats.inspectionsGenerated = schedulingResult.generatedCount ?? 0;
      result.stats.inspectionsSkipped =
        schedulingResult.skippedDuplicateCount ?? 0;
      result.stats.overdueMarked = schedulingResult.overdueMarked ?? 0;

      logger.debug(
        `[daily-maintenance] Inspection scheduler: generated=${result.stats.inspectionsGenerated}, skipped=${result.stats.inspectionsSkipped}, overdue=${result.stats.overdueMarked}`
      );

      // Step 2: Queue and send daily reminders
      logger.debug(`[daily-maintenance] Queueing daily reminders`);
      const queuedReminders = await reminders.queueDailyReminderEmails();
      result.stats.remindersQueued = (queuedReminders && (queuedReminders.queued ?? queuedReminders)) ?? 0;

      logger.debug(
        `[daily-maintenance] Daily reminders queued: ${result.stats.remindersQueued}`
      );

      // Step 3: Send scheduled reminders (if within reminder send window)
      logger.debug(`[daily-maintenance] Sending scheduled reminders`);
      const sentReminders = await reminders.sendScheduledReminders();
      result.stats.remindersSent = (sentReminders && (sentReminders.sent ?? sentReminders.processed ?? 0)) ?? 0;

      logger.debug(
        `[daily-maintenance] Reminders sent: ${result.stats.remindersSent}`
      );

      // Step 4: Process email queue
      logger.debug(`[daily-maintenance] Processing email queue`);
      const emailsProcessed = await emailQueue.processEmailQueue(
        200 // process up to 200 emails
      );
      result.stats.emailsProcessed = (emailsProcessed && (emailsProcessed.processed ?? emailsProcessed.success ?? 0)) ?? 0;

      logger.debug(
        `[daily-maintenance] Emails processed: ${result.stats.emailsProcessed}`
      );

      // Step 5: Retry failed archive operations
      logger.debug(`[daily-maintenance] Retrying failed archive deliveries`);
      const archiveRetries = await archivePipeline.retryFailedArchiveDeliveries(3);
      result.stats.archiveRetries = (archiveRetries && (archiveRetries.retried ?? archiveRetries)) ?? 0;

      logger.debug(
        `[daily-maintenance] Archive retries: ${result.stats.archiveRetries}`
      );

      // Step 6: Refresh system health cache
      logger.debug(`[daily-maintenance] Refreshing system health cache`);
      try {
        await systemHealth.buildSchedulerDiagnostics();
      } catch (err) {
        logger.warn(
          `[daily-maintenance] Could not refresh health cache: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        // Don't fail the entire maintenance job for this
      }

      // Record successful completion
      const completed = await completeMaintenanceRun(supabase, logId);
      if (!completed) {
        // If completion RPC returned false, it may mean the log row no longer
        // exists or another process already completed the maintenance for
        // this job/date. Check whether a completed row exists for today and
        // treat that case as success (idempotent).
        try {
          // Verify the log row still exists
          const { data: existingLog, error: existingLogError } = await supabase
            .from('daily_maintenance_log')
            .select('id, status, maintenance_date')
            .eq('id', logId)
            .maybeSingle();

          if (existingLogError) {
            logger.warn(`[daily-maintenance] Error verifying maintenance log row: ${existingLogError.message}`);
          }

          // If another process already completed maintenance for today, treat as success
          const alreadyCompleted = await hasMaintenanceCompletedToday(supabase, maintenanceDate);
          if (alreadyCompleted) {
            logger.info('[daily-maintenance] Another process already recorded completion for today; treating as success', { maintenanceDate });
          } else {
            // No completed row exists and our RPC failed — surface an error
            throw new Error('Failed to record maintenance completion');
          }
        } catch (err) {
          throw err;
        }
      }

      result.success = true;
      result.completedAt = new Date();
      result.durationMs =
        result.completedAt.getTime() - startedAt.getTime();

      logger.info(
        `[daily-maintenance] Completed successfully in ${result.durationMs}ms`
      );
    } finally {
      // Always release lease
      await releaseMaintenanceLease(supabase, owner);
    }
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : String(err);
    logger.error(`[daily-maintenance] Maintenance failed: ${errorMessage}`);

    result.error = errorMessage;
    result.completedAt = new Date();
    result.durationMs =
      result.completedAt.getTime() - startedAt.getTime();

    // Record failure in maintenance log
    if (logId) {
      await failMaintenanceRun(supabase, logId, errorMessage);
    }
  }

  return result;
}

export const dailyMaintenance = {
  runDailyMaintenance,
  hasMaintenanceCompletedToday,
};
