# The offer: "SMB Autopilot" setup service

**One line:** *I set up the automations that get small businesses paid faster and answer
every lead within a minute. On your accounts, tested before anything reaches a customer,
working in a week.*

The workflows are free (or cheap) to download. You sell the hour of work most owners will
never do themselves: connecting accounts, writing in their voice, mapping their forms, testing
safely, and being the person they call when Google disconnects.

## Who buys

Owner-run businesses with 1–25 people that invoice customers or take inquiries through a website:

- Trades and home services (plumbers, electricians, HVAC, cleaners, landscapers)
- Agencies, consultants, bookkeepers, IT support (invoice-heavy)
- Clinics, studios, tutors, coaches (recurring payments, many inquiries)
- Small B2B suppliers and wholesalers (net-30 invoices)

**Buying signals:** "I spend Friday chasing invoices", "we lose leads when we're on a job",
an invoice spreadsheet, a Stripe account, a contact form that emails a shared inbox.

## Packages

Suggested starting prices in USD for international clients. Adjust for your market, and raise
them once you have three case studies.

| | **Starter** | **Cash-Flow Pack** | **Full Autopilot** |
|---|---|---|---|
| Workflows | Any one | Invoice follow-ups + Payment reminders + Stripe recovery | All four |
| Error alerts | ✓ | ✓ | ✓ |
| Copy written in their voice | ✓ | ✓ | ✓ + Claude reply tuning |
| Form / sheet mapping | Standard | Their invoice sheet or export | Any form tool + invoice data |
| Test run with their real data | ✓ | ✓ | ✓ |
| Handoff call + recorded walkthrough | 30 min | 45 min | 60 min |
| Support after launch | 14 days | 30 days | 30 days |
| **Price** | **$450** | **$1,200** | **$1,900** |
| Delivery | 3 business days | 5 business days | 7 business days |

**Care plan: $149/month.** Monitoring of error alerts, reconnecting expired credentials, wording
and threshold changes, one small new automation per quarter, and n8n upgrades with a re-test.
This is where the recurring revenue is: offer it at handoff, when the value is most obvious.

**Add-ons:** QuickBooks/Xero/Zoho invoice sync instead of a sheet ($400–800), WhatsApp via
approved Twilio templates ($300+), a CRM instead of a Leads sheet ($300–600), extra form ($100).

## Why the price is easy to justify

Use the client's own numbers on the call, worked out live with them. For example:

- *"You have about $9,000 outstanding past 30 days. If consistent follow-ups bring in even a
  third of it two weeks sooner, that is roughly $3,000 of cash you are not waiting for, every
  month."*
- *"You get about 40 inquiries a month and reply to most within a day. How many of those hire
  whoever answers first? If an instant reply wins you one extra $600 job a month, the setup
  pays for itself in three months."*

Do not quote industry statistics you cannot source. The client's own numbers are more persuasive anyway.

## How it is delivered (and the licensing rule you must follow)

n8n is "fair-code" under the **Sustainable Use License**. Its text allows use
*"only for your own internal business purposes"*. In practice:

- ✅ **The client owns the n8n instance**: their own n8n Cloud account, or a server in their
  name. They pay n8n directly. You are invited as a collaborator and build there.
- ✅ Building, configuring and maintaining workflows for a client on *their* instance is
  ordinary consulting work.
- ✅ Selling or giving away your workflow JSON (this pack) is fine. It is your work, not n8n's
  software.
- ❌ **Do not run one n8n instance that hosts several clients** and charge for it. That is
  providing n8n as a service and needs a commercial agreement with n8n (Embed or Enterprise).
- If you want to offer fully managed hosting later, **ask n8n's sales team first** and get the
  answer in writing.

This also suits the client. Their customer data stays in their Google, Stripe and n8n accounts.
If you part ways, everything keeps running without you.

## What the client pays others (tell them up front)

| Service | Typical cost |
|---|---|
| n8n Cloud, or a small server for self-hosting | n8n's current plan price (check n8n.io/pricing), or about $5–20/month for a VPS |
| Google Workspace / Gmail, Sheets | usually already paid |
| Anthropic API (lead replies, optional) | Roughly 1–2 cents per reply on Claude Opus 5.5 (the default; about 700 input and up to 800 output tokens at $4 / $20 per million), well under a cent on Claude Haiku 5.5. These are estimates, so check the client's first month of usage. |
| Twilio SMS (optional) | per-message pricing by country, plus a number |
| Stripe | no extra cost for the webhook |

## Guarantee

*"Nothing reaches your customers until you have seen it. Everything starts in test mode, where
every email comes to you first. If the automations are not working as agreed at handoff, I
keep working at no charge until they are."*

This costs you little because test mode exists, and it removes the main fear: *"what if it
emails my best client something stupid?"*

## Compliance notes to cover with every client

- Reminder and receipt emails are transactional, but they still need the business's real
  name and a way to reply. The templates sign off from a real person.
- **SMS: only text people who agreed to receive texts** (TCPA in the US, similar rules
  elsewhere). Keep "Reply STOP to opt out" in the SMS template.
- The lead auto-reply goes only to people who just contacted the business. Do not use the
  Leads sheet for marketing blasts without consent.
- This is not legal advice. Clients in regulated fields (health, finance) should check their own rules.
