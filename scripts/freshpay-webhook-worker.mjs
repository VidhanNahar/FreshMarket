#!/usr/bin/env node
// Calls the FreshPay webhook dispatcher on an interval: `npm run freshpay:webhooks`.
// Each run resumes from the stored cursor and outbox, so stopping or crashing this loop loses nothing.
const url = process.env.FRESHPAY_DISPATCH_URL ?? "http://localhost:3000/api/freshpay/webhooks/dispatch";
const secret = process.env.CRON_SECRET;
const intervalMs = Number(process.env.FRESHPAY_DISPATCH_INTERVAL_MS ?? 15_000);
if (!secret) {
  console.error("Set CRON_SECRET to the value the dispatch route expects.");
  process.exit(1);
}

async function tick() {
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(60_000) });
    console.log(new Date().toISOString(), response.status, JSON.stringify(await response.json()));
  } catch (error) {
    console.error(new Date().toISOString(), "dispatch failed:", error instanceof Error ? error.message : error);
  }
}

await tick();
setInterval(tick, intervalMs);
