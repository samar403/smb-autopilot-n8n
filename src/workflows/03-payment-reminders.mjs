export const slug = '03-payment-reminders';

export default function build({ createBuilder, code, assignments, conditions, sheetColumns, rl }) {
  const b = createBuilder(slug);
  const cfg = (field) => `={{ $('Config').first().json.${field} }}`;
  const plan = (field) => `={{ $('Plan payment reminders').item.json.${field} }}`;

  b.sticky(`## Payment reminders
Nudges clients **before** an invoice is due (default: 3 days before and on the day) by email, plus optional SMS. Uses the same Invoices sheet as "Invoice follow-ups", which takes over once a due date passes.

**Setup (10 min)**
1. Paste your Invoices sheet URL into **Config → sheet_url**.
2. Connect Google Sheets + Gmail.
3. SMS: connect Twilio, set **sms_enabled = true** and **twilio_from**. No SMS? Deactivate "Send SMS" (select it, press D).
4. Test with **test_mode = true**, then set it to false and activate.`, [-460, 120], { width: 400, height: 440, color: 4 });

  b.node('Every day at 10am', 'scheduleTrigger', 1.2, {
    rule: { interval: [{ field: 'cronExpression', expression: '0 10 * * *' }] },
  }, [0, 340]);

  b.node('Config', 'set', 3.4, {
    assignments: assignments(slug, 'Config', [
      ['business_name', 'Acme Plumbing'],
      ['sender_name', 'Jordan at Acme Plumbing'],
      ['owner_email', 'you@example.com'],
      ['owner_phone', ''],
      ['sheet_url', 'https://docs.google.com/spreadsheets/d/PASTE_YOUR_SHEET_ID/edit'],
      ['invoices_tab', 'Invoices'],
      ['test_mode', true],
      ['locale', 'en-US'],
      ['default_currency', 'USD'],
      ['date_format', 'MM/DD/YYYY'],
      ['remind_days_before', '3,0'],
      ['payment_instructions', 'You can pay online with the button below, or by bank transfer quoting the invoice number.'],
      ['upcoming_subject', 'Reminder: invoice {invoice_id} is due {due_phrase}'],
      ['upcoming_body', 'Hi {first_name},\n\nJust a heads-up that invoice {invoice_id} for {amount} is due {due_phrase} ({due_date}).\n\n{payment_instructions}\n\nThanks,\n{sender_name}'],
      ['due_today_subject', 'Invoice {invoice_id} is due today'],
      ['due_today_body', 'Hi {first_name},\n\nA quick reminder that invoice {invoice_id} for {amount} is due today. If you have already paid, thank you, and please ignore this message.\n\n{payment_instructions}\n\nThanks,\n{sender_name}'],
      ['sms_enabled', false],
      ['twilio_from', '+15550001234'],
      ['sms_template', '{business_name}: invoice {invoice_id} for {amount} is due {due_phrase}. {payment_link} Reply STOP to opt out.'],
    ]),
    options: {},
  }, [220, 340]);

  b.node('Read invoices', 'googleSheets', 4.5, {
    operation: 'read',
    documentId: rl.url(cfg('sheet_url')),
    sheetName: rl.name(cfg('invoices_tab')),
    options: { outputFormatting: { values: { general: 'UNFORMATTED_VALUE', date: 'SERIAL_NUMBER' } } },
  }, [440, 340]);

  b.node('Plan payment reminders', 'code', 2, { jsCode: code('payment-plan.js') }, [660, 340]);

  b.node('Send reminder email', 'gmail', 2.1, {
    sendTo: '={{ $json.to }}',
    subject: '={{ $json.subject }}',
    emailType: 'html',
    message: '={{ $json.html }}',
    options: { appendAttribution: false, senderName: cfg('sender_name') },
  }, [880, 340], { onError: 'continueErrorOutput' });

  b.node('Live mode?', 'if', 2.2, {
    conditions: conditions(slug, 'Live mode?', [
      { leftValue: cfg('test_mode'), rightValue: '', operator: { type: 'boolean', operation: 'false', singleValue: true } },
    ]),
    options: {},
  }, [1120, 180]);

  b.node('Log reminder in sheet', 'googleSheets', 4.5, {
    operation: 'update',
    documentId: rl.url(cfg('sheet_url')),
    sheetName: rl.name(cfg('invoices_tab')),
    columns: sheetColumns({
      invoice_id: plan('invoice_id'),
      pre_due_reminders: plan('pre_due_reminders'),
    }, { matchingColumns: ['invoice_id'] }),
    options: { cellFormat: 'RAW' },
  }, [1360, 160]);

  b.node('Text the client?', 'if', 2.2, {
    conditions: conditions(slug, 'Text the client?', [
      { leftValue: plan('sms_to'), rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } },
    ]),
    options: {},
  }, [1120, 400]);

  b.node('Send SMS', 'twilio', 1, {
    from: cfg('twilio_from'),
    to: plan('sms_to'),
    message: plan('sms_text'),
    options: {},
  }, [1360, 380], { onError: 'continueRegularOutput' });

  b.node('Collect failures', 'code', 2, { jsCode: code('collect-failures.js', { PLAN_NODE: 'Plan payment reminders' }) }, [1120, 620]);

  b.node('Alert owner: failed sends', 'gmail', 2.1, {
    sendTo: '={{ $json.to }}',
    subject: '={{ $json.subject }}',
    emailType: 'html',
    message: '={{ $json.html }}',
    options: { appendAttribution: false, senderName: 'SMB Autopilot' },
  }, [1360, 620]);

  b.chain('Every day at 10am', 'Config', 'Read invoices', 'Plan payment reminders', 'Send reminder email');
  b.connect('Send reminder email', 'Live mode?', { output: 0 });
  b.connect('Send reminder email', 'Text the client?', { output: 0 });
  b.connect('Send reminder email', 'Collect failures', { output: 1 });
  b.connect('Live mode?', 'Log reminder in sheet', { output: 0 });
  b.connect('Text the client?', 'Send SMS', { output: 0 });
  b.chain('Collect failures', 'Alert owner: failed sends');

  return b.workflow('SMB Autopilot · Payment reminders', {
    description: 'Sends before-due and due-today payment reminders by email and SMS from the shared Invoices sheet.',
  });
}
