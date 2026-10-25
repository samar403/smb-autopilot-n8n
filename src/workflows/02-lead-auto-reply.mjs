export const slug = '02-lead-auto-reply';

export default function build({ createBuilder, code, assignments, conditions, sheetColumns, rl }) {
  const b = createBuilder(slug);
  const cfg = (field) => `={{ $('Config').first().json.${field} }}`;

  b.sticky(`## Lead auto-reply
Replies to every website inquiry within a minute, logs it to a Leads sheet, and pings you with the details.

**Setup (15 min)**
1. Fill in **Config** (business facts matter: Claude only uses what you write there).
2. Connect Google Sheets, Gmail and Anthropic credentials.
3. Point your website form's webhook at this workflow's **Production URL** (open "Lead form webhook").
4. Send a test inquiry with **test_mode = true**.
5. Set **test_mode = false** and activate.

**No AI?** Deactivate "Draft reply with Claude" (select it, press D). The template replies take over.`, [-460, 120], { width: 400, height: 440, color: 4 });

  b.sticky(`### Claude drafts, rules decide
Claude writes a reply from your business facts only. If the API fails, declines, or returns something odd, the template from Config is sent instead, so a lead never goes unanswered.`, [1520, 120], { width: 300, height: 190, color: 6 });

  b.node('Lead form webhook', 'webhook', 2, {
    httpMethod: 'POST',
    path: 'smb-lead-intake',
    responseMode: 'responseNode',
    options: {},
  }, [0, 340], { webhook: true });

  b.node('Config', 'set', 3.4, {
    assignments: assignments(slug, 'Config', [
      ['business_name', 'Acme Plumbing'],
      ['sender_name', 'Jordan at Acme Plumbing'],
      ['owner_email', 'you@example.com'],
      ['business_phone', '(555) 010-2030'],
      ['booking_link', ''],
      ['leads_sheet_url', 'https://docs.google.com/spreadsheets/d/PASTE_YOUR_SHEET_ID/edit'],
      ['leads_tab', 'Leads'],
      ['test_mode', true],
      ['open_days', '1,2,3,4,5'],
      ['open_hour', 8],
      ['close_hour', 18],
      ['response_time_in_hours', 'within the next hour'],
      ['response_time_after_hours', 'first thing next business morning'],
      ['business_facts', 'Licensed and insured residential plumber serving Springfield and nearby towns since 2009.\nServices: leak and burst-pipe repair, water heaters (repair and install), drain cleaning, bathroom and kitchen plumbing.\nEmergency call-outs available 24/7 for active leaks.\nFree written estimates for jobs over $500. We do not quote prices by email; a plumber confirms the price on site before starting.'],
      ['reply_tone', 'warm, plain-spoken and professional; no hype, no exclamation marks'],
      ['ai_model', 'claude-opus-5-5'],
      ['reply_subject', 'Thanks for contacting {business_name}'],
      ['reply_in_hours', 'Hi {first_name},\n\nThanks for getting in touch about {service}. We have your message and someone from our team will contact you {response_time}.\n\nIf it is urgent, call us on {business_phone}.\n\n{sender_name}'],
      ['reply_after_hours', 'Hi {first_name},\n\nThanks for getting in touch about {service}. Our office is closed right now, and we will contact you {response_time}.\n\nIf it is an emergency, call us on {business_phone}.\n\n{sender_name}'],
    ]),
    options: {},
  }, [220, 340]);

  b.node('Normalize lead', 'code', 2, { jsCode: code('lead-normalize.js') }, [440, 340]);

  b.node('Acknowledge form', 'respondToWebhook', 1.1, {
    respondWith: 'json',
    responseBody: "={{ JSON.stringify({ ok: $json.valid, message: $json.valid ? 'Thanks, we received your message.' : 'Please enter a valid email address.' }) }}",
    options: {},
  }, [660, 340]);

  b.node('Real lead?', 'if', 2.2, {
    conditions: conditions(slug, 'Real lead?', [
      { leftValue: '={{ $json.valid }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } },
      { leftValue: '={{ $json.spam }}', rightValue: '', operator: { type: 'boolean', operation: 'false', singleValue: true } },
    ]),
    options: {},
  }, [880, 340]);

  b.node('Ignore invalid or spam', 'noOp', 1, {}, [1100, 520]);

  b.node('Once per email per day', 'removeDuplicates', 2, {
    operation: 'removeItemsSeenInPreviousExecutions',
    dedupeValue: '={{ $json.dedupe_key }}',
    options: {},
  }, [1100, 320]);

  b.node('Log lead', 'googleSheets', 4.5, {
    operation: 'append',
    documentId: rl.url(cfg('leads_sheet_url')),
    sheetName: rl.name(cfg('leads_tab')),
    columns: sheetColumns({
      received_at: '={{ $json.received_at }}',
      name: '={{ $json.name }}',
      email: '={{ $json.email }}',
      phone: '={{ $json.phone }}',
      company: '={{ $json.company }}',
      service: '={{ $json.service }}',
      message: '={{ $json.message }}',
      source: '={{ $json.source }}',
      in_hours: "={{ $json.in_hours ? 'yes' : 'no' }}",
      status: 'New',
    }),
    options: {},
  }, [1320, 320]);

  b.node('Draft reply with Claude', 'httpRequest', 4.2, {
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'anthropicApi',
    sendHeaders: true,
    specifyHeaders: 'json',
    jsonHeaders: "={{ JSON.stringify($('Normalize lead').item.json.ai_headers) }}",
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify($('Normalize lead').item.json.ai_request) }}",
    options: { timeout: 90000 },
  }, [1540, 320], { onError: 'continueRegularOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 3000 });

  b.node('Compose reply', 'code', 2, { mode: 'runOnceForEachItem', jsCode: code('lead-compose.js') }, [1760, 320]);

  b.node('Send auto-reply', 'gmail', 2.1, {
    sendTo: '={{ $json.to }}',
    subject: '={{ $json.subject }}',
    emailType: 'html',
    message: '={{ $json.html }}',
    options: { appendAttribution: false, senderName: cfg('sender_name') },
  }, [1980, 320], { onError: 'continueRegularOutput' });

  b.node('Notify owner', 'gmail', 2.1, {
    sendTo: cfg('owner_email'),
    subject: "={{ $('Compose reply').item.json.owner_subject }}{{ $json.error ? ' (auto-reply FAILED)' : '' }}",
    emailType: 'html',
    message: "={{ $('Compose reply').item.json.owner_html }}",
    options: { appendAttribution: false, senderName: 'SMB Autopilot', replyTo: "={{ $('Normalize lead').item.json.email }}" },
  }, [2200, 320]);

  b.chain('Lead form webhook', 'Config', 'Normalize lead', 'Acknowledge form', 'Real lead?');
  b.connect('Real lead?', 'Once per email per day', { output: 0 });
  b.connect('Real lead?', 'Ignore invalid or spam', { output: 1 });
  b.chain('Once per email per day', 'Log lead', 'Draft reply with Claude', 'Compose reply', 'Send auto-reply', 'Notify owner');

  return b.workflow('SMB Autopilot · Lead auto-reply', {
    description: 'Answers website inquiries in under a minute with a Claude-drafted (or template) reply, logs the lead and alerts the owner.',
  });
}
