// ---- invoice rows (shared helper, inlined at build time) ----
// One "Invoices" sheet drives both pre-due reminders and post-due follow-ups.
// Only rows whose status is explicitly open are ever contacted; a blank status
// is treated as "not ready" so a forgotten Paid mark never triggers a dunning email.
const OPEN_STATUSES = ['unpaid', 'open', 'sent', 'due', 'overdue', 'partial', 'partially paid'];
const CLOSED_STATUSES = ['paid', 'void', 'cancelled', 'canceled', 'disputed', 'paused', 'written off', 'refunded', 'draft'];

/** Normalise one sheet row. Returns { ok, reason, invoice }. */
function readInvoiceRow(row, cfg) {
  const status = String(row.status ?? '').trim().toLowerCase();
  const id = String(row.invoice_id ?? '').trim();
  if (!id) return { ok: false, reason: 'missing invoice_id', closed: false };
  if (CLOSED_STATUSES.includes(status)) return { ok: false, reason: `status ${status}`, closed: true };
  if (!OPEN_STATUSES.includes(status)) return { ok: false, reason: status ? `unknown status "${row.status}"` : 'blank status', closed: false };
  const email = String(row.client_email ?? '').trim();
  if (!isEmail(email)) return { ok: false, reason: email ? `bad email "${email}"` : 'missing client_email', closed: false };
  const due = toIsoDate(row.due_date, cfg.date_format);
  if (!due) return { ok: false, reason: `unreadable due_date "${row.due_date ?? ''}"`, closed: false };
  const amount = toAmount(row.amount);
  if (amount === null) return { ok: false, reason: `unreadable amount "${row.amount ?? ''}"`, closed: false };
  const currency = String(row.currency || cfg.default_currency || 'USD').trim().toUpperCase();
  return {
    ok: true,
    invoice: {
      invoice_id: id,
      client_name: String(row.client_name ?? '').trim(),
      client_email: email,
      client_phone: String(row.client_phone ?? '').trim(),
      amount,
      currency,
      due_date: due,
      payment_link: String(row.payment_link ?? '').trim(),
      reminder_stage: Math.max(0, Math.min(3, parseInt(row.reminder_stage, 10) || 0)),
      last_reminder_at: toIsoDate(row.last_reminder_at, 'YYYY-MM-DD'),
      pre_due_reminders: String(row.pre_due_reminders ?? '').trim(),
    },
  };
}

/** Placeholder values every template can use. */
function invoiceVars(inv, cfg, today) {
  const daysOverdue = daysBetween(inv.due_date, today);
  return {
    client_name: inv.client_name || 'there',
    first_name: firstName(inv.client_name) || 'there',
    invoice_id: inv.invoice_id,
    amount: money(inv.amount, inv.currency, cfg.locale),
    due_date: displayDate(inv.due_date, cfg.locale),
    days_overdue: Math.max(0, daysOverdue),
    days_until_due: Math.max(0, -daysOverdue),
    business_name: cfg.business_name,
    sender_name: cfg.sender_name,
    payment_link: inv.payment_link,
    payment_instructions: cfg.payment_instructions || '',
  };
}
