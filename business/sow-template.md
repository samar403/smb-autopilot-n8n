# Statement of work: automation setup

*Template, not legal advice. Have it reviewed for your country before first use.*

**Provider:** [Your name / business], [email]
**Client:** [Business name], [contact], [email]
**Date:** [date]

## 1. What will be delivered

[Package name] consisting of:

- [ ] Invoice follow-ups: three-step overdue reminder emails plus a daily owner summary
- [ ] Payment reminders: before-due and due-day reminders by email [and SMS]
- [ ] Lead auto-reply: instant reply to website inquiries [written by Claude AI from facts the Client approves], lead log, owner alert
- [ ] Stripe failed-payment recovery: customer email [and SMS] with payment link, owner alert
- [x] Error alerts: email to the Client when an automation fails

Each automation is configured with the Client's business details and wording, connected to
the Client's accounts, tested in test mode with the Client's sign-off, then switched on.

## 2. Where it runs

All automations run in the **Client's own n8n account** and use the **Client's own** Google,
Stripe, Twilio and Anthropic accounts. The Client pays those providers directly. The Provider
receives collaborator access for the project and, if a care plan is purchased, for its
duration. The Provider does not store the Client's customer data outside those accounts.

## 3. Client responsibilities

- Provide the information in the setup questionnaire within [5] business days.
- Join two short screen-shares to connect accounts (the Provider never asks for passwords).
- Review and approve the test emails before go-live.
- Keep invoice statuses up to date (marking invoices Paid stops reminders).
- Text only customers who agreed to receive SMS.

## 4. Timeline

Test mode ready within [5] business days of receiving the questionnaire and account access.
Go-live on the Client's approval.

## 5. Price and payment

[Package]: [amount] — 50% on signing, 50% at go-live.
Optional care plan: [amount]/month, cancel any time with 30 days' notice. Covers monitoring,
credential reconnection, wording and threshold changes, n8n upgrades with re-testing, and
[one small new automation per quarter].

## 6. Support and warranty

[14/30] days after go-live, the Provider fixes any automation that does not work as described in §1, at no charge.
Changes to scope (new tools, new automations) are quoted separately.

## 7. Limits

The automations send messages based on the data in the Client's accounts. The Provider is not
responsible for messages sent because of incorrect data (for example, an invoice left as Unpaid
after payment). Third-party services (Google, Stripe, Twilio, Anthropic, n8n) may change or
suffer outages beyond the Provider's control. AI-written replies are generated from the facts
the Client approves and fall back to a fixed template when the AI is unavailable.

## 8. Ownership

The Client owns their configured workflows and all data. The Provider may reuse the underlying
general-purpose templates for other clients, without the Client's data or wording.

Signed: ____________________ (Provider)   ____________________ (Client)
