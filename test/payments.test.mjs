import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkflow, configOf, runCode, mockNow, leftoverPlaceholders } from './harness.mjs';

const reminders = loadWorkflow('03-payment-reminders');
const stripe = loadWorkflow('04-stripe-failed-payment');
const errors = loadWorkflow('00-error-alerts');
const now = mockNow('2026-10-21T10:00:00');
const inDays = (n) => new Date(Date.UTC(2026, 9, 21) + n * 86400000).toISOString().slice(0, 10);
const row = (over) => ({
  invoice_id: 'INV-9', client_name: 'Lee Chen', client_email: 'lee@chen.co', client_phone: '+1 (555) 010-7788',
  amount: 480, currency: 'USD', due_date: inDays(3), status: 'Sent', payment_link: 'https://pay.example/9',
  reminder_stage: 0, pre_due_reminders: '', ...over,
});
const plan = (rows, cfg = {}) => runCode(reminders, 'Plan payment reminders', { input: rows, nodes: { Config: [configOf(reminders, cfg)] }, now });

test('reminds 3 days out and logs the offset', async () => {
  const [r] = await plan([row({})], { test_mode: false });
  assert.equal(r.to, 'lee@chen.co');
  assert.equal(r.subject, 'Reminder: invoice INV-9 is due in 3 days');
  assert.equal(r.pre_due_reminders, '3');
  assert.deepEqual(leftoverPlaceholders(r.subject + r.html + r.sms_text), []);
});

test('nothing too early, nothing twice, nothing once overdue or in follow-up', async () => {
  assert.equal((await plan([row({ due_date: inDays(5) })])).length, 0);
  assert.equal((await plan([row({ due_date: inDays(1), pre_due_reminders: '3' })])).length, 0);
  assert.equal((await plan([row({ due_date: inDays(-1) })])).length, 0);
  assert.equal((await plan([row({ due_date: inDays(2), reminder_stage: 1 })])).length, 0);
});

test('due-day reminder, and catch-up after a missed run sends one email not two', async () => {
  const [a] = await plan([row({ due_date: inDays(0), pre_due_reminders: '3' })]);
  assert.match(a.subject, /INV-9 is due today/);
  assert.equal(a.pre_due_reminders, '3,0');
  const caught = await plan([row({ due_date: inDays(0), pre_due_reminders: '' })]);
  assert.equal(caught.length, 1);
  assert.equal(caught[0].pre_due_reminders, '3,0');
  const [b] = await plan([row({ due_date: inDays(1) })]);
  assert.match(b.subject, /due tomorrow/);
});

test('SMS only when enabled and the number is valid; test mode texts the owner', async () => {
  assert.equal((await plan([row({})]))[0].sms_to, '');
  const [live] = await plan([row({})], { sms_enabled: true, test_mode: false });
  assert.equal(live.sms_to, '+15550107788');
  assert.match(live.sms_text, /^Acme Plumbing: invoice INV-9 for \$480\.00 is due in 3 days\. https:\/\/pay\.example\/9 Reply STOP/);
  assert.equal((await plan([row({ client_phone: '555-0100' })], { sms_enabled: true, test_mode: false }))[0].sms_to, '');
  assert.equal((await plan([row({})], { sms_enabled: true, owner_phone: '+44 7700 900123' }))[0].sms_to, '+447700900123');
});

const failedEvent = (over = {}) => ({
  id: 'evt_1', type: 'invoice.payment_failed',
  data: { object: { id: 'in_1', number: 'A1B2-0003', customer_email: 'pat@shop.co', customer_name: 'Pat Kim', customer_phone: '+15550104444', amount_due: 4900, amount_remaining: 4900, currency: 'usd', attempt_count: 1, next_payment_attempt: 1761400000, hosted_invoice_url: 'https://invoice.stripe.com/i/abc', ...over } },
});

test('Stripe failed payment: customer email with fix link, owner alert, amounts in major units', async () => {
  const cfg = configOf(stripe, { test_mode: false, sms_enabled: true });
  const [m] = await runCode(stripe, 'Prepare messages', { input: [cfg], nodes: { Config: [cfg], 'Stripe payment failed': [failedEvent()] } });
  assert.equal(m.to, 'pat@shop.co');
  assert.equal(m.subject, 'Your payment to Acme Plumbing did not go through');
  assert.match(m.html, /\$49\.00 for invoice A1B2-0003/);
  assert.match(m.html, /href="https:\/\/invoice\.stripe\.com\/i\/abc"/);
  assert.match(m.html, /try again on/);
  assert.equal(m.sms_to, '+15550104444');
  assert.match(m.owner_subject, /Payment failed: Pat Kim - \$49\.00/);
  assert.deepEqual(leftoverPlaceholders(m.html + m.subject + m.sms_text), []);
});

test('Stripe: zero-decimal currencies and missing customer email', async () => {
  const cfg = configOf(stripe, { test_mode: false });
  const [jpy] = await runCode(stripe, 'Prepare messages', { input: [cfg], nodes: { Config: [cfg], 'Stripe payment failed': [failedEvent({ currency: 'jpy', amount_due: 5000, amount_remaining: 5000 })] } });
  assert.match(jpy.html, /¥5,000/);
  const [none] = await runCode(stripe, 'Prepare messages', { input: [cfg], nodes: { Config: [cfg], 'Stripe payment failed': [failedEvent({ customer_email: null })] } });
  assert.equal(none.to, 'you@example.com');
  assert.match(none.subject, /^\[NO CUSTOMER EMAIL -> unknown\]/);
});

test('error alert explains execution and trigger failures in plain English', async () => {
  const cfg = configOf(errors);
  const execErr = { execution: { id: '231', url: 'https://n8n.example/execution/231', error: { message: 'invalid_grant: Token has been expired or revoked.' }, lastNodeExecuted: 'Read invoices', mode: 'trigger' }, workflow: { id: '1', name: 'SMB Autopilot · Invoice follow-ups' } };
  const [a] = await runCode(errors, 'Format alert', { input: [cfg], nodes: { Config: [cfg], 'When a workflow fails': [execErr] } });
  assert.equal(a.subject, 'Automation problem: "SMB Autopilot · Invoice follow-ups" stopped at Read invoices');
  assert.match(a.html, /needs to be reconnected/);
  assert.match(a.html, /execution\/231/);
  const trigErr = { trigger: { error: { message: 'getaddrinfo ENOTFOUND api.stripe.com' } }, workflow: { name: 'SMB Autopilot · Stripe failed-payment recovery' } };
  const [b] = await runCode(errors, 'Format alert', { input: [cfg], nodes: { Config: [cfg], 'When a workflow fails': [trigErr] } });
  assert.match(b.subject, /stopped at its trigger/);
  assert.match(b.html, /temporarily unreachable/);
});
