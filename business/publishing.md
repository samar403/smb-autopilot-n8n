# Publishing the workflows

Three channels, in this order. Replace `[your link]` with your booking page or landing page.

## 1. GitHub (the whole pack)

This folder is ready to push as a public repository: MIT license, README, importable
`workflows/*.json`, docs, tests and validator. Suggested name: `smb-autopilot-n8n`.
Add the topics `n8n`, `n8n-workflow`, `automation`, `small-business`, `invoicing`.

```bash
git init && git add . && git commit -m "SMB Autopilot pack v1.0"
gh repo create smb-autopilot-n8n --public --source . --push
```

`.catalog/` (downloaded n8n schemas) is git-ignored. Anyone can rebuild it with `npm run catalog`.

## 2. n8n template library

Submit each workflow separately through n8n's creator programme (see n8n.io → Creators for the
current process and guidelines). Before submitting, check that:

- the sticky notes explain setup (they do)
- there are no credentials in the JSON (there aren't)
- the Config values are placeholders (they are)
- the workflow has been run once on a current n8n version (see `test/runtime/run.mjs`)

Paste-ready copy:

### Invoice follow-ups: polite 3-step reminders from Google Sheets

**Who it's for:** small businesses that track invoices in a spreadsheet and are tired of chasing.

**What it does:** every weekday morning it reads your Invoices sheet and emails clients whose
invoices are overdue: a friendly note at 3 days, a firmer one at 10, a final one at 21. Stages are
never skipped and emails are spaced at least 5 days apart. Mark an invoice *Paid* and it stops.
You get one digest: what went out, the total overdue, and rows to fix.

**Setup:** copy the sheet template, paste its URL and your wording into the Config node, connect
Google Sheets and Gmail, run in test mode (every email comes to you), then go live.

**Works on:** n8n 1.80+ and 2.x. Want it set up for you? [your link]

### Lead auto-reply: answer every website inquiry in under a minute (Claude + fallback)

**Who it's for:** service businesses that lose leads by answering hours later.

**What it does:** your website form posts to a webhook. The workflow cleans up the fields (works with
Contact Form 7, Elementor, Webflow, Typeform, Jotform, Tally and plain HTML), filters spam,
logs the lead to Google Sheets, has Claude draft a short personal reply using **only** the
business facts you provide, and emails it from your Gmail. If the AI is unavailable or declines,
a template reply goes out instead. You get an alert with the lead's details and one-click reply.

**Setup:** fill in Config (business facts, hours, tone), connect Sheets, Gmail and Anthropic, and paste the
webhook URL into your form. No AI? Deactivate one node.

**Works on:** n8n 1.80+ and 2.x. Want it set up for you? [your link]

### Payment reminders: before-due nudges by email and SMS

**Who it's for:** businesses with recurring or scheduled payments (retainers, tuition, rent, installment plans).

**What it does:** reminds clients 3 days before and on the due date (configurable) by email, plus
an optional SMS via Twilio, from the same Invoices sheet. Sent reminders are logged in the
sheet, so missed runs catch up without double-sending.

**Works on:** n8n 1.80+ and 2.x. Want it set up for you? [your link]

### Stripe failed-payment recovery: email + SMS with a fix-your-card link

**Who it's for:** businesses billing subscriptions or invoices through Stripe.

**What it does:** when a Stripe invoice payment fails, the customer gets a friendly email (and
optional SMS) with the hosted invoice link to update their card and the next retry date. You get an alert.

**Works on:** n8n 1.80+ and 2.x. Want it set up for you? [your link]

## 3. Your landing page

The landing page summarises the pack and the setup packages and ends with a booking button.
Put the same link at the end of every template listing.
