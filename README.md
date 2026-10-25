# SMB Autopilot for n8n

Ready-made n8n workflows that get small businesses paid faster and answer every lead in
under a minute. Import, edit one Config node, connect accounts, test safely, go live.

| Workflow | Trigger | What it does | Accounts |
|---|---|---|---|
| **01 Invoice follow-ups** | Weekdays 9:00 | Friendly → firm → final emails for overdue invoices in a Google Sheet, plus a daily owner digest | Google Sheets, Gmail |
| **02 Lead auto-reply** | Website form webhook | Cleans and logs the lead, Claude drafts a reply from your business facts (template fallback), alerts the owner | Google Sheets, Gmail, Anthropic (optional) |
| **03 Payment reminders** | Daily 10:00 | Before-due and due-today reminders by email, plus optional SMS | Google Sheets, Gmail, Twilio (optional) |
| **04 Stripe failed-payment recovery** | Stripe webhook | Email and SMS with a fix-your-card link, owner alert | Stripe, Gmail, Twilio (optional) |
| **00 Error alerts** | Any workflow fails | Plain-English alert with a link to the failed run | Gmail |

**Quick start:** [docs/setup-guide.md](docs/setup-guide.md). Importable files are in [`workflows/`](workflows/).

## Built to be safe for a real business

- **Test mode is on by default.** Every customer email and text goes to the owner, tagged
  `[TEST -> customer@…]`, and the sheet is not modified until you switch it off.
- **One node to edit.** All settings and wording live in each workflow's *Config* node.
- **Never contacts the wrong people.** Only explicitly open invoices get reminders. Paid, paused,
  disputed and blank-status rows are skipped and listed in the digest for fixing.
- **Failures are loud.** A bounced email triggers an owner alert and is retried next run. Any
  crash sends a plain-English alert.
- **Optional pieces really are optional.** No AI or no SMS: deactivate one node and the workflow
  keeps working (disabled n8n nodes pass items through).
- **No surprise branding.** Gmail's "sent automatically with n8n" footer is switched off.

## Compatibility and verification

Every node is pinned to the lowest typeVersion that does the job, so the same files import
on **n8n 1.80 (Feb 2025) through 2.43 (Oct 2026)**, on Cloud or self-hosted.

| Check | Result |
|---|---|
| Schema validation against the real node catalogs of n8n 1.80.0, 1.100.0, 1.123.85, 2.43.8 | 5/5 workflows valid |
| Code-node logic tests (26 cases: escalation, gaps, date formats, currencies, form mapping, AI fallback, Stripe amounts…) | 26/26 pass |
| Imported and executed inside real n8n 2.43.8 with stand-ins for credentialed nodes | 13/13 checks pass |

Runtime execution was done on 2.43.8 only. Older versions are covered by schema validation.

## How n8n works under the hood

[docs/n8n-node-system.md](docs/n8n-node-system.md) explains the node catalog, typeVersions,
`displayOptions`, expressions, paired items and error outputs, as worked out while building
this pack, with tools to reproduce each claim.

## Repository layout

```
workflows/          importable n8n JSON (generated, do not edit by hand)
src/workflows/      workflow definitions in JS
src/code/           Code-node bodies; lib/ helpers are inlined at build time
templates/          Google Sheet headers and a sample lead payload
tools/              build, validate, describe a node, fetch n8n schemas
test/               logic tests (node:test) and runtime/run.mjs (real n8n)
docs/               setup guide and the n8n internals write-up
business/           service offer, delivery playbook, intake, SOW, outreach, publishing copy
```

## Development

Node 20+. No dependencies.

```bash
npm run catalog     # download node schemas for n8n 1.80 / 1.100 / 1.123 / 2.43 into .catalog/
npm run check       # build + validate + logic tests
node tools/describe.mjs gmail 2.1 operation=send   # inspect any node's parameters

# optional: execute every workflow inside a real n8n install
N8N_BIN=/path/to/node_modules/n8n/bin/n8n N8N_USER_FOLDER=/tmp/n8n-test npm run test:runtime
```

To change a workflow, edit `src/` and run `npm run check`, then re-import the JSON.

## Selling setup as a service

[`business/`](business/) has the packages and pricing, delivery checklist, client questionnaire,
statement-of-work template, outreach scripts and template-listing copy. Read the licensing
section of [business/offer.md](business/offer.md) first: under n8n's Sustainable Use License,
the client should own the n8n instance you build on.

## License

MIT for this pack (see [LICENSE](LICENSE)). n8n itself is licensed separately by n8n GmbH
under its Sustainable Use License.
