import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkflow, configOf, runCode, mockNow, leftoverPlaceholders } from './harness.mjs';

const wf = loadWorkflow('02-lead-auto-reply');
const tuesday10am = mockNow('2026-10-20T10:15:00');
const sunday = mockNow('2026-10-25T10:15:00');
const hook = (body, extra = {}) => ({ headers: { origin: 'https://acme.example' }, params: {}, query: {}, body, ...extra });

async function normalize(body, { cfg = {}, now = tuesday10am, extra } = {}) {
  const config = configOf(wf, cfg);
  const [lead] = await runCode(wf, 'Normalize lead', { input: [config], nodes: { Config: [config], 'Lead form webhook': [hook(body, extra)] }, now });
  return lead;
}

test('maps Contact Form 7 style fields', async () => {
  const lead = await normalize({ 'your-name': 'maria lopez', 'your-email': 'Maria@Example.com ', 'your-subject': 'Water heater', 'your-message': 'No hot water since yesterday.' });
  assert.equal(lead.name, 'maria lopez');
  assert.equal(lead.first_name, 'Maria');
  assert.equal(lead.email, 'maria@example.com');
  assert.equal(lead.service, 'Water heater');
  assert.equal(lead.valid, true);
  assert.equal(lead.spam, false);
  assert.equal(lead.source, 'https://acme.example');
});

test('joins first/last name fields and reads nested payloads', async () => {
  const lead = await normalize({ data: { fields: { 'First Name': 'Sam', 'Last Name': 'Lee', Email: 'sam@lee.io', Phone: '+1 555 0100', Details: 'Quote for a bathroom refit' } } });
  assert.equal(lead.name, 'Sam Lee');
  assert.equal(lead.phone, '+1 555 0100');
  assert.equal(lead.message, 'Quote for a bathroom refit');
});

test('accepts a raw JSON string body', async () => {
  const lead = await normalize(JSON.stringify({ name: 'Ann', email: 'ann@x.co', message: 'hi' }));
  assert.equal(lead.email, 'ann@x.co');
});

test('flags honeypot and link-stuffed submissions as spam, bad emails as invalid', async () => {
  assert.equal((await normalize({ name: 'Bot', email: 'b@b.co', _gotcha: 'x' })).spam, true);
  assert.equal((await normalize({ name: 'Bot', email: 'b@b.co', message: 'http://a http://b http://c' })).spam, true);
  const bad = await normalize({ name: 'Ann', email: 'ann@' });
  assert.equal(bad.valid, false);
  assert.match(bad.reject_reason, /invalid email/);
});

test('knows business hours and builds a once-a-day dedupe key', async () => {
  assert.equal((await normalize({ email: 'a@b.co' })).in_hours, true);
  assert.equal((await normalize({ email: 'a@b.co' }, { now: sunday })).in_hours, false);
  assert.equal((await normalize({ email: 'a@b.co' }, { now: mockNow('2026-10-20T19:30:00') })).in_hours, false);
  assert.equal((await normalize({ email: 'A@B.co' })).dedupe_key, 'a@b.co|2026-10-20');
});

test('Claude request: current API version, no sampling params, fallback only where supported', async () => {
  const opus = await normalize({ name: 'Ann', email: 'ann@x.co', message: 'Leaking pipe under the sink' });
  assert.equal(opus.ai_request.model, 'claude-opus-5-5');
  assert.equal(opus.ai_request.max_tokens, 16000);
  assert.deepEqual(opus.ai_request.output_config, { effort: 'low' });
  assert.equal(opus.ai_request.fallbacks, 'default');
  assert.equal(opus.ai_headers['anthropic-version'], '2026-10-21');
  assert.equal(opus.ai_headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  for (const k of ['temperature', 'top_p', 'top_k']) assert.equal(k in opus.ai_request, false);
  assert.match(opus.ai_request.messages[0].content, /<inquiry>[\s\S]*Leaking pipe under the sink[\s\S]*<\/inquiry>/);
  assert.match(opus.ai_request.system, /Licensed and insured residential plumber/);

  const haiku = await normalize({ email: 'ann@x.co' }, { cfg: { ai_model: 'claude-haiku-5-5' } });
  assert.deepEqual(haiku.ai_request.output_config, { effort: 'low' });
  assert.equal('fallbacks' in haiku.ai_request, false);
  assert.equal('anthropic-beta' in haiku.ai_headers, false);

  const old = await normalize({ email: 'ann@x.co' }, { cfg: { ai_model: 'claude-haiku-4-5' } });
  assert.equal('output_config' in old.ai_request, false);
});

async function compose(httpOutput, { cfg = {}, now = tuesday10am, body } = {}) {
  const lead = await normalize(body ?? { name: 'Maria Lopez', email: 'maria@example.com', service: 'Water heater', message: 'No hot water.' }, { cfg, now });
  const config = configOf(wf, cfg);
  const [out] = await runCode(wf, 'Compose reply', { input: [httpOutput ?? lead], nodes: { Config: [config], 'Normalize lead': [lead] }, now });
  return out;
}

const aiText = 'Hi Maria,\n\nSorry to hear the hot water is out. We repair and install water heaters, and a plumber can confirm the cause and price on site. Book a time that suits you and we will take it from there.\n\nJordan at Acme Plumbing, Acme Plumbing';

test('uses Claude text, skipping the empty thinking block that can come first', async () => {
  const out = await compose({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: aiText }], stop_reason: 'end_turn' }, { cfg: { test_mode: false } });
  assert.equal(out.reply_source, 'Claude');
  assert.equal(out.to, 'maria@example.com');
  assert.match(out.html, /Sorry to hear the hot water is out/);
  assert.match(out.owner_html, /Auto-reply<\/td><td[^>]*>Claude/);
});

test('falls back to the template when Claude declines, errors, rambles, or is switched off', async () => {
  assert.equal((await compose({ content: [{ type: 'text', text: aiText }], stop_reason: 'refusal' })).reply_source, 'template (Claude declined)');
  assert.equal((await compose({ error: { message: '401 invalid x-api-key' } })).reply_source, 'template (Claude unavailable)');
  assert.equal((await compose({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' })).reply_source, 'template (Claude reply unusable)');
  const off = await compose(undefined); // node deactivated: the lead passes straight through
  assert.equal(off.reply_source, 'template');
  assert.match(off.html, /Thanks for getting in touch about Water heater/);
  assert.match(off.html, /within the next hour/);
  assert.deepEqual(leftoverPlaceholders(off.html + off.subject), []);
});

test('after-hours template and test-mode routing', async () => {
  const out = await compose(undefined, { now: sunday });
  assert.match(out.html, /Our office is closed right now/);
  assert.equal(out.to, 'you@example.com');
  assert.match(out.subject, /^\[TEST -> maria@example\.com\] Thanks for contacting Acme Plumbing/);
  assert.match(out.owner_subject, /^New lead: Maria Lopez - Water heater/);
});
