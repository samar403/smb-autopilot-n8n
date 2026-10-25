// Builds one summary email for the owner: what was sent today, how much is
// overdue in total, and which sheet rows need fixing.
// @include lib/dates.js
// @include lib/text.js
// @include lib/invoices.js

const cfg = $('Config').first().json;
const today = $now.toISODate();
const sent = $input.all().map((_, i) => $('Plan reminders').itemMatching(i).json);

const overdue = {};
let overdueCount = 0;
const problems = [];
for (const { json: row } of $('Read invoices').all()) {
  const values = Object.entries(row).filter(([k]) => k !== 'row_number').map(([, v]) => String(v ?? '').trim());
  if (values.every((v) => !v)) continue;
  const parsed = readInvoiceRow(row, cfg);
  if (!parsed.ok) {
    if (!parsed.closed) problems.push([row.invoice_id || `row ${row.row_number ?? '?'}`, parsed.reason]);
    continue;
  }
  if (daysBetween(parsed.invoice.due_date, today) > 0) {
    overdueCount += 1;
    overdue[parsed.invoice.currency] = (overdue[parsed.invoice.currency] || 0) + parsed.invoice.amount;
  }
}
const overdueText = Object.entries(overdue).map(([cur, amt]) => money(amt, cur, cfg.locale)).join(' + ') || money(0, cfg.default_currency, cfg.locale);
const testMode = sent.some((s) => s.test_mode);
const stageName = { 1: 'Friendly', 2: 'Firm', 3: 'Final' };

const parts = [];
if (testMode) parts.push('<p style="background:#fff7d6;padding:10px;border-radius:6px"><b>Test mode is on.</b> Every reminder below went to you instead of the client, and the sheet was not updated. Set <code>test_mode</code> to false in the Config node to go live.</p>');
parts.push(`<p>${sent.length} follow-up email(s) sent today. Total overdue: <b>${escapeHtml(overdueText)}</b> across ${overdueCount} invoice(s).</p>`);
parts.push(htmlTable(
  ['Client', 'Invoice', 'Amount', 'Days overdue', 'Reminder'],
  sent.map((s) => [s.client_name || s.client_email, s.invoice_id, s.amount_display, String(s.days_overdue), stageName[s.stage]]),
));
const finals = sent.filter((s) => s.stage === 3);
if (finals.length) parts.push(`<p><b>Final notices went out to:</b> ${escapeHtml(finals.map((s) => s.client_name || s.client_email).join(', '))}. Automated reminders stop here, so a personal call is the next step.</p>`);
if (problems.length) {
  parts.push('<p><b>Rows the autopilot skipped</b> (fix these in the sheet):</p>');
  parts.push(htmlTable(['Invoice', 'Problem'], problems.slice(0, 50)));
}

return [{
  json: {
    to: cfg.owner_email,
    subject: `${testMode ? '[TEST] ' : ''}Invoice follow-ups: ${sent.length} sent, ${overdueText} overdue`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111827">${parts.join('\n')}</div>`,
  },
}];
