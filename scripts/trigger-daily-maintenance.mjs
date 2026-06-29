#!/usr/bin/env node

const targetUrl =
  process.argv[2] ||
  process.env.CRON_DAILY_MAINTENANCE_URL ||
  'http://localhost:3000/api/cron/daily-maintenance';

const secret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '';

const headers = {
  Accept: 'application/json',
};

if (secret) {
  headers.Authorization = `Bearer ${secret}`;
}

const startedAt = Date.now();

try {
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers,
  });

  const body = await response.json().catch(() => ({}));
  const elapsedMs = Date.now() - startedAt;

  console.log(JSON.stringify({
    url: targetUrl,
    status: response.status,
    ok: response.ok,
    elapsedMs,
    body,
  }, null, 2));

  if (!response.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({
    url: targetUrl,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
}
