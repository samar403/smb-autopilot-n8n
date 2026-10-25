#!/usr/bin/env node
// End-to-end check inside a real n8n install, without any real credentials.
//
// For each workflow it builds a test variant where:
//   - the trigger becomes a Code node (same name) that emits sample data,
//     started by a Manual Trigger so `n8n execute` can run it;
//   - Gmail / Google Sheets / Twilio / Anthropic nodes become Set nodes (same
//     name) whose fields are the original parameter expressions, so n8n's real
//     expression engine still resolves every $json / $('Node').item reference;
//   - "Send reminder" stand-ins throw for addresses containing "bounce", to
//     exercise the error-output branch for real.
// Then it imports the variants, executes them with `n8n execute --id`, and
// asserts on the run data.
//
//   N8N_BIN=/path/to/node_modules/n8n/bin/n8n N8N_USER_FOLDER=/tmp/n8n-test node test/runtime/run.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const N8N_BIN = process.env.N8N_BIN;
if (!N8N_BIN || !process.env.N8N_USER_FOLDER) {
  console.error('Set N8N_BIN (path to n8n/bin/n8n) and N8N_USER_FOLDER (a scratch folder).');
  process.exit(2);
}
const TZ = process.env.GENERIC_TIMEZONE || 'America/New_York';
const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const shift = (days) => {
  const [y, m, d] = todayIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
};

// ---- variant construction ---------------------------------------------------

const load = (slug) => JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', `${slug}.json`), 'utf8'));
let counter = 0;
const uid = () => `00000000-0000-4000-a000-${String(++counter).padStart(12, '0')}`;

/** Flatten a node's parameters into Set-node assignments that n8n will evaluate. */
function asSetNode(node, extra = [], { passThrough = false } = {}) {
  const fields = [];
  const walk = (value, key) => {
    if (typeof value === 'string') fields.push({ id: uid(), name: key, value, type: 'string' });
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (value.__rl) return;
      if (key === 'columns' && value.value) { for (const [k, v] of Object.entries(value.value)) walk(v, `col_${k}`); return; }
      for (const [k, v] of Object.entries(value)) walk(v, key ? `${key}_${k}` : k);
    }
  };
  walk(node.parameters, '');
  return {
    ...node,
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    parameters: {
      assignments: { assignments: [...fields, ...extra.map(([name, value, type = 'string']) => ({ id: uid(), name, value, type }))] },
      ...(passThrough ? { includeOtherFields: true } : {}),
      options: {},
    },
  };
}

const asCode = (node, jsCode, mode) => ({ ...node, type: 'n8n-nodes-base.code', typeVersion: 2, parameters: { ...(mode ? { mode } : {}), jsCode }, webhookId: undefined });

function variant(slug, id, { triggerName, sample, config = {}, replace = {} }) {
  const wf = load(slug);
  wf.id = id;
  wf.name = `[runtime test] ${wf.name}`;
  wf.nodes = wf.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote').map((node) => {
    if (node.name === triggerName) return asCode(node, `return ${JSON.stringify(sample)}.map((json) => ({ json }));`);
    if (node.name === 'Config') {
      for (const a of node.parameters.assignments.assignments) if (a.name in config) a.value = config[a.name];
      return node;
    }
    if (replace[node.name]) return replace[node.name](node);
    // Respond to Webhook v1.1 returns its input items unchanged (`return [items]`), so its stand-in must too.
    if (/respondToWebhook/.test(node.type)) return asSetNode(node, [], { passThrough: true });
    if (/gmail|googleSheets|twilio|httpRequest/.test(node.type)) return asSetNode(node, [['id', 'stub']]);
    return node;
  });
  wf.nodes.push({ parameters: {}, id: uid(), name: 'Run test', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [-240, 340] });
  wf.connections['Run test'] = { main: [[{ node: triggerName, type: 'main', index: 0 }]] };
  return wf;
}

const bouncingSend = (node) => asCode(node, `if (String($json.to).includes('bounce')) throw new Error('550 5.1.1 mailbox does not exist');\nreturn { json: { id: 'stub', to: $json.to, subject: $json.subject } };`, 'runOnceForEachItem');

