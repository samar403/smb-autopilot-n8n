// Decides which overdue invoices get their next follow-up today.
// Sequence: stage 1 (friendly) -> stage 2 (firm) -> stage 3 (final), never
// skipping a stage, and never closer together than min_days_between_reminders.
// Edit the wording in the "Config" node, not here.
// @include lib/dates.js
// @include lib/text.js
// @include lib/invoices.js

const cfg = $('Config').first().json;
const today = $now.toISODate();
const testMode = cfg.test_mode === true || String(cfg.test_mode).toLowerCase() === 'true';
const minGap = Number(cfg.min_days_between_reminders) || 0;
const stages = [1, 2, 3].map((n) => ({
  stage: n,
  afterDays: Number(cfg[`stage${n}_after_days`]),
  subject: cfg[`stage${n}_subject`],
  body: cfg[`stage${n}_body`],
}));

const out = [];
$input.all().forEach((item, index) => {
  const parsed = readInvoiceRow(item.json, cfg);
  if (!parsed.ok) return;
  const inv = parsed.invoice;
  const daysOverdue = daysBetween(inv.due_date, today);
  const next = stages[inv.reminder_stage]; // reminder_stage 0 -> stage 1, 3 -> done
  if (!next || daysOverdue < next.afterDays) return;
  if (inv.last_reminder_at && daysBetween(inv.last_reminder_at, today) < minGap) return;

  const vars = invoiceVars(inv, cfg, today);
  const subject = fill(next.subject, vars);
  out.push({
    json: {
      invoice_id: inv.invoice_id,
      client_name: inv.client_name,
      client_email: inv.client_email,
      amount_display: vars.amount,
      days_overdue: daysOverdue,
      stage: next.stage,
      to: testMode ? cfg.owner_email : inv.client_email,
      subject: testMode ? `[TEST -> ${inv.client_email}] ${subject}` : subject,
      html: emailHtml({
        bodyText: fill(next.body, vars),
        buttonLabel: `Pay ${vars.amount}`,
        buttonUrl: inv.payment_link,
        footer: `${cfg.business_name} · Invoice ${inv.invoice_id}`,
      }),
      new_stage: next.stage,
      last_reminder_at: today,
      test_mode: testMode,
    },
    pairedItem: { item: index },
  });
});

return out;
