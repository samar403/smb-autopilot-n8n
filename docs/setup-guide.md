# Setup guide

About an hour for the whole pack, less for a single workflow. Works on n8n Cloud and on
self-hosted n8n 1.80 or newer (including 2.x).

## 0. Before you start

| You need | Used by |
|---|---|
| An n8n instance **owned by the business** (n8n Cloud account, or a server in their name) | everything |
| A Google account with Gmail and Google Sheets | 01, 02, 03, error alerts |
| Anthropic API key (optional) | 02, for Claude-written replies |
| Twilio account with an SMS-capable number (optional) | 03, 04 |
| Stripe account (optional) | 04 |

**Set the timezone first:** each workflow's *Settings → Timezone* (or the instance's
`GENERIC_TIMEZONE`). Schedules and "today" both follow it.

## 1. Import

1. In n8n: **Workflows → Add workflow → ⋯ → Import from file** and pick a file from `workflows/`.
2. Import `00-error-alerts.json` first, set its Config `owner_email`, connect Gmail, and save it.
3. Import the workflows you want. In each one: **Settings → Error workflow → SMB Autopilot · Error alerts**.

Every workflow has exactly one node to edit, **Config**. Wording, thresholds, sheet links
and switches all live there. The yellow sticky note on the canvas repeats these steps.

## 2. Connect credentials

Open each node with a red warning and pick or create the credential:

| Credential | How |
|---|---|
| Google Sheets / Gmail | *Sign in with Google* (n8n Cloud) or a Google OAuth client (self-hosted; see n8n docs "Google OAuth2") |
| Anthropic | API key from console.anthropic.com |
| Twilio | Account SID + Auth Token |
| Stripe | Secret key (a restricted key with read access to invoices, customers and webhook endpoints is enough) |

If only one credential of a type exists, n8n selects it automatically.

## 3. The Invoices sheet (workflows 01 and 03)

Create a Google Sheet with a tab named `Invoices` and these headers. Import
`templates/invoices-sheet.csv` to get them with example rows:

| Column | Notes |
|---|---|
| `invoice_id` | Unique, required. Used to find the row when updating. |
| `client_name`, `client_email` | Email must be valid or the row is skipped and reported. |
| `client_phone` | Optional, international format (`+15550101111`) for SMS. |
| `amount`, `currency` | Plain number. Currency defaults to Config `default_currency`. |
| `due_date` | A date cell, or text as `YYYY-MM-DD`. Text like `31/10/2026` follows Config `date_format`. |
| `status` | **Unpaid / Sent / Open / Due / Overdue / Partial** get reminders. **Paid / Void / Cancelled / Disputed / Paused / Refunded / Draft** never do. Blank = skipped and reported. |
| `payment_link` | Optional. Becomes a "Pay" button in every email. |
| `reminder_stage`, `last_reminder_at` | Written by *Invoice follow-ups*. Leave empty for new invoices. |
| `pre_due_reminders` | Written by *Payment reminders*. Leave empty. |

To stop all reminders for an invoice, set its status to `Paid` (or `Paused` while you sort
something out).

## 4. Per-workflow notes

### 01 Invoice follow-ups (weekdays 9:00)

- Sequence: stage 1 after `stage1_after_days` (3), stage 2 after 10, stage 3 (final) after 21.
  Stages are never skipped, and at least `min_days_between_reminders` (5) days pass between emails.
- You get one digest per run: what went out, total overdue per currency, and rows to fix.
- Failed sends (bad address) trigger a separate alert, and those rows are retried next run.

### 02 Lead auto-reply (instant)

1. Open **Lead form webhook** and copy the **Production URL**.
2. Send your form submissions there as a POST. Common setups:
   - WordPress (Contact Form 7 / WPForms / Elementor): a webhook add-on pointed at the URL
   - Webflow: Site settings → Forms → webhook, or Logic
   - Typeform / Jotform / Tally / Fillout: Integrations → Webhooks
   - Custom HTML: `fetch(url, { method: 'POST', body: new FormData(form) })`
3. Field names are matched automatically (`name`, `your-name`, `First Name` + `Last Name`,
   `email`, `phone`, `message`, `comments`, `service`, `subject`, …). Add a hidden empty field
   named `_gotcha` as a spam honeypot.
4. Test with the sample payload:

   ```bash
   curl -X POST "<test or production URL>" -H "Content-Type: application/json" -d @templates/sample-lead.json
   ```

5. **Business facts matter.** Claude is told to use only what is in `business_facts`. List services,
   areas, hours, how pricing works, and what you never promise by email.
6. Claude model: `ai_model` defaults to `claude-opus-5-5`. For lower cost per reply,
   `claude-haiku-5-5` also works. If the API errors, declines, or returns something unusable,
   the template reply is sent instead. **No AI at all:** deactivate *Draft reply with Claude*.
7. The same email address gets at most one auto-reply per day (double-submits, impatient
   resubmits). Every lead is still logged in the `Leads` tab (`templates/leads-sheet.csv`).

### 03 Payment reminders (daily 10:00)

- `remind_days_before` = `3,0` sends one reminder when 3 or fewer days remain and another on the due date.
  If a run is missed, the next run catches up with a single email.
- Stops once the invoice is overdue or *Invoice follow-ups* has started on it.
- SMS: set `sms_enabled = true` and `twilio_from`. Only valid `+` numbers are texted. In test
  mode, texts go to `owner_phone`. **No SMS:** deactivate *Send SMS*.
- WhatsApp through Twilio needs pre-approved message templates for business-initiated messages.
  Treat it as custom work.

### 04 Stripe failed-payment recovery (instant)

- Fires on `invoice.payment_failed` (subscriptions and Stripe invoices). The customer gets the
  hosted invoice link to update their card, plus the next retry date when Stripe has one.
- Activating the workflow registers the webhook in Stripe. Use Stripe's *Send test webhook* to try it.
- To avoid double emails, turn off Stripe's own failed-payment emails, or keep both on purpose.

## 5. Go live

1. With `test_mode = true` (the default), run each workflow (*Execute workflow*, or a test
   form submission). **Every customer email and text goes to you**, subjects are tagged
   `[TEST -> customer@…]`, and the invoice sheet is not modified.
2. Check the wording, links and digest.
3. Set `test_mode = false` in each Config and **activate** the workflow (toggle, top right).

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| Error alert says "reconnect" / `invalid_grant` | Google tokens expire if the OAuth app is in testing mode. Reconnect, or publish the OAuth app. |
| Emails end with "sent automatically with n8n" | You replaced a Gmail node. Set *Options → Append n8n attribution* off. |
| A row never gets reminders | Read the digest's "rows the autopilot skipped" list: usually status, email or date format. |
| Reminder dates are a day off | Workflow timezone is not the business's timezone. |
| Webhook returns 404 | The workflow is not active (production URL) or not listening (test URL). |