const invoiceRows = [
  { row_number: 2, invoice_id: 'INV-101', client_name: 'Dana Smith', client_email: 'dana@client.test', amount: 1250, currency: 'USD', due_date: shift(-4), status: 'Unpaid', payment_link: 'https://pay.test/101', reminder_stage: '', last_reminder_at: '', client_phone: '', pre_due_reminders: '' },
  { row_number: 3, invoice_id: 'INV-102', client_name: 'Raj Patel', client_email: 'raj@client.test', amount: 640, currency: 'USD', due_date: shift(-12), status: 'Overdue', payment_link: '', reminder_stage: 1, last_reminder_at: shift(-6), client_phone: '', pre_due_reminders: '' },
  { row_number: 4, invoice_id: 'INV-103', client_name: 'Paid Co', client_email: 'paid@client.test', amount: 90, currency: 'USD', due_date: shift(-30), status: 'Paid', payment_link: '', reminder_stage: '', last_reminder_at: '', client_phone: '', pre_due_reminders: '' },
  { row_number: 5, invoice_id: 'INV-104', client_name: 'Bounce Ltd', client_email: 'bounce@client.test', amount: 300, currency: 'USD', due_date: shift(-25), status: 'Unpaid', payment_link: '', reminder_stage: 2, last_reminder_at: shift(-10), client_phone: '', pre_due_reminders: '' },
  { row_number: 6, invoice_id: 'INV-105', client_name: 'No Status', client_email: 'ns@client.test', amount: 50, currency: 'USD', due_date: shift(-5), status: '', payment_link: '', reminder_stage: '', last_reminder_at: '', client_phone: '', pre_due_reminders: '' },
  { row_number: 7, invoice_id: 'INV-201', client_name: 'Lee Chen', client_email: 'lee@client.test', amount: 480, currency: 'USD', due_date: shift(3), status: 'Sent', payment_link: 'https://pay.test/201', reminder_stage: 0, last_reminder_at: '', client_phone: '+1 555 010 7788', pre_due_reminders: '' },
  { row_number: 8, invoice_id: 'INV-202', client_name: 'Ama Owusu', client_email: 'ama@client.test', amount: 75.5, currency: 'USD', due_date: shift(0), status: 'Sent', payment_link: '', reminder_stage: 0, last_reminder_at: '', client_phone: '+447700900123', pre_due_reminders: '3' },
  { row_number: 9, invoice_id: 'INV-203', client_name: 'Too Early', client_email: 'early@client.test', amount: 10, currency: 'USD', due_date: shift(10), status: 'Sent', payment_link: '', reminder_stage: 0, last_reminder_at: '', client_phone: '', pre_due_reminders: '' },
];

const readInvoices = (node) => asCode(node, `return ${JSON.stringify(invoiceRows)}.map((json) => ({ json }));`);

const aiResponse = 'Hi Maria,\n\nSorry the hot water is out. We repair and replace water heaters, and a plumber will confirm the cause and the price on site before starting any work. We will call you first thing on the next business morning to arrange a visit.\n\nJordan at Acme Plumbing, Acme Plumbing';

const variants = [
  variant('01-invoice-followups', 'rtInvoiceFollowups', {
    triggerName: 'Every weekday at 9am',
    sample: [{ timestamp: new Date().toISOString() }],
    config: { test_mode: false, owner_email: 'owner@acme.test' },
    replace: { 'Read invoices': readInvoices, 'Send reminder': bouncingSend },
  }),
  variant('02-lead-auto-reply', 'rtLeadAutoReply', {
    triggerName: 'Lead form webhook',
    sample: [{ headers: { origin: 'https://acme.test' }, params: {}, query: {}, body: { 'your-name': 'Maria Lopez', 'your-email': `maria+${Date.now()}@lead.test`, 'your-subject': 'Water heater', 'your-message': 'No hot water since yesterday.' } }],
    config: { test_mode: false, owner_email: 'owner@acme.test' },
    replace: {
      'Draft reply with Claude': (node) => asSetNode(node, [
        ['content', `={{ [{ type: 'thinking', thinking: '' }, { type: 'text', text: ${JSON.stringify(aiResponse)} }] }}`, 'array'],
        ['stop_reason', 'end_turn'],
      ]),
    },
  }),
  variant('03-payment-reminders', 'rtPaymentReminders', {
    triggerName: 'Every day at 10am',
    sample: [{ timestamp: new Date().toISOString() }],
    config: { test_mode: false, sms_enabled: true, owner_email: 'owner@acme.test' },
    replace: { 'Read invoices': readInvoices, 'Send reminder email': bouncingSend },
  }),
  variant('04-stripe-failed-payment', 'rtStripeFailed', {
    triggerName: 'Stripe payment failed',
    sample: [{ id: 'evt_1', type: 'invoice.payment_failed', data: { object: { id: 'in_1', number: 'A1B2-0003', customer_email: 'pat@shop.test', customer_name: 'Pat Kim', customer_phone: '+15550104444', amount_due: 4900, amount_remaining: 4900, currency: 'usd', attempt_count: 2, next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 86400, hosted_invoice_url: 'https://invoice.stripe.test/i/abc' } } }],
    config: { test_mode: false, sms_enabled: true, owner_email: 'owner@acme.test' },
  }),
  variant('00-error-alerts', 'rtErrorAlerts', {
    triggerName: 'When a workflow fails',
    sample: [{ execution: { id: '231', url: 'https://n8n.test/workflow/1/executions/231', error: { message: 'invalid_grant: Token has been expired or revoked.' }, lastNodeExecuted: 'Read invoices', mode: 'trigger' }, workflow: { id: '1', name: 'SMB Autopilot · Invoice follow-ups' } }],
    config: { owner_email: 'owner@acme.test' },
  }),
];

