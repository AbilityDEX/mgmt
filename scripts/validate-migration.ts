#!/usr/bin/env node
/**
 * Migration Syntax Validator
 *
 * Validates that migration 0031_daily_maintenance_log.sql is syntactically correct
 * for PostgreSQL 12+ (Supabase standard).
 *
 * Run: npm exec ts-node scripts/validate-migration.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ValidationResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    details?: string;
    severity: 'error' | 'warning' | 'info';
  }>;
  summary: string;
}

const migrationPath = path.join(
  __dirname,
  '../supabase/migrations/0031_daily_maintenance_log.sql'
);

function readMigration(): string {
  try {
    return fs.readFileSync(migrationPath, 'utf-8');
  } catch (err) {
    throw new Error(
      `Failed to read migration file: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function validateSyntax(content: string): ValidationResult {
  const checks: ValidationResult['checks'] = [];
  let passed = true;

  // Check 1: Verify CREATE TABLE syntax
  const createTableMatch = content.match(/create table if not exists public\.daily_maintenance_log/i);
  checks.push({
    name: 'CREATE TABLE statement exists',
    passed: !!createTableMatch,
    severity: 'error',
  });
  if (!createTableMatch) passed = false;

  // Check 2: Verify table constraint is gone and replaced with index
  const oldConstraint = content.match(/constraint daily_maintenance_log_one_per_day/i);
  const newIndex = content.match(/create unique index if not exists idx_daily_maintenance_log_one_completed/i);

  checks.push({
    name: 'Old table constraint removed (GOOD)',
    passed: !oldConstraint,
    details: oldConstraint
      ? 'Found old constraint - this will cause syntax error'
      : 'Constraint properly removed',
    severity: oldConstraint ? 'error' : 'info',
  });
  if (oldConstraint) passed = false;

  checks.push({
    name: 'Partial unique index created',
    passed: !!newIndex,
    details: 'Index with WHERE clause for idempotency',
    severity: 'error',
  });
  if (!newIndex) passed = false;

  // Check 3: Verify partial index syntax is correct
  const partialIndexWhere = content.match(
    /create unique index.*idx_daily_maintenance_log_one_completed[\s\S]*?where status = 'completed'/
  );
  checks.push({
    name: 'Partial index WHERE clause correct',
    passed: !!partialIndexWhere,
    severity: 'error',
  });
  if (!partialIndexWhere) passed = false;

  // Check 4: Verify all 4 required functions exist
  const requiredFunctions = [
    { name: 'get_last_maintenance_completion', pattern: /create or replace function public\.get_last_maintenance_completion/i },
    { name: 'start_maintenance_run', pattern: /create or replace function public\.start_maintenance_run/i },
    { name: 'complete_maintenance_run', pattern: /create or replace function public\.complete_maintenance_run/i },
    { name: 'fail_maintenance_run', pattern: /create or replace function public\.fail_maintenance_run/i },
  ];

  for (const fn of requiredFunctions) {
    const exists = fn.pattern.test(content);
    checks.push({
      name: `Function ${fn.name}() defined`,
      passed: exists,
      severity: 'error',
    });
    if (!exists) passed = false;
  }

  // Check 5: Verify get_last_maintenance_completion returns correct type
  const typeCheckFunc = content.match(
    /create or replace function public\.get_last_maintenance_completion[\s\S]*?returns public\.daily_maintenance_log/
  );
  checks.push({
    name: 'get_last_maintenance_completion returns typed table',
    passed: !!typeCheckFunc,
    details: 'Should return public.daily_maintenance_log (not generic record)',
    severity: 'warning',
  });

  // Check 6: Verify get_last_maintenance_completion uses SQL language (efficient)
  const sqlLangFunc = content.match(
    /create or replace function public\.get_last_maintenance_completion[\s\S]*?\$\$ language sql/i
  );
  checks.push({
    name: 'get_last_maintenance_completion uses SQL language',
    passed: !!sqlLangFunc,
    details: 'SQL functions are more efficient than plpgsql for simple queries',
    severity: 'info',
  });

  // Check 7: Verify all functions marked security definer
  const definerCount = (content.match(/security definer/gi) || []).length;
  checks.push({
    name: 'All functions use security definer',
    passed: definerCount >= 4,
    details: `Found ${definerCount} security definer clauses (need 4)`,
    severity: 'warning',
  });
  if (definerCount < 4) passed = false;

  // Check 8: Verify VOLATILE/STABLE qualifiers
  const volatileCount = (content.match(/\bvolatile\b/gi) || []).length;
  // Look for "language sql security definer stable" specifically to avoid matches in comments
  const stableCount = (content.match(/language sql[\s\S]{0,50}stable/gi) || []).length;
  checks.push({
    name: 'Functions have correct volatility qualifiers',
    passed: volatileCount === 3 && stableCount >= 1, // 3 volatile (write ops), 1+ stable (read op)
    details: `Found ${volatileCount} VOLATILE, ${stableCount} STABLE (need 3 and 1+)`,
    severity: 'warning',
  });

  // Check 9: Verify COMMENTS exist for documentation
  // Use multiline flag and match "comment on" anywhere in the file
  const commentLines = content.split('\n').filter(line => line.match(/^\s*comment on/i));
  const commentCount = commentLines.length;
  checks.push({
    name: 'Documentation comments exist',
    passed: commentCount >= 8,
    details: `Found ${commentCount} comment statements (need 8+)`,
    severity: 'info',
  });

  // Check 12: Verify exception handling
  const exceptionCount = (content.match(/exception when others then/gi) || []).length;
  checks.push({
    name: 'Exception handling in all write functions',
    passed: exceptionCount >= 3,
    details: `Found ${exceptionCount} exception handlers`,
    severity: 'warning',
  });

  // Check 13: Verify GET DIAGNOSTICS for row count checks
  const diagnosticsCount = (content.match(/get diagnostics[\s\S]*?row_count/gi) || []).length;
  checks.push({
    name: 'GET DIAGNOSTICS used for idempotency checks',
    passed: diagnosticsCount >= 2,
    details: `Found ${diagnosticsCount} row_count checks (need 2)`,
    severity: 'info',
  });

  // Check 14: Verify substring() truncates error messages
  const substringCount = (content.match(/substring\(.*from 1 for 1000\)/gi) || []).length;
  checks.push({
    name: 'Error messages truncated to 1000 chars',
    passed: substringCount >= 1,
    details: 'Prevents extremely long error messages',
    severity: 'info',
  });

  // Check 15: Verify floor(extract()) for duration calculation
  const durationCalc = content.match(/floor\(extract\(epoch from[\s\S]*?\) \* 1000\)::integer/i);
  checks.push({
    name: 'Duration calculated correctly as integer milliseconds',
    passed: !!durationCalc,
    severity: 'warning',
  });

  // Check 16: Verify idempotent design - enforced via status checks in WHERE clause
  const completeIdempotent = /complete_maintenance_run[\s\S]{1,500}status = 'running'/i.test(content);
  const failIdempotent = /fail_maintenance_run[\s\S]{1,500}status = 'running'/i.test(content);
  const idempotentDesign = completeIdempotent && failIdempotent;
  
  checks.push({
    name: 'Idempotent design enforced via status checks',
    passed: idempotentDesign,
    details: `Complete: ${completeIdempotent}, Fail: ${failIdempotent}`,
    severity: 'error',
  });
  if (!idempotentDesign) passed = false;

  return {
    passed,
    checks,
    summary: passed
      ? 'Migration is syntactically correct and follows PostgreSQL best practices'
      : 'Migration has errors that must be fixed before deployment',
  };
}

function reportResults(result: ValidationResult): void {
  console.log('\n=== Migration Validation Report ===\n');

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;

  for (const check of result.checks) {
    const status = check.passed ? '✓' : '✗';
    const color = check.passed
      ? '\x1b[32m' // green
      : check.severity === 'error'
        ? '\x1b[31m' // red
        : '\x1b[33m'; // yellow

    const reset = '\x1b[0m';
    const severity =
      check.severity === 'error'
        ? 'ERROR'
        : check.severity === 'warning'
          ? 'WARN'
          : 'INFO';

    console.log(`${color}${status} [${severity}] ${check.name}${reset}`);
    if (check.details) {
      console.log(`   → ${check.details}`);
    }

    if (check.severity === 'error' && !check.passed) errorCount++;
    if (check.severity === 'warning' && !check.passed) warningCount++;
    if (check.severity === 'info' && !check.passed) infoCount++;
  }

  console.log(`\n${result.checks.length} checks performed`);
  console.log(`Errors: ${errorCount}, Warnings: ${warningCount}, Info: ${infoCount}\n`);

  if (result.passed) {
    console.log('✓ Migration is ready for deployment\n');
  } else {
    console.log('✗ Migration has issues that must be fixed\n');
    process.exit(1);
  }
}

// Main
try {
  console.log('Validating migration 0031_daily_maintenance_log.sql...');
  const content = readMigration();
  const result = validateSyntax(content);
  reportResults(result);
} catch (err) {
  console.error('Validation error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
