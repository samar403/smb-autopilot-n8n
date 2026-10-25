# Delivery playbook

The same five steps for every client. Aim for no more than 4 hours of your time on a
Cash-Flow Pack once you have done three.

## 1. Discovery call (20 min, free)

Goal: find the client's own money numbers and confirm fit. Ask:

1. How do you send invoices today? Where is the list of who owes what?
2. Roughly how much is overdue right now? Who chases it, and how often?
3. How do inquiries come in (website form, email, Facebook, phone)? Who answers, and how fast?
4. Do you take card payments or subscriptions through Stripe?
5. Do you already have n8n, Zapier or Make? (If Zapier, they already understand the value.)

Close with: *"Based on what you said, the Cash-Flow Pack fits. I can have it running in test mode by
<date>. Want me to send the agreement and the setup checklist?"*

**Do not take the job if:** the client wants mass marketing emails, has no record at all of who owes
what, or needs medical or legal advice handled by AI.

## 2. Intake (client: 30 min, async)

Send `intake-questionnaire.md` and the SOW (`sow-template.md`). Ask for:

- An n8n account in **their** name (help them sign up for n8n Cloud on a short call if needed), with you
  invited as a member
- A copy of their invoice list, or edit access to it
- Their logo, sign-off name, and two or three real emails they have sent customers (to match their voice)
- Their form tool login, or the developer who can paste in a webhook URL

Take 50% upfront, 50% at handoff.

## 3. Build (2–3 hours)

1. Import `00-error-alerts.json`, then the purchased workflows. Set the error workflow on each.
2. Set the workflow timezone.
3. Create the Invoices and/or Leads sheet from `templates/`, or map their existing sheet:
   rename columns to match, or add the missing ones (`reminder_stage`, `last_reminder_at`,
   `pre_due_reminders`).
4. Fill in every Config node. Rewrite the email copy in their voice, using their real emails as reference.
5. Connect credentials **while logged in as them** (screen share), so you never hold their passwords.
6. For the lead workflow, write `business_facts` with them: services, areas, hours, how
   pricing works, what they never promise in writing.

## 4. Test (1 hour, still `test_mode = true`)

- [ ] Invoice follow-ups: put 3 dummy invoices (4, 12 and 25 days overdue) at the top of
      the sheet. Run. Check the three emails and the digest in **your** inbox, then delete the dummy rows.
- [ ] Payment reminders: dummy invoices due in 3 days and today. Run. Check email and SMS text.
- [ ] Lead auto-reply: submit their real website form three times: during hours, after hours,
      and with an invalid email. Check the reply, the owner alert, and the Leads row.
- [ ] Stripe: *Developers → Webhooks → Send test event* (`invoice.payment_failed`).
- [ ] Error alerts: temporarily break a credential, run, confirm the alert arrives, then fix it.
- [ ] Send the client screenshots of each email for sign-off.

## 5. Go live and hand off (45 min call)

1. With the client watching: set `test_mode = false`, activate each workflow.
2. Walk through, and record: where Config is, how to mark Paid, what the digest means, what an error alert looks like.
3. Send a one-page summary: what runs when, who to call, which accounts are involved.
4. Offer the care plan: *"Google disconnects every so often, wording needs updating,
   and n8n ships updates. For $149 a month I watch the alerts and handle all of that."*
5. Invoice the remaining 50%.

## After launch

- Day 7: send them a screenshot of the week's digest ("4 reminders out, $2,300 paid since").
  Ask for a testimonial while it is fresh.
- Day 30: ask for a referral to one other business owner.
- Keep a private changelog per client (what you changed and when) in the care-plan folder.
