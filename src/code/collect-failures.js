// Gathers every email that failed to send into one alert for the owner.
// Items arrive on the email node's error output: { error } plus a link back to
// the planned reminder they came from.
// @include lib/text.js

const cfg = $('Config').first().json;
const rows = $input.all().map((item, i) => {
  const planned = $('__PLAN_NODE__').itemMatching(i).json;
  const err = item.json.error;
  const message = typeof err === 'string' ? err : err?.message || JSON.stringify(err ?? item.json).slice(0, 300);
  return [planned.client_name || '', planned.client_email || planned.to || '', planned.invoice_id || '', message];
});

return [{
  json: {
    to: cfg.owner_email,
    subject: `Action needed: ${rows.length} reminder email(s) failed to send`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111827">
<p>These reminders did not go out, so the sheet was left unchanged for them and they will be retried on the next run. A bad email address is the usual cause.</p>
${htmlTable(['Client', 'Email', 'Invoice', 'Error'], rows)}
</div>`,
  },
}];
