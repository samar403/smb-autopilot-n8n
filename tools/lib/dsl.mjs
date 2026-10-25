// Tiny DSL for authoring n8n workflows in JS instead of hand-editing JSON.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PREFIX = { base: 'n8n-nodes-base.', langchain: '@n8n/n8n-nodes-langchain.' };

/** Deterministic UUID so rebuilding a workflow doesn't churn every node id. */
export function stableId(...parts) {
  const h = crypto.createHash('sha1').update(parts.join('|')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Load a Code-node body. Lines like `// @include lib/dates.js` are replaced by
 * that file's contents, because n8n Code nodes cannot import shared modules.
 */
export function loadCode(codeDir, file, vars = {}) {
  const src = fs.readFileSync(path.join(codeDir, file), 'utf8');
  return src
    .replace(/^\/\/ @include (\S+)\s*$/gm, (_, inc) => fs.readFileSync(path.join(codeDir, inc), 'utf8').trim())
    .replace(/__([A-Z_]+)__/g, (match, key) => (key in vars ? vars[key] : match))
    .trim() + '\n';
}

export function createBuilder(slug) {
  const nodes = [];
  const connections = {};

  /** Add a node. `type` may omit the package prefix for n8n-nodes-base nodes. */
  function node(name, type, typeVersion, parameters, position, extra = {}) {
    const fullType = type.includes('.') ? type : PREFIX.base + type;
    const n = { parameters, id: stableId(slug, name), name, type: fullType, typeVersion, position, ...extra };
    if (extra.webhook) {
      delete n.webhook;
      n.webhookId = stableId(slug, name, 'webhook');
    }
    nodes.push(n);
    return name;
  }

  /** Connect `from` (output index `output`) to `to` (input index `input`). */
  function connect(from, to, { output = 0, input = 0, type = 'main' } = {}) {
    connections[from] ??= {};
    connections[from][type] ??= [];
    const outs = connections[from][type];
    while (outs.length <= output) outs.push([]);
    outs[output].push({ node: to, type, index: input });
  }

  /** Connect a straight line of nodes. */
  function chain(...names) {
    for (let i = 0; i < names.length - 1; i++) connect(names[i], names[i + 1]);
  }

  let stickyCount = 0;
  function sticky(content, position, { width = 340, height = 300, color = 7 } = {}) {
    stickyCount += 1;
    return node(`Sticky Note${stickyCount === 1 ? '' : stickyCount}`, 'stickyNote', 1, { content, width, height, color }, position);
  }

  function workflow(name, { settings = {}, description } = {}) {
    return {
      name,
      nodes,
      connections,
      pinData: {},
      settings: { executionOrder: 'v1', ...settings },
      staticData: null,
      meta: { templateCredsSetupCompleted: false, ...(description ? { description } : {}) },
      active: false,
    };
  }

  return { node, connect, chain, sticky, workflow };
}

// ---- parameter helpers ---------------------------------------------------------

/** Set node v3.3+ assignment list. Values are literal unless they start with "=". */
export function assignments(slug, nodeName, fields) {
  return {
    assignments: fields.map(([name, value, type]) => ({
      id: stableId(slug, nodeName, name),
      name,
      value,
      type: type ?? (typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string'),
    })),
  };
}

/** IF / Filter v2.2 condition block (filter version 2). */
export function conditions(slug, nodeName, list, combinator = 'and') {
  return {
    options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: list.map((c, i) => ({ id: stableId(slug, nodeName, 'cond', i), ...c })),
    combinator,
  };
}

/** Google Sheets v4.x resource-mapper block with an explicit column list. */
export function sheetColumns(value, { matchingColumns = [] } = {}) {
  return {
    mappingMode: 'defineBelow',
    value,
    matchingColumns,
    schema: Object.keys(value).map((id) => ({
      id,
      displayName: id,
      required: false,
      defaultMatch: false,
      display: true,
      type: 'string',
      canBeUsedToMatch: true,
    })),
  };
}

export const rl = {
  url: (value) => ({ __rl: true, mode: 'url', value }),
  name: (value) => ({ __rl: true, mode: 'name', value }),
};
