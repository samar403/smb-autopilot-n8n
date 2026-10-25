// Runs Code-node bodies taken from the built workflow JSON in a minimal
// emulation of n8n's Code node runtime ($input, $(), $json, $now).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export function loadWorkflow(slug) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows', `${slug}.json`), 'utf8'));
}

export function nodeOf(workflow, name) {
  const node = workflow.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`no node "${name}" in ${workflow.name}`);
  return node;
}

/** Config node values as the Set node would output them. */
export function configOf(workflow, overrides = {}) {
  const cfg = {};
  for (const a of nodeOf(workflow, 'Config').parameters.assignments.assignments) cfg[a.name] = a.value;
  return { ...cfg, ...overrides };
}

/** Luxon-shaped stand-in for $now: wall-clock time in the workflow timezone. */
export function mockNow(localIso) {
  const [date, time = '00:00:00'] = localIso.split('T');
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7; // Luxon: 1 = Monday ... 7 = Sunday
  return { toISODate: () => date, toISO: () => `${date}T${time}.000+00:00`, hour: Number(time.slice(0, 2)), weekday };
}

const wrap = (rows) => rows.map((json) => ({ json }));

/**
 * Run one Code node.
 *   input: array of json objects arriving at the node
 *   nodes: { 'Node name': [json, ...] } outputs of earlier nodes; paired by index
 */
export async function runCode(workflow, nodeName, { input = [], nodes = {}, now = mockNow('2026-10-21T10:00:00') } = {}) {
  const node = nodeOf(workflow, nodeName);
  const items = wrap(input);
  const mode = node.parameters.mode ?? 'runOnceForAllItems';
  const lookup = (current) => (name) => {
    if (!(name in nodes)) throw new Error(`test did not provide output for $('${name}')`);
    const rows = wrap(nodes[name]);
    return {
      first: () => rows[0],
      all: () => rows,
      itemMatching: (i) => rows[i],
      get item() { return rows[current]; },
    };
  };
  const fn = new AsyncFunction('$input', '$', '$json', '$now', node.parameters.jsCode);
  if (mode === 'runOnceForEachItem') {
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const $input = { item: items[i], all: () => items, first: () => items[0] };
      out.push(await fn($input, lookup(i), items[i].json, now));
    }
    return out.map((r) => r.json);
  }
  const $input = { all: () => items, first: () => items[0], last: () => items[items.length - 1] };
  const result = await fn($input, lookup(0), undefined, now);
  return result.map((r) => r.json);
}

/** Fails a test if any {placeholder} was left unfilled in rendered text. */
export function leftoverPlaceholders(text) {
  return String(text).match(/\{[a-z_]+\}/g) ?? [];
}
