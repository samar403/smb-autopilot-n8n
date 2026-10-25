// Decides which invoices get a "coming up" or "due today" reminder.
// remind_days_before = "3,0" means: once when 3 or fewer days remain, and again
// on the due date. Sent offsets are logged in the pre_due_reminders column, so a
// missed day (server down, weekend) is caught up without double-sending.
// Overdue invoices are left to the "Invoice follow-ups" workflow.
// @include lib/dates.js
// @include lib/text.js
// @include lib/invoices.js

const cfg = $('Config').first().json;
const today = $now.toISODate();
const testMode = cfg.test_mode === true || String(cfg.test_mode).toLowerCase() === 'true';
const smsEnabled = cfg.sms_enabled === true || String(cfg.sms_enabled).toLowerCase() === 'true';
const offsets = [...new Set(String(cfg.remind_days_before || '3,0').split(',').map((s) => parseInt(s, 10)).filter((n) => n >= 0))].sort((a, b) => b - a);
const isPhone = (p) => /^\+[1-9]\d{7,14}$/.test(String(p).replace(/[\s().-]/g, ''));

const out = [];
$input.all().forEach((item, index) => {
  const parsed = readInvoiceRow(item.json, cfg);
  if (!parsed.ok) return;
  const inv = parsed.invoice;
  const daysUntil = daysBetween(today, inv.due_date);
  if (daysUntil < 0 || inv.reminder_stage > 0) return;

  const done = new Set(inv.pre_due_reminders.split(/[,\s]+/).filter(Boolean).map(Number));
  const reached = offsets.filter((k) => daysUntil <= k);
  if (!reached.some((k) => !done.has(k))) return;

  const vars = invoiceVars(inv, cfg, today);
  vars.due_phrase = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
  const dueToday = daysUntil === 0;
  const subject = fill(dueToday ? cfg.due_today_subject : cfg.upcoming_subject, vars);
  const phone = inv.client_phone.replace(/[\s().-]/g, '');
  const smsTo = !smsEnabled ? '' : testMode ? (isPhone(cfg.owner_phone) ? String(cfg.owner_phone).replace(/[\s().-]/g, '') : '') : isPhone(phone) ? phone : '';

  out.push({
    json: {
      invoice_id: inv.invoice_id,
      client_name: inv.client_name,
      client_email: inv.client_email,
      amount_display: vars.amount,
      days_until_due: daysUntil,
      to: testMode ? cfg.owner_email : inv.client_email,
      subject: testMode ? `[TEST -> ${inv.client_email}] ${subject}` : subject,
      html: emailHtml({
        bodyText: fill(dueToday ? cfg.due_today_body : cfg.upcoming_body, vars),
        buttonLabel: `Pay ${vars.amount}`,
        buttonUrl: inv.payment_link,
        footer: `${cfg.business_name} · Invoice ${inv.invoice_id}`,
      }),
      sms_to: smsTo,
      sms_text: fill(cfg.sms_template, vars).replace(/\s+/g, ' ').trim().slice(0, 320),
      pre_due_reminders: [...new Set([...done, ...reached])].sort((a, b) => b - a).join(','),
      test_mode: testMode,
    },
    pairedItem: { item: index },
  });
});

return out;
