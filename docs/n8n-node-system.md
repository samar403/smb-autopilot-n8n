# How n8n's node system works

Notes from taking n8n apart to build this pack. Everything below was checked against the
published packages (`n8n@2.43.8`, `n8n-nodes-base@2.43.6`, `@n8n/n8n-nodes-langchain@2.43.6`),
the node catalogs of four releases (1.80.0, 1.100.0, 1.123.85, 2.43.8), and real executions
on a local n8n 2.43.8. The tools in `tools/` reproduce every claim.

## 1. Three layers

| Layer | What it is | Where it lives |
|---|---|---|
| **Node type** | Code plus a *description*: name, versions, inputs/outputs, credentials, parameter schema | `n8n-nodes-base`, `@n8n/n8n-nodes-langchain` (npm) |
| **Workflow** | JSON listing node *instances* (type, typeVersion, parameters, position) and the connections between them | The n8n database; export/import as `.json` |
| **Execution** | The engine walks the graph, passing arrays of items from node to node | `n8n-core`, run inside n8n (Code nodes run in a separate task-runner process) |

A template is only the middle layer. It is valid only if every instance matches a node
description that exists in the n8n version the customer runs.

## 2. The node catalog: n8n's schema, shipped as data

Each node package ships `dist/types/nodes.json`, the same file the editor downloads to draw
parameter forms. In `n8n-nodes-base@2.43.6` it holds **504 descriptions** (8.8 MB). Each entry is an
`INodeTypeDescription`:

```jsonc
{
  "name": "gmail",                       // workflow type = "n8n-nodes-base.gmail"
  "version": [2, 2.1, 2.2],              // versions this implementation serves
  "defaultVersion": 2.2,                 // what the editor inserts today
  "inputs": ["main"], "outputs": ["main"],
  "credentials": [{ "name": "gmailOAuth2", "displayOptions": { "show": { "authentication": ["oAuth2"] } } }],
  "properties": [ /* parameter schema, see §4 */ ]
}
```

Nodes that were rewritten ship **several entries**, one per implementation (Gmail v1 and v2.x,
Google Sheets v1–2 and v3–4.7, HTTP Request v1, v2 and v3–4.5). `tools/fetch-catalog.mjs` pulls
this file for any n8n release straight from the npm registry, and `tools/describe.mjs` prints the
schema of any node at any version.

## 3. typeVersion is the compatibility contract

n8n never deletes old node versions, so old workflows keep running. The reverse does not hold:
a workflow that uses a version newer than the instance knows will not load. Highest version
available per release:

| Node | 1.80 (Feb 2025) | 1.100 (Jun 2025) | 1.123 | 2.43 (Oct 2026) | **Pack uses** |
|---|---|---|---|---|---|
| Schedule Trigger | 1.2 | 1.2 | 1.3 | 1.4 | **1.2** |
| Webhook | 2 | 2 | 2.1 | 2.2 | **2** |
| Respond to Webhook | 1.1 | 1.4 | 1.5 | 1.5 | **1.1** |
| Google Sheets | 4.5 | 4.6 | 4.7 | 4.7 | **4.5** |
| Gmail | 2.1 | 2.1 | 2.2 | 2.2 | **2.1** |
| IF | 2.2 | 2.2 | 2.3 | 2.3 | **2.2** |
| Set (Edit Fields) | 3.4 | 3.4 | 3.4 | 3.5 | **3.4** |
| HTTP Request | 4.2 | 4.2 | 4.3 | 4.5 | **4.2** |
| Remove Duplicates | 2 | 2 | 2 | 2 | **2** |
| Code | 2 | 2 | 2 | 2 | **2** |
| Anthropic Chat Model | 1.2 | 1.3 | 1.3 | 1.6 | *not used* |

**Rule:** pin each node to the lowest version that has what you need. That is why the pack
imports unchanged on any n8n from 1.80 to 2.43. Building in today's editor would pin Set 3.5
and Schedule 1.4, which break on every self-hosted instance more than a few months old.

The Anthropic Chat Model node shows why this matters. v1.2, the last version in 1.80, only offers a fixed
dropdown of 2024 models, and the model became a free-text resource locator only in v1.3. The
pack calls the Messages API from an HTTP Request node instead (§9), which works on every version
and with any model ID.

## 4. Parameters and `displayOptions`

A property exists for a given node instance only if its `displayOptions` match:

```jsonc
{ "name": "columns", "type": "resourceMapper",
  "displayOptions": {
    "show": { "resource": ["sheet"], "operation": ["update"],
              "@version": [{ "_cnd": { "between": { "from": 4, "to": 4.6 } } }] },
    "hide": { "sheetName": [""] } } }
```

- `show`: every key must match one listed value. `hide`: any match hides the property.
- `@version` compares against the node's typeVersion. `_cnd` adds operators: `eq`, `not`, `gte`,
  `lte`, `gt`, `lt`, `between`, `startsWith`, `endsWith`, `includes`, `regex`, `exists`.
- A leading `/` (`"/includeOtherFields"`) points at a root parameter from inside a collection.
- Unset parameters fall back to their `default`, and defaults also count when resolving visibility.
- The **same name can appear several times** with different `displayOptions` (Set has three
  `include` properties, Code has four `jsCode` properties). Whichever is visible wins.

What this means for templates: a parameter that is present in JSON but hidden is **silently ignored**. Putting
`columns` on a Sheets *read* operation does nothing, with no warning. `tools/lib/n8n-schema.mjs` reimplements
this logic so `tools/validate.mjs` can flag it.

### Parameter types you meet in real workflows