// ---- import + execute -----------------------------------------------------------

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smbap-rt-'));
for (const wf of variants) fs.writeFileSync(path.join(outDir, `${wf.id}.json`), JSON.stringify(wf, null, 2));
// n8n 2.x prints `execute` results through its logger at info level, so force
// JSON-formatted info logs and pick the result out of the log stream.
const n8n = (args) => execFileSync(process.execPath, [N8N_BIN, ...args], {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, N8N_LOG_LEVEL: 'info', N8N_LOG_FORMAT: 'json' },
});

function parseExecution(stdout) {
  for (const line of stdout.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)) {
    if (!line.includes('resultData')) continue;
    try {
      const entry = JSON.parse(line);
      const message = typeof entry.message === 'string' ? entry.message : JSON.stringify(entry);
      return JSON.parse(message.slice(message.indexOf('{')));
    } catch { /* not the result line */ }
  }
  throw new Error(`no execution result found in output:\n${stdout.slice(-2000)}`);
}
console.log(`importing ${variants.length} variants from ${outDir}`);
n8n(['import:workflow', '--separate', `--input=${outDir}`]);

function execute(id) {
  let out;
  try {
    out = n8n(['execute', `--id=${id}`, '--rawOutput']);
  } catch (e) {
    throw new Error(`n8n execute failed for ${id}:\n${(e.stdout || '').slice(-3000)}\n${(e.stderr || '').slice(-3000)}`);
  }
  const data = parseExecution(out);
  if (data.status !== 'success') throw new Error(`${id} finished with status ${data.status}`);
  const runData = data.data.resultData.runData;
  return {
    ran: (name) => name in runData,
    items: (name, output = 0) => (runData[name]?.[0]?.data?.main?.[output] ?? []).map((i) => i.json),
    error: (name) => runData[name]?.[0]?.error,
  };
}

const results = [];
async function check(label, fn) {
  try { await fn(); results.push(['PASS', label]); } catch (e) { results.push(['FAIL', label, e.message]); }
}

console.log('executing 01 invoice follow-ups');
const r1 = execute('rtInvoiceFollowups');
await check('01: plans stage 1, 2 and 3 for the right invoices', () => {
  assert.deepEqual(r1.items('Plan reminders').map((i) => `${i.invoice_id}:${i.stage}`), ['INV-101:1', 'INV-102:2', 'INV-104:3']);
});
await check('01: bounced email goes to the error output, others succeed', () => {
  assert.equal(r1.items('Send reminder', 0).length, 2);
  assert.deepEqual(r1.items('Send reminder', 1).map((i) => typeof i.error === 'string' ? i.error : i.error?.message).length, 1);
});
await check('01: sheet update resolves $(Plan reminders).item through IF + Gmail', () => {
  assert.deepEqual(r1.items('Update invoice row').map((i) => `${i.col_invoice_id}:${i.col_reminder_stage}:${i.col_last_reminder_at}`), [`INV-101:1:${todayIso}`, `INV-102:2:${todayIso}`]);
});
await check('01: digest and failure alert reach the owner', () => {
  const [digest] = r1.items('Email owner digest');
  assert.equal(digest.sendTo, 'owner@acme.test');
  assert.match(digest.subject, /^Invoice follow-ups: 2 sent, \$2,190\.00 overdue$/);
  assert.match(digest.message, /INV-105.*blank status/s);
  const [alert] = r1.items('Alert owner: failed sends');
  assert.match(alert.message, /bounce@client\.test.*INV-104.*mailbox does not exist/s);
});

