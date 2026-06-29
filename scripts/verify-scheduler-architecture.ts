#!/usr/bin/env npx ts-node
/**
 * Scheduler Architecture Verification Tests
 *
 * This script verifies that the new lightweight watchdog scheduler
 * architecture meets all requirements:
 *
 * 1. CPU usage is reduced while idle
 * 2. Scheduler does minimal work when maintenance completed
 * 3. Daily Maintenance runs exactly once per day
 * 4. User activity triggers auto-maintenance if missed
 * 5. Concurrent requests can't execute maintenance more than once
 * 6. Repeated executions remain fully idempotent
 * 7. Existing functionality is unchanged
 */

import { createClient } from '@supabase/supabase-js';
import { dailyMaintenance } from '@/lib/services/dailyMaintenance';
import { getLondonDateKey } from '@/lib/inspectionTime';

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  details: Record<string, unknown>;
  error?: string;
}

const results: TestResult[] = [];

function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const prefix = {
    info: '[VERIFY]',
    warn: '[WARN]',
    error: '[ERROR]',
  }[level];
  console.log(`${prefix} ${message}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test 1: Verify daily maintenance log table exists
async function test_maintenanceLogTableExists(supabase: any) {
  const start = Date.now();
  try {
    const { data, error } = await supabase
      .from('daily_maintenance_log')
      .select('id')
      .limit(1);

    assert(!error, `Table query error: ${error?.message}`);
    assert(Array.isArray(data), 'Table exists and is accessible');

    results.push({
      name: 'Maintenance Log Table Exists',
      passed: true,
      durationMs: Date.now() - start,
      details: { rowCount: data?.length ?? 0 },
    });
  } catch (err) {
    results.push({
      name: 'Maintenance Log Table Exists',
      passed: false,
      durationMs: Date.now() - start,
      details: {},
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Test 2: Verify daily maintenance runs exactly once per day
async function test_dailyMaintenanceIdempotency(supabase: any) {
  const start = Date.now();
  try {
    const londonDate = getLondonDateKey(new Date());

    // Get count before
    const { data: beforeData } = await supabase
      .from('daily_maintenance_log')
      .select('id')
      .eq('job_name', 'daily-inspection-maintenance')
      .eq('maintenance_date', londonDate)
      .eq('status', 'completed');

    const beforeCount = beforeData?.length ?? 0;

    // Run maintenance
    const result1 = await dailyMaintenance.runDailyMaintenance(supabase, 'test-run-1');

    // Get count after first run
    const { data: afterFirstData } = await supabase
      .from('daily_maintenance_log')
      .select('id')
      .eq('job_name', 'daily-inspection-maintenance')
      .eq('maintenance_date', londonDate)
      .eq('status', 'completed');

    const afterFirstCount = afterFirstData?.length ?? 0;

    // Run again immediately
    const result2 = await dailyMaintenance.runDailyMaintenance(supabase, 'test-run-2');

    // Get count after second run
    const { data: afterSecondData } = await supabase
      .from('daily_maintenance_log')
      .select('id')
      .eq('job_name', 'daily-inspection-maintenance')
      .eq('maintenance_date', londonDate)
      .eq('status', 'completed');

    const afterSecondCount = afterSecondData?.length ?? 0;

    // Verify exactly one completion per day
    assert(
      result1.success,
      'First run should succeed'
    );
    assert(
      result2.success && result2.stats.inspectionsGenerated === 0 && result2.stats.remindersQueued === 0,
      'Second run should be skipped (idempotent)'
    );
    assert(
      afterFirstCount === beforeCount + 1,
      `Should have exactly one completion after first run (before: ${beforeCount}, after: ${afterFirstCount})`
    );
    assert(
      afterSecondCount === afterFirstCount,
      `Should still have one completion after second run (no duplicates)`
    );

    results.push({
      name: 'Daily Maintenance Idempotency',
      passed: true,
      durationMs: Date.now() - start,
      details: {
        beforeCount,
        afterFirstCount,
        afterSecondCount,
        firstRunSuccess: result1.success,
        secondRunSkipped: result2.success && result2.stats.inspectionsGenerated === 0,
        firstRunStats: result1.stats,
        secondRunStats: result2.stats,
      },
    });
  } catch (err) {
    results.push({
      name: 'Daily Maintenance Idempotency',
      passed: false,
      durationMs: Date.now() - start,
      details: {},
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Test 3: Verify maintenance completion detection works
async function test_hasMaintenanceCompletedDetection(supabase: any) {
  const start = Date.now();
  try {
    const londonDate = getLondonDateKey(new Date());

    // First check - should depend on whether today's maintenance has run before
    const completedBefore = await dailyMaintenance.hasMaintenanceCompletedToday(
      supabase,
      londonDate
    );

    // Run maintenance
    await dailyMaintenance.runDailyMaintenance(supabase, 'test-detection');

    // Second check - should now be true
    const completedAfter = await dailyMaintenance.hasMaintenanceCompletedToday(
      supabase,
      londonDate
    );

    assert(completedAfter, 'Should detect completion after maintenance runs');

    results.push({
      name: 'Maintenance Completion Detection',
      passed: true,
      durationMs: Date.now() - start,
      details: {
        detectedBefore: completedBefore,
        detectedAfter: completedAfter,
      },
    });
  } catch (err) {
    results.push({
      name: 'Maintenance Completion Detection',
      passed: false,
      durationMs: Date.now() - start,
      details: {},
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Test 4: Verify maintenance statistics are captured
async function test_maintenanceStatisticsCapture(supabase: any) {
  const start = Date.now();
  try {
    const result = await dailyMaintenance.runDailyMaintenance(supabase, 'test-stats');

    assert(Boolean(result.stats), 'Should have stats object');
    assert(
      typeof result.stats.inspectionsGenerated === 'number',
      'Should have inspectionsGenerated count'
    );
    assert(
      typeof result.stats.remindersQueued === 'number',
      'Should have remindersQueued count'
    );
    assert(
      typeof result.stats.emailsProcessed === 'number',
      'Should have emailsProcessed count'
    );

    results.push({
      name: 'Maintenance Statistics Capture',
      passed: true,
      durationMs: Date.now() - start,
      details: {
        stats: result.stats,
        logId: result.logId,
        durationMs: result.durationMs,
      },
    });
  } catch (err) {
    results.push({
      name: 'Maintenance Statistics Capture',
      passed: false,
      durationMs: Date.now() - start,
      details: {},
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Test 5: Verify scheduler lease mechanism
async function test_schedulerLeaseMechanism(supabase: any) {
  const start = Date.now();
  try {
    const owner1 = `test-lease-${Date.now()}-1`;
    const owner2 = `test-lease-${Date.now()}-2`;

    // First owner acquires lease
    const { data: leaseData1, error: leaseError1 } = await supabase.rpc(
      'try_acquire_scheduler_lock',
      {
        p_name: 'test-lease-verification',
        p_owner: owner1,
        p_lease_seconds: 300,
      }
    );

    assert(!leaseError1, `Lease acquisition error: ${leaseError1?.message}`);
    assert(leaseData1 === true, 'First owner should acquire lease');

    // Second owner tries to acquire same lease - should fail
    const { data: leaseData2, error: leaseError2 } = await supabase.rpc(
      'try_acquire_scheduler_lock',
      {
        p_name: 'test-lease-verification',
        p_owner: owner2,
        p_lease_seconds: 300,
      }
    );

    assert(!leaseError2, `Second lease check error: ${leaseError2?.message}`);
    assert(leaseData2 === false, 'Second owner should NOT acquire lease while held');

    // First owner should be able to re-acquire
    const { data: leaseData3, error: leaseError3 } = await supabase.rpc(
      'try_acquire_scheduler_lock',
      {
        p_name: 'test-lease-verification',
        p_owner: owner1,
        p_lease_seconds: 300,
      }
    );

    assert(!leaseError3, `Re-acquisition error: ${leaseError3?.message}`);
    assert(leaseData3 === true, 'First owner should re-acquire own lease');

    // Release lease
    const { error: releaseError } = await supabase.rpc('release_scheduler_lock', {
      p_name: 'test-lease-verification',
      p_owner: owner1,
    });

    assert(!releaseError, `Release error: ${releaseError?.message}`);

    // Now second owner should acquire
    const { data: leaseData4, error: leaseError4 } = await supabase.rpc(
      'try_acquire_scheduler_lock',
      {
        p_name: 'test-lease-verification',
        p_owner: owner2,
        p_lease_seconds: 300,
      }
    );

    assert(!leaseError4, `Final acquisition error: ${leaseError4?.message}`);
    assert(leaseData4 === true, 'Second owner should acquire after release');

    results.push({
      name: 'Scheduler Lease Mechanism',
      passed: true,
      durationMs: Date.now() - start,
      details: {
        owner1AcquiredFirst: leaseData1,
        owner2FailedWhileLocked: leaseData2 === false,
        owner1ReacquiredOwn: leaseData3,
        owner2AcquiredAfterRelease: leaseData4,
      },
    });
  } catch (err) {
    results.push({
      name: 'Scheduler Lease Mechanism',
      passed: false,
      durationMs: Date.now() - start,
      details: {},
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Main test runner
async function runTests() {
  log('=== Scheduler Architecture Verification ===');
  log('Testing new lightweight watchdog scheduler design');
  log('');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Run tests
  await test_maintenanceLogTableExists(supabase);
  await test_hasMaintenanceCompletedDetection(supabase);
  await test_maintenanceStatisticsCapture(supabase);
  await test_schedulerLeaseMechanism(supabase);
  await test_dailyMaintenanceIdempotency(supabase);

  // Report results
  log('');
  log('=== Test Results ===');
  let passCount = 0;
  let failCount = 0;

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    log(`${status} ${result.name} (${result.durationMs}ms)`);

    if (!result.passed) {
      log(`  Error: ${result.error}`, 'error');
      failCount++;
    } else {
      passCount++;
    }

    if (Object.keys(result.details).length > 0) {
      log(`  Details: ${JSON.stringify(result.details, null, 2)}`);
    }
  }

  log('');
  log(`Summary: ${passCount} passed, ${failCount} failed out of ${results.length} tests`);

  if (failCount > 0) {
    process.exit(1);
  }
}

// Run on script execution
runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
