// Picks the reply body (Claude's draft when it is usable, otherwise the template
// from Config) and builds both the customer reply and the owner alert.
// Runs once per lead. If "Draft reply with Claude" is deactivated, the lead
// passes straight through and the template is used.
// @include lib/text.js

const cfg = $('Config').first().json;
const lead = $('Normalize lead').item.json;
const testMode = cfg.test_mode === true || String(cfg.test_mode).toLowerCase() === 'true';

let aiText = '';
let replySource = 'template';
if (Array.isArray($json.content)) {
  if ($json.stop_reason === 'refusal') {
    replySource = 'template (Claude declined)';
  } else {
    // Responses can start with an (empty) thinking block, so collect text blocks by type.
    aiText = $json.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if ($json.stop_reason === 'max_tokens' || aiText.length < 40 || aiText.length > 2500) {
      replySource = 'template (Claude reply unusable)';
      aiText = '';
    } else {
      replySource = 'Claude';
    }
  }
} else if ($json.error) {
  replySource = 'template (Claude unavailable)';
}

const vars = {
  first_name: lead.first_name || 'there',
  name: lead.name || 'there',
  service: lead.service || 'your request',
  business_name: cfg.business_name,
  sender_name: cfg.sender_name,
  business_phone: cfg.business_phone || '',
  booking_link: cfg.booking_link || '',
  response_time: lead.in_hours ? cfg.response_time_in_hours : cfg.response_time_after_hours,
};
const bodyText = aiText || fill(lead.in_hours ? cfg.reply_in_hours : cfg.reply_after_hours, vars);
const subject = fill(cfg.reply_subject, vars);

const field = (label, value) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${label}</td><td style="padding:4px 0">${escapeHtml(value || '-')}</td></tr>`;
const ownerHtml = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111827">
${testMode ? '<p style="background:#fff7d6;padding:10px;border-radius:6px"><b>Test mode:</b> the auto-reply below was sent to you, not the lead.</p>' : ''}
<table style="border-collapse:collapse">
${field('Name', lead.name)}${field('Email', lead.email)}${field('Phone', lead.phone)}${field('Company', lead.company)}${field('Service', lead.service)}${field('Source', lead.source)}${field('Received', lead.received_at)}${field('Auto-reply', replySource)}
</table>
<p style="margin:16px 0 4px;color:#6b7280">Their message</p>
<blockquote style="margin:0;padding:8px 12px;border-left:3px solid #d1d5db">${textToHtml(lead.message || '(no message)')}</blockquote>
<p style="margin:16px 0 4px;color:#6b7280">What the autopilot replied</p>
<blockquote style="margin:0;padding:8px 12px;border-left:3px solid #1f6feb">${textToHtml(bodyText)}</blockquote>
<p style="margin:18px 0"><a href="mailto:${escapeHtml(lead.email)}?subject=${encodeURIComponent('Re: ' + subject)}">Reply to ${escapeHtml(lead.first_name || lead.email)}</a>${lead.phone ? ` · <a href="tel:${escapeHtml(lead.phone.replace(/[^+0-9]/g, ''))}">Call ${escapeHtml(lead.phone)}</a>` : ''}</p>
</div>`;

return {
  json: {
    to: testMode ? cfg.owner_email : lead.email,
    subject: testMode ? `[TEST -> ${lead.email}] ${subject}` : subject,
    html: emailHtml({
      bodyText,
      buttonLabel: 'Book a time',
      buttonUrl: cfg.booking_link,
      footer: `${cfg.business_name}${cfg.business_phone ? ' · ' + cfg.business_phone : ''}`,
    }),
    reply_source: replySource,
    owner_subject: `New lead: ${lead.name || lead.email}${lead.service ? ' - ' + lead.service : ''}`,
    owner_html: ownerHtml,
  },
};