console.log('executing 02 lead auto-reply (twice, to test dedupe)');
const r2 = execute('rtLeadAutoReply');
await check('02: normalizes the form, acknowledges it, and logs the lead', () => {
  const [ack] = r2.items('Acknowledge form');
  assert.deepEqual(JSON.parse(ack.responseBody), { ok: true, message: 'Thanks, we received your message.' });
  const [log] = r2.items('Log lead');
  assert.equal(log.col_name, 'Maria Lopez');
  assert.equal(log.col_service, 'Water heater');
  assert.equal(log.col_status, 'New');
});
await check('02: Claude request body and headers evaluate to valid JSON', () => {
  const [draft] = r2.items('Draft reply with Claude');
  const body = JSON.parse(draft.jsonBody);
  const headers = JSON.parse(draft.jsonHeaders);
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(headers['anthropic-version'], '2026-10-21');
  assert.match(body.messages[0].content, /No hot water since yesterday/);
});
await check('02: Claude draft is sent to the lead and the owner is notified', () => {
  const [sent] = r2.items('Send auto-reply');
  assert.match(sent.sendTo, /^maria\+\d+@lead\.test$/);
  assert.match(sent.message, /Sorry the hot water is out/);
  const [owner] = r2.items('Notify owner');
  assert.equal(owner.subject, 'New lead: Maria Lopez - Water heater');
  assert.match(owner.options_replyTo, /^maria\+\d+@lead\.test$/);
  assert.match(owner.message, /Auto-reply<\/td><td[^>]*>Claude/);
});
const r2b = execute('rtLeadAutoReply');
await check('02: the same email on the same day is not answered twice', () => {
  assert.equal(r2b.items('Once per email per day').length, 0);
  assert.equal(r2b.ran('Send auto-reply'), false);
});

console.log('executing 03 payment reminders');
const r3 = execute('rtPaymentReminders');
await check('03: 3-days-out and due-today reminders, nothing too early', () => {
  assert.deepEqual(r3.items('Plan payment reminders').map((i) => `${i.invoice_id}:${i.days_until_due}`), ['INV-201:3', 'INV-202:0']);
});
await check('03: offsets logged back to the sheet', () => {
  assert.deepEqual(r3.items('Log reminder in sheet').map((i) => `${i.col_invoice_id}:${i.col_pre_due_reminders}`), ['INV-201:3', 'INV-202:3,0']);
});
await check('03: SMS goes to valid numbers with the rendered text', () => {
  const sms = r3.items('Send SMS');
  assert.deepEqual(sms.map((s) => s.to), ['+15550107788', '+447700900123']);
  assert.match(sms[0].message, /^Acme Plumbing: invoice INV-201 for \$480\.00 is due in 3 days\. https:\/\/pay\.test\/201 Reply STOP/);
});

console.log('executing 04 Stripe failed payment');
const r4 = execute('rtStripeFailed');
await check('04: customer email, SMS and owner alert', () => {
  const [mail] = r4.items('Email the customer');
  assert.equal(mail.sendTo, 'pat@shop.test');
  assert.match(mail.message, /\$49\.00 for invoice A1B2-0003/);
  assert.equal(r4.items('Send SMS')[0].to, '+15550104444');
  assert.match(r4.items('Alert owner')[0].subject, /Payment failed: Pat Kim - \$49\.00/);
});

console.log('executing 00 error alerts');
const r0 = execute('rtErrorAlerts');
await check('00: plain-English alert to the owner', () => {
  const [mail] = r0.items('Email the owner');
  assert.equal(mail.sendTo, 'owner@acme.test');
  assert.match(mail.subject, /stopped at Read invoices/);
  assert.match(mail.message, /needs to be reconnected/);
});

console.log('');
for (const [status, label, msg] of results) console.log(`${status}  ${label}${msg ? `\n      ${msg.split('\n').join('\n      ')}` : ''}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
const version = execFileSync(process.execPath, [N8N_BIN, '--version'], { encoding: 'utf8' }).trim().split(/\r?\n/).pop();
console.log(`\n${results.length - failed}/${results.length} runtime checks passed on n8n ${version}`);
process.exit(failed ? 1 : 0);