| Type | JSON shape |
|---|---|
| `options` / `multiOptions` | a value from `options[].value` (or an array of them) |
| `collection` | `{ subName: value }`, sub-options from `options[]` |
| `fixedCollection` | `{ groupName: {…} }` or `{ groupName: [{…}, …] }` when `multipleValues` |
| `resourceLocator` | `{ "__rl": true, "mode": "list" \| "url" \| "id" \| "name", "value": "…" }` |
| `resourceMapper` (Sheets 4.x) | `{ "mappingMode": "defineBelow", "value": { col: expr }, "matchingColumns": [...], "schema": [...] }` |
| `filter` (IF/Filter 2.x) | `{ "options": { "version": N, … }, "conditions": [{ leftValue, rightValue, operator: { type, operation, singleValue } }], "combinator": "and" }`. `options.version` follows typeVersion: IF 2.0–2.1 → 1, 2.2 → 2, 2.3 → 3 |
| `assignmentCollection` (Set 3.3+) | `{ "assignments": [{ id, name, value, type }] }` |

## 5. Expressions

Any string parameter starting with `=` is a template. Each `{{ … }}` segment is JavaScript:

- `$json`: the current item. `$('Node').first()`, `.all()`, `.item` (the paired item, see §6),
  and `.itemMatching(i)` inside Code nodes.
- `$now` / `$today`: Luxon `DateTime` in the **workflow timezone** (Settings → Timezone, else
  `GENERIC_TIMEZONE`). The Schedule Trigger uses the same zone, which is why the pack reads
  "today" from `$now` rather than a separate setting.
- A literal `}}` inside an expression ends it early. Build complex objects in a Code node and
  pass them with `{{ JSON.stringify($('Node').item.json.payload) }}`.

## 6. Items, paired items and execution order

Every node receives and returns an array of items `{ json, binary?, pairedItem }`.
`pairedItem` records which input item produced each output item. `$('Plan reminders').item`
walks that lineage back through any number of nodes, which is how the sheet update in
*Invoice follow-ups* finds the right invoice after IF and Gmail nodes have replaced `$json`.
Code nodes that filter should set `pairedItem: { item: index }` explicitly.

- **Connections** are keyed by the source node's *name*. `connections[name].main[i]` is output `i`.
  IF has two outputs (true and false).
- `onError: "continueErrorOutput"` adds an extra output. Items the node marks with `json.error`
  go there. The pack routes failed emails to an owner alert instead of failing the run.
- `onError: "continueRegularOutput"` passes `{ error }` downstream, which the lead workflow uses to fall
  back from Claude to a template.
- **Disabled nodes pass their input through unchanged.** The pack relies on this: deactivate
  *Draft reply with Claude* or *Send SMS* and the workflow still works.
- `settings.executionOrder: "v1"` runs one branch to completion before the next, ordered top to bottom by
  canvas position.
- A node that receives zero items does not run, so a Code node returning `[]` ends that branch.

## 7. Credentials

Credentials are stored apart from workflows. A node references one by `{ id, name }` per credential
type. The pack omits these references, and on import n8n auto-selects a credential when exactly one of the right type
exists. A credential type can declare `authenticate`, either a generic header/query/auth spec
(Stripe: `Authorization: Bearer {{secretKey}}`) or a function (Anthropic: sets `x-api-key` and
nothing else). Any credential with `authenticate` can be reused by the HTTP Request node via
`authentication: predefinedCredentialType`. That lets one stored key call any endpoint of
that API, including ones n8n has no node for.

## 8. Triggers and workflow settings

- Webhook and Stripe Trigger instances carry a `webhookId`. The Stripe Trigger creates the
  endpoint in Stripe when the workflow is activated, so n8n must be reachable from the internet.
- `settings.errorWorkflow` points at a workflow that starts with an Error Trigger. It is an ID, so
  it cannot ship inside a template and is set after import (*Settings → Error workflow*).
- Remove Duplicates v2 (`removeItemsSeenInPreviousExecutions`) keeps its history in n8n's
  database, scoped to the workflow. That gives cross-run dedupe without a spreadsheet.

## 9. Things that changed in n8n 2.x (observed on 2.43.8)

- `n8n execute --file` is gone: import first, then `n8n execute --id=<id>`.
- `execute` prints its result through the logger at *info* level. With `N8N_LOG_LEVEL=warn`
  you get no output at all, even on success.
- Code nodes run in a task-runner process. A missing Python runner logs a notice but JavaScript
  Code nodes run normally.
- The license (`LICENSE.md`, "Sustainable Use License") allows use "only for your own internal
  business purposes". See `business/offer.md` for what that means for selling setup work.

## 10. Calling Claude from any n8n version

`Draft reply with Claude` is an HTTP Request v4.2 node using the stored `anthropicApi`
credential. The request is built in the *Normalize lead* Code node:

- `POST https://api.anthropic.com/v1/messages`, header `anthropic-version: 2026-10-21`
- model `claude-opus-5-5` by default (editable in Config), `max_tokens: 16000`,
  `output_config: { effort: "low" }` for short replies
- `fallbacks: "default"` plus header `anthropic-beta: server-side-fallback-2026-07-01`, sent only for
  models that support server-side refusal fallback
- no `temperature` / `top_p` / `top_k`: API version 2026-10-21 rejects them
- the reply is read from `content[]` blocks of `type: "text"`. Responses can start with an empty
  `thinking` block, so `content[0].text` is not safe.

## Reproduce

```bash
node tools/fetch-catalog.mjs 1.80.0 1.100.0 1.123.85 2.43.8   # download schemas
node tools/describe.mjs googleSheets 4.5 operation=update     # inspect a node
node tools/validate.mjs                                       # check every workflow
node --test test/*.test.mjs                                   # Code-node logic
N8N_BIN=… N8N_USER_FOLDER=… node test/runtime/run.mjs         # execute in real n8n
```
