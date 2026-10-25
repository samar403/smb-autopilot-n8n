export const slug = '01-invoice-followups';

export default function build({ createBuilder, code, assignments, conditions, sheetColumns, rl }) {
  const b = createBuilder(slug);
  const cfg = (field) => `={{ $('Config').first().json.${field} }}`;

  b.sticky(`## Invoice follow-ups
Chases overdue invoices from a Google Sheet with a polite 3-step sequence, then emails you a daily summary.

**Setup (10 min)**
1. Copy the Invoices sheet template and paste its URL into **Config → sheet_url**.
2. Fill in the rest of **Config** (business name, your email, wording).
3. Connect Google Sheets + Gmail credentials.
4. Run once with **test_mode = true**: every email comes to you.
5. Set **test_mode = false** and activate.

Mark an invoice **Paid** in the sheet and the reminders stop.`, [-460, 120], { width: 400, height: 420, color: 4 });

  b.sticky(`### Edit only this node
All settings and email wording live here. Placeholders: {first_name} {client_name} {invoice_id} {amount} {due_date} {days_overdue} {business_name} {sender_name} {payment_instructions}`, [140, 80], { width: 260, height: 200, color: 6 });

  b.node('Every weekday at 9am', 'scheduleTrigger', 1.2, {
    rule: { interval: [{ field: 'cronExpression', expression: '0 9 * * 1-5' }] },
  }, [0, 340]);

  b.node('Config', 'set', 3.4, {
    assignments: assignments(slug, 'Config', [
      ['business_name', 'Acme Plumbing'],
      ['sender_name', 'Jordan at Acme Plumbing'],
      ['owner_email', 'you@example.com'],
      ['sheet_url', 'https://docs.google.com/spreadsheets/d/PASTE_YOUR_SHEET_ID/edit'],
      ['invoices_tab', 'Invoices'],
      ['test_mode', true],
      ['locale', 'en-US'],
      ['default_currency', 'USD'],
      ['date_format', 'MM/DD/YYYY'],
      ['min_days_between_reminders', 5],
      ['payment_instructions', 'You can pay online with the button below, or by bank transfer quoting the invoice number.'],
      ['stage1_after_days', 3],
      ['stage1_subject', 'Friendly reminder: invoice {invoice_id} ({amount})'],
      ['stage1_body', 'Hi {first_name},\n\nHope all is well. A quick reminder that invoice {invoice_id} for {amount} was due on {due_date}. If it is already on its way, thank you, and please ignore this note.\n\n{payment_instructions}\n\nThanks,\n{sender_name}'],
      ['stage2_after_days', 10],
      ['stage2_subject', 'Following up: invoice {invoice_id} is {days_overdue} days overdue'],
      ['stage2_body', 'Hi {first_name},\n\nI am following up on invoice {invoice_id} for {amount}, which was due on {due_date} and is now {days_overdue} days overdue. Could you let me know when we can expect payment? If anything about the invoice looks wrong, just reply and I will sort it out.\n\n{payment_instructions}\n\nThank you,\n{sender_name}'],
      ['stage3_after_days', 21],
      ['stage3_subject', 'Final reminder: invoice {invoice_id} ({amount})'],
      ['stage3_body', 'Hi {first_name},\n\nInvoice {invoice_id} for {amount} is now {days_overdue} days overdue. This is our last automated reminder. Please arrange payment this week, or reply with a date that works for you, and {business_name} will follow up personally.\n\n{payment_instructions}\n\nRegards,\n{sender_name}'],
    ]),
    options: {},
  }, [220, 340]);

  b.node('Read invoices', 'googleSheets', 4.5, {
    operation: 'read',
    documentId: rl.url(cfg('sheet_url')),
    sheetName: rl.name(cfg('invoices_tab')),
    options: { outputFormatting: { values: { general: 'UNFORMATTED_VALUE', date: 'SERIAL_NUMBER' } } },
  }, [440, 340]);

  b.node('Plan reminders', 'code', 2, { jsCode: code('invoice-plan.js') }, [660, 340]);

  b.node('Send reminder', 'gmail', 2.1, {
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
  }, [1120, 200]);

  b.node('Update invoice row', 'googleSheets', 4.5, {
    operation: 'update',
    documentId: rl.url(cfg('sheet_url')),
    sheetName: rl.name(cfg('invoices_tab')),
    columns: sheetColumns({
      invoice_id: "={{ $('Plan reminders').item.json.invoice_id }}",
      reminder_stage: "={{ $('Plan reminders').item.json.new_stage }}",
      last_reminder_at: "={{ $('Plan reminders').item.json.last_reminder_at }}",
    }, { matchingColumns: ['invoice_id'] }),
    options: { cellFormat: 'RAW' },
  }, [1360, 180]);

  b.node('Build owner digest', 'code', 2, { jsCode: code('invoice-digest.js') }, [1120, 400]);

  b.node('Email owner digest', 'gmail', 2.1, {
    sendTo: '={{ $json.to }}',
    subject: '={{ $json.subject }}',
    emailType: 'html',
    message: '={{ $json.html }}',
    options: { appendAttribution: false, senderName: 'SMB Autopilot' },
  }, [1360, 400]);

  b.node('Collect failures', 'code', 2, { jsCode: code('collect-failures.js', { PLAN_NODE: 'Plan reminders' }) }, [1120, 600]);

  b.node('Alert owner: failed sends', 'gmail', 2.1, {
    sendTo: '={{ $json.to }}',
    subject: '={{ $json.subject }}',
    emailType: 'html',
    message: '={{ $json.html }}',
    options: { appendAttribution: false, senderName: 'SMB Autopilot' },
  }, [1360, 600]);

  b.chain('Every weekday at 9am', 'Config', 'Read invoices', 'Plan reminders', 'Send reminder');
  b.connect('Send reminder', 'Live mode?', { output: 0 });
  b.connect('Send reminder', 'Build owner digest', { output: 0 });
  b.connect('Send reminder', 'Collect failures', { output: 1 });
  b.connect('Live mode?', 'Update invoice row', { output: 0 });
  b.chain('Build owner digest', 'Email owner digest');
  b.chain('Collect failures', 'Alert owner: failed sends');

  return b.workflow('SMB Autopilot · Invoice follow-ups', {
    description: 'Chases overdue invoices from a Google Sheet with a friendly, firm, final email sequence and a daily owner digest.',
  });
}
