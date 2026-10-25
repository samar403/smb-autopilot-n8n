// Shapes a Stripe "invoice.payment_failed" event into a customer email, an
// optional SMS, and an owner alert.
// @include lib/text.js

const cfg = $('Config').first().json;
const testMode = cfg.test_mode === true || String(cfg.test_mode).toLowerCase() === 'true';
const smsEnabled = cfg.sms_enabled === true || String(cfg.sms_enabled).toLowerCase() === 'true';
// Stripe amounts are in the smallest currency unit, except zero-decimal currencies.
const ZERO_DECIMAL = ['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'];
const isPhone = (p) => /^\+[1-9]\d{7,14}$/.test(String(p ?? '').replace(/[\s().-]/g, ''));

return $('Stripe payment failed').all().map((item, index) => {
  const event = item.json;
  const inv = event.data?.object ?? event;
  const currency = String(inv.currency || 'usd').toLowerCase();
  const amount = Number(inv.amount_remaining ?? inv.amount_due ?? 0) / (ZERO_DECIMAL.includes(currency) ? 1 : 100);
  const nextAttempt = inv.next_payment_attempt
    ? new Intl.DateTimeFormat(cfg.locale || 'en-US', { dateStyle: 'medium' }).format(new Date(inv.next_payment_attempt * 1000))
    : '';
  const customerEmail = String(inv.customer_email || '').trim();
  const vars = {
    first_name: firstName(inv.customer_name) || 'there',
    client_name: inv.customer_name || 'there',
    amount: money(amount, currency, cfg.locale),
    invoice_id: inv.number || inv.id || '',
    business_name: cfg.business_name,
    sender_name: cfg.sender_name,
    payment_link: inv.hosted_invoice_url || '',
    retry_line: nextAttempt ? `We'll automatically try again on ${nextAttempt}.` : '',
  };
  const subject = fill(cfg.customer_subject, vars);
  const phone = String(inv.customer_phone || '').replace(/[\s().-]/g, '');
  const smsTo = !smsEnabled ? '' : testMode ? (isPhone(cfg.owner_phone) ? String(cfg.owner_phone).replace(/[\s().-]/g, '') : '') : isPhone(phone) ? phone : '';
  const sendTo = testMode || !isEmail(customerEmail) ? cfg.owner_email : customerEmail;

  return {
    json: {
      to: sendTo,
      subject: sendTo !== customerEmail ? `[${testMode ? 'TEST' : 'NO CUSTOMER EMAIL'} -> ${customerEmail || 'unknown'}] ${subject}` : subject,
      html: emailHtml({
        bodyText: fill(cfg.customer_body, vars),
        buttonLabel: 'Update payment details',
        buttonUrl: vars.payment_link,
        footer: `${cfg.business_name} · Invoice ${vars.invoice_id}`,
      }),
      sms_to: smsTo,
      sms_text: fill(cfg.sms_template, vars).replace(/\s+/g, ' ').trim().slice(0, 320),
      owner_subject: `Payment failed: ${inv.customer_name || customerEmail || 'customer'} - ${vars.amount}`,
      owner_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111827">
<p>A card payment failed and the customer has been ${testMode ? '<b>(test mode: not)</b> ' : ''}emailed a link to fix it.</p>
${htmlTable(['Customer', 'Email', 'Amount', 'Invoice', 'Attempt', 'Next retry'], [[inv.customer_name || '-', customerEmail || '-', vars.amount, vars.invoice_id, String(inv.attempt_count ?? '-'), nextAttempt || 'none scheduled']])}
${vars.payment_link ? `<p><a href="${escapeHtml(vars.payment_link)}">Open the invoice in Stripe</a></p>` : ''}
</div>`,
    },
    pairedItem: { item: index },
  };
});
