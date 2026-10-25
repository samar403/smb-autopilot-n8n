import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkflow, configOf, runCode, mockNow, leftoverPlaceholders } from './harness.mjs';

const wf = loadWorkflow('01-invoice-followups');
const today = '2026-10-21';
const now = mockNow(`${today}T09:00:00`);
const daysAgo = (n) => new Date(Date.UTC(2026, 9, 21) - n * 86400000).toISOString().slice(0, 10);
const row = (over) => ({
  row_number: 2, invoice_id: 'INV-1', client_name: 'Dana Smith', client_email: 'dana@client.com',
  amount: 1250, currency: 'USD', due_date: daysAgo(4), status: 'Unpaid', payment_link: 'https://pay.example/inv-1',
  reminder_stage: '', last_reminder_at: '', ...over,
});
const plan = (rows, cfgOver = {}) => runCode(wf, 'Plan reminders', { input: rows, nodes: { Config: [configOf(wf, cfgOver)] }, now });

test('first follow-up goes out once an invoice is past stage-1 days', async () => {
  const [r] = await plan([row({})], { test_mode: false });
  assert.equal(r.stage, 1);
  assert.equal(r.to, 'dana@client.com');
  assert.equal(r.days_overdue, 4);
  assert.match(r.subject, /INV-1 \(\$1,250\.00\)/);
  assert.match(r.html, /Hi Dana,/);
  assert.match(r.html, /href="https:\/\/pay\.example\/inv-1"/);
  assert.deepEqual(leftoverPlaceholders(r.html + r.subject), []);
});

test('test mode redirects every email to the owner and tags the subject', async () => {
  const [r] = await plan([row({})]);
  assert.equal(r.to, 'you@example.com');
  assert.match(r.subject, /^\[TEST -> dana@client\.com\]/);
  assert.equal(r.test_mode, true);
});

test('never contacts paid, paused, blank-status or not-yet-due invoices', async () => {
  const out = await plan([
    row({ status: 'Paid' }), row({ status: 'paused' }), row({ status: '' }),
    row({ due_date: daysAgo(2) }), row({ due_date: daysAgo(-5) }),
  ]);
  assert.equal(out.length, 0);
});

test('never skips a stage, even for a long-overdue invoice', async () => {
  const [r] = await plan([row({ due_date: daysAgo(45) })]);
  assert.equal(r.stage, 1);
});

test('respects the minimum gap between reminders, then escalates', async () => {
  assert.equal((await plan([row({ due_date: daysAgo(12), reminder_stage: 1, last_reminder_at: daysAgo(3) })])).length, 0);
  const [r] = await plan([row({ due_date: daysAgo(12), reminder_stage: 1, last_reminder_at: daysAgo(6) })]);
  assert.equal(r.stage, 2);
  assert.match(r.subject, /12 days overdue/);
});

test('final notice at stage 3, and nothing after it', async () => {
  const [r] = await plan([row({ due_date: daysAgo(25), reminder_stage: 2, last_reminder_at: daysAgo(10) })]);
  assert.equal(r.stage, 3);
  assert.match(r.subject, /^\[TEST.*Final reminder/);
  assert.equal((await plan([row({ due_date: daysAgo(60), reminder_stage: 3, last_reminder_at: daysAgo(30) })])).length, 0);
});

test('reads Google Sheets serial dates and DD/MM text dates', async () => {
  const serial = Math.round((Date.UTC(2026, 9, 17) - Date.UTC(1899, 11, 30)) / 86400000); // 2026-10-17
  const [a] = await plan([row({ due_date: serial })]);
  assert.equal(a.days_overdue, 4);
  const [b] = await plan([row({ due_date: '17/10/2026' })], { date_format: 'DD/MM/YYYY' });
  assert.equal(b.days_overdue, 4);
  const [c] = await plan([row({ due_date: '10/17/2026' })], { date_format: 'MM/DD/YYYY' });
  assert.equal(c.days_overdue, 4);
});

test('skips rows with a bad email or unreadable date instead of failing the run', async () => {
  const out = await plan([row({ client_email: 'not-an-email' }), row({ due_date: '31/02/2026' }), row({ invoice_id: 'INV-OK' })]);
  assert.deepEqual(out.map((o) => o.invoice_id), ['INV-OK']);
});

test('digest totals overdue money per currency and lists rows to fix', async () => {
  const rows = [row({}), row({ invoice_id: 'INV-2', amount: '300', due_date: daysAgo(10) }), row({ invoice_id: 'INV-3', currency: 'EUR', amount: 99 }),
    row({ invoice_id: 'INV-4', client_email: '' }), row({ invoice_id: 'INV-5', status: 'Paid' })];
  const planned = await plan(rows);
  const [digest] = await runCode(wf, 'Build owner digest', {
    input: planned.map(() => ({ id: 'gmail-msg' })),
    nodes: { Config: [configOf(wf)], 'Plan reminders': planned, 'Read invoices': rows },
    now,
  });
  assert.equal(digest.to, 'you@example.com');
  assert.match(digest.subject, /^\[TEST\] Invoice follow-ups: 3 sent, \$1,550\.00 \+ €99\.00 overdue/);
  assert.match(digest.html, /Test mode is on/);
  assert.match(digest.html, /INV-4.*missing client_email/s);
  assert.doesNotMatch(digest.html, /INV-5/);
});

test('failed sends are collected into one owner alert', async () => {
  const planned = await plan([row({})]);
  const [alert] = await runCode(wf, 'Collect failures', {
    input: [{ error: 'Invalid To header' }],
    nodes: { Config: [configOf(wf)], 'Plan reminders': planned },
  });
  assert.match(alert.subject, /1 reminder email\(s\) failed/);
  assert.match(alert.html, /dana@client\.com.*Invalid To header/s);
});
