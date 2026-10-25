export const slug = '04-stripe-failed-payment';

export default function build({ createBuilder, code, assignments, conditions }) {
  const b = createBuilder(slug);
  const cfg = (field) => `={{ $('Config').first().json.${field} }}`;

  b.sticky(`## Stripe failed-payment recovery
When a card payment on a Stripe invoice or subscription fails, the customer gets a friendly email (and optional SMS) with a link to fix it, and you get an alert.

**Setup (10 min)**
1. Connect a Stripe credential (secret key) on the trigger. n8n registers the webhook in Stripe when you activate, so n8n must be reachable from the internet.
2. Fill in **Config** and connect Gmail.
3. SMS optional: connect Twilio and set **sms_enabled = true**, or deactivate "Send SMS".
4. Use **test_mode = true** while testing; Stripe's "Send test webhook" works for this.

Tip: switch off Stripe's own failed-payment emails (Settings → Billing → Customer emails) if you want only these.`, [-460, 100], { width: 400, height: 480, color: 4 });

  b.node('Stripe payment failed', 'stripeTrigger', 1, {
    events: ['invoice.payment_failed'],
  }, [0, 340], { webhook: true });

  b.node('Config', 'set', 3.4, {
    assignments: assignments(slug, 'Config', [
      ['business_name', 'Acme Plumbing'],
      ['sender_name', 'Jordan at Acme Plumbing'],
      ['owner_email', 'you@example.com'],
      ['owner_phone', ''],
      ['test_mode', true],
      ['locale', 'en-US'],
      ['customer_subject', 'Your payment to {business_name} did not go through'],
      ['customer_body', 'Hi {first_name},\n\nWe tried to collect {amount} for invoice {invoice_id}, but the payment was declined. This usually happens when a card expires or a bank blocks the charge, and it takes a minute to fix.\n\nPlease use the button below to update your payment details. {retry_line}\n\nThanks,\n{sender_name}'],
      ['sms_enabled', false],
      ['twilio_from', '+15550001234'],
      ['sms_template', '{business_name}: your payment of {amount} did not go through. Update your details here: {payment_link} Reply STOP to opt out.'],
    ]),
    options: {},
  }, [220, 340]);

  b.node('Prepare messages', 'code', 2, { jsCode: code('payment-failed.js') }, [440, 340]);

  b.node('Email the customer', 'gmail', 2.1, {
    sendTo: '={{ $json.to }}',
    subject: '={{ $json.subject }}',
    emailType: 'html',
    message: '={{ $json.html }}',
    options: { appendAttribution: false, senderName: cfg('sender_name') },
  }, [680, 240]);

  b.node('Text the customer?', 'if', 2.2, {
    conditions: conditions(slug, 'Text the customer?', [
      { leftValue: "={{ $('Prepare messages').item.json.sms_to }}", rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } },
    ]),
    options: {},
  }, [900, 240]);

  b.node('Send SMS', 'twilio', 1, {
    from: cfg('twilio_from'),
    to: "={{ $('Prepare messages').item.json.sms_to }}",
    message: "={{ $('Prepare messages').item.json.sms_text }}",
    options: {},
  }, [1120, 220], { onError: 'continueRegularOutput' });

  b.node('Alert owner', 'gmail', 2.1, {
    sendTo: cfg('owner_email'),
    subject: '={{ $json.owner_subject }}',
    emailType: 'html',
    message: '={{ $json.owner_html }}',
    options: { appendAttribution: false, senderName: 'SMB Autopilot' },
  }, [680, 460]);

  b.chain('Stripe payment failed', 'Config', 'Prepare messages', 'Email the customer', 'Text the customer?');
  b.connect('Text the customer?', 'Send SMS', { output: 0 });
  b.connect('Prepare messages', 'Alert owner');

  return b.workflow('SMB Autopilot · Stripe failed-payment recovery', {
    description: 'Emails and texts customers a fix-your-card link when a Stripe invoice payment fails, and alerts the owner.',
  });
}
