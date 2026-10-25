#!/usr/bin/env node
// Validates workflow JSON against the real node catalogs of several n8n releases.
//
//   node tools/validate.mjs                    -> all workflows/*.json, all catalogs in .catalog/
//   node tools/validate.mjs path/to/flow.json  -> one file (works on any n8n export)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, knownVersions, descriptionFor, visibleProperties, isVisible } from './lib/n8n-schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_DIR = path.join(ROOT, '.catalog');

if (!fs.existsSync(CATALOG_DIR)) {
  console.error('No node catalogs found. Run: node tools/fetch-catalog.mjs 1.80.0 2.43.8');
  process.exit(2);
}
const releases = fs.readdirSync(CATALOG_DIR)
  .filter((d) => d.startsWith('n8n-'))
  .map((d) => d.slice(4))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const catalogs = Object.fromEntries(releases.map((r) => {
  const dir = path.join(CATALOG_DIR, `n8n-${r}`);
  const parts = [{ file: path.join(dir, 'base.json'), pkg: 'base' }];
  if (fs.existsSync(path.join(dir, 'langchain.json'))) parts.push({ file: path.join(dir, 'langchain.json'), pkg: 'langchain' });
  return [r, loadCatalog(parts)];
}));
const newest = releases[releases.length - 1];

const isExpr = (v) => typeof v === 'string' && v.startsWith('=');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

/** Syntax-check every {{ }} segment of an n8n expression string. */
function checkExpression(value) {
  const body = value.slice(1);
  const problems = [];
  let rest = body;
  while (rest.includes('{{')) {
    const start = rest.indexOf('{{');
    const end = rest.indexOf('}}', start + 2);
    if (end < 0) { problems.push('unclosed {{'); break; }
    const segment = rest.slice(start + 2, end).trim();
    try { new Function('$json', '$', '$now', `return (${segment});`); } catch (e) { problems.push(`bad expression "{{ ${segment.slice(0, 60)} }}": ${e.message}`); }
    rest = rest.slice(end + 2);
  }
  return problems;
}

/** Walk any parameter value and yield every string inside it. */
function* strings(value) {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const v of value) yield* strings(v);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) yield* strings(v);
}

/** Check nested collection / fixedCollection keys against the schema. */
function checkNested(prop, value, root, version, where, errors) {
  if (value === undefined || value === null || isExpr(value)) return;
  if (prop.type === 'collection') {
    if (typeof value !== 'object') return errors.push(`${where}: expected an object`);
    for (const [key, sub] of Object.entries(value)) {
      const candidates = (prop.options ?? []).filter((o) => o.name === key);
      if (!candidates.length) { errors.push(`${where}.${key}: not an option of "${prop.name}" (allowed: ${(prop.options ?? []).map((o) => o.name).join(', ')})`); continue; }
      const visible = candidates.find((c) => isVisible(c, { version, root, local: value, defaults: {} }));
      if (!visible) { errors.push(`${where}.${key}: exists but is hidden for these settings`); continue; }
      checkValue(visible, sub, root, version, `${where}.${key}`, errors);
    }
  } else if (prop.type === 'fixedCollection') {
    if (typeof value !== 'object') return errors.push(`${where}: expected an object`);
    for (const [group, groupValue] of Object.entries(value)) {
      const def = (prop.options ?? []).find((o) => o.name === group);
      if (!def) { errors.push(`${where}.${group}: not a group of "${prop.name}" (allowed: ${(prop.options ?? []).map((o) => o.name).join(', ')})`); continue; }
      const entries = Array.isArray(groupValue) ? groupValue : [groupValue];
      entries.forEach((entry, i) => {
        if (!entry || typeof entry !== 'object') return;
        for (const [key, sub] of Object.entries(entry)) {
          const candidates = (def.values ?? []).filter((v) => v.name === key);
          if (!candidates.length) { errors.push(`${where}.${group}[${i}].${key}: unknown field (allowed: ${(def.values ?? []).map((v) => v.name).join(', ')})`); continue; }
          const visible = candidates.find((c) => isVisible(c, { version, root, local: entry, defaults: {} })) ?? candidates[0];
          checkValue(visible, sub, root, version, `${where}.${group}[${i}].${key}`, errors);
        }
      });
    }
  }
}

function checkValue(prop, value, root, version, where, errors) {
  if (isExpr(value)) return;
  if ((prop.type === 'options') && prop.options && !prop.typeOptions?.loadOptionsMethod && !prop.typeOptions?.loadOptions) {
    const allowed = prop.options.map((o) => o.value);
    if (!allowed.includes(value)) errors.push(`${where}: "${value}" is not one of ${allowed.join(', ')}`);
  }
  if (prop.type === 'multiOptions' && Array.isArray(value) && prop.options && !prop.typeOptions?.loadOptionsMethod) {
    const allowed = prop.options.map((o) => o.value);
    for (const v of value) if (!allowed.includes(v)) errors.push(`${where}: "${v}" is not an allowed value`);
  }
  if (prop.type === 'boolean' && typeof value !== 'boolean') errors.push(`${where}: expected boolean, got ${JSON.stringify(value)}`);
  if (prop.type === 'number' && typeof value !== 'number') errors.push(`${where}: expected number, got ${JSON.stringify(value)}`);
  checkNested(prop, value, root, version, where, errors);
}

function outputCount(desc, node) {
  let count = Array.isArray(desc.outputs) ? desc.outputs.length : null;
  if (count !== null && node.onError === 'continueErrorOutput') count += 1;
  return count;
}

function validateWorkflow(file) {
  const wf = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errors = [];
  const warnings = [];
  const credentials = new Set();

  if (!Array.isArray(wf.nodes) || typeof wf.connections !== 'object') {
    return { errors: ['not an n8n workflow (missing nodes/connections)'], warnings, credentials };
  }
  if (wf.settings?.executionOrder !== 'v1') warnings.push('settings.executionOrder is not "v1"');

  const byName = new Map();
  const ids = new Set();
  for (const n of wf.nodes) {
    if (byName.has(n.name)) errors.push(`duplicate node name "${n.name}"`);
    if (ids.has(n.id)) errors.push(`duplicate node id ${n.id}`);
    byName.set(n.name, n);
    ids.add(n.id);
  }

  // ---- graph ----
  const parents = new Map(wf.nodes.map((n) => [n.name, new Set()]));
  const outgoing = new Map(wf.nodes.map((n) => [n.name, 0]));
  for (const [from, byType] of Object.entries(wf.connections)) {
    if (!byName.has(from)) { errors.push(`connection from unknown node "${from}"`); continue; }
    for (const [type, outs] of Object.entries(byType)) {
      outs.forEach((targets, outputIndex) => {
        const desc = descriptionFor(catalogs[newest], byName.get(from).type, byName.get(from).typeVersion);
        const count = desc ? outputCount(desc, byName.get(from)) : null;
        if (count !== null && outputIndex >= count && (targets ?? []).length) errors.push(`"${from}" has no output #${outputIndex} (it has ${count})`);
        for (const t of targets ?? []) {
          if (!byName.has(t.node)) { errors.push(`"${from}" connects to unknown node "${t.node}"`); continue; }
          if (t.type !== type) errors.push(`"${from}" -> "${t.node}" connection type mismatch`);
          parents.get(t.node).add(from);
          outgoing.set(from, outgoing.get(from) + 1);
        }
      });
    }
  }
  const ancestors = (name, seen = new Set()) => {
    for (const p of parents.get(name) ?? []) if (!seen.has(p)) { seen.add(p); ancestors(p, seen); }
    return seen;
  };

  for (const node of wf.nodes) {
    const where = `"${node.name}"`;
    if (node.type === 'n8n-nodes-base.stickyNote') continue;

    // ---- type + version in every release ----
    for (const r of releases) {
      const versions = knownVersions(catalogs[r], node.type);
      if (!versions.length) errors.push(`${where}: node type ${node.type} does not exist in n8n ${r}`);
      else if (!versions.includes(node.typeVersion)) errors.push(`${where}: ${node.type} v${node.typeVersion} not available in n8n ${r} (has ${versions.join(', ')})`);
    }

    // ---- parameters, against every release that has this version ----
    for (const r of releases) {
      const desc = descriptionFor(catalogs[r], node.type, node.typeVersion);
      if (!desc) continue;
      const params = node.parameters ?? {};
      const visible = visibleProperties(desc, params, node.typeVersion);
      for (const [key, value] of Object.entries(params)) {
        const candidates = visible.filter((p) => p.name === key);
        if (!candidates.length) {
          const exists = desc.properties.some((p) => p.name === key);
          errors.push(`${where} [n8n ${r}]: parameter "${key}" ${exists ? 'is hidden for these settings/version' : 'does not exist'}`);
          continue;
        }
        const perCandidate = candidates.map((c) => { const e = []; checkValue(c, value, params, node.typeVersion, `${where}.${key}`, e); return e; });
        const best = perCandidate.find((e) => !e.length) ?? perCandidate[0];
        errors.push(...best.map((e) => `${e} [n8n ${r}]`));
      }
      for (const p of visible) {
        if (!p.required || p.type === 'notice' || p.type === 'hidden') continue;
        const v = params[p.name];
        const empty = v === undefined || v === '' || (p.type === 'resourceLocator' && v && typeof v === 'object' && !v.value);
        if (empty && (p.default === '' || p.default === undefined || p.type === 'resourceLocator')) errors.push(`${where} [n8n ${r}]: required parameter "${p.name}" is empty`);
      }
      if (r === newest) {
        for (const c of desc.credentials ?? []) {
          if (isVisible(c, { version: node.typeVersion, root: params, local: params, defaults: Object.fromEntries(desc.properties.map((p) => [p.name, p.default])) })) {
            if (c.required !== false) credentials.add(c.name);
          }
        }
        if (node.parameters?.authentication === 'predefinedCredentialType' && node.parameters.nodeCredentialType) credentials.add(node.parameters.nodeCredentialType);
      }
    }

    // ---- expressions, code syntax, node references ----
    const params = node.parameters ?? {};
    for (const s of strings(params)) {
      if (isExpr(s)) for (const p of checkExpression(s)) errors.push(`${where}: ${p}`);
    }
    if (node.type === 'n8n-nodes-base.code' && params.jsCode) {
      try { new AsyncFunction('$input', '$', '$json', '$now', 'DateTime', params.jsCode); } catch (e) { errors.push(`${where}: JavaScript syntax error: ${e.message}`); }
    }
    const up = ancestors(node.name);
    for (const s of strings(params)) {
      for (const m of s.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        if (!byName.has(m[1])) errors.push(`${where}: references unknown node $('${m[1]}')`);
        else if (!up.has(m[1])) errors.push(`${where}: references $('${m[1]}') which does not run before it`);
      }
    }

    // ---- wiring + pack conventions ----
    const desc = descriptionFor(catalogs[newest], node.type, node.typeVersion);
    const isTrigger = desc?.group?.includes('trigger') || (Array.isArray(desc?.inputs) && desc.inputs.length === 0);
    if (!isTrigger && !parents.get(node.name).size && !node.disabled) errors.push(`${where}: has no incoming connection`);
    if (isTrigger && !outgoing.get(node.name)) errors.push(`${where}: trigger is not connected to anything`);
    if (['n8n-nodes-base.webhook', 'n8n-nodes-base.stripeTrigger'].includes(node.type) && !node.webhookId) warnings.push(`${where}: missing webhookId`);
    if (node.type === 'n8n-nodes-base.gmail' && params.options?.appendAttribution !== false) warnings.push(`${where}: Gmail will append "sent automatically with n8n"`);
  }
  return { errors, warnings, credentials };
}

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(path.join(ROOT, 'workflows')).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(ROOT, 'workflows', f));

console.log(`Validating against n8n ${releases.join(', ')}\n`);
let failed = 0;
for (const file of targets) {
  const { errors, warnings, credentials } = validateWorkflow(file);
  const label = path.basename(file);
  if (errors.length) failed += 1;
  console.log(`${errors.length ? 'FAIL' : 'PASS'}  ${label}${credentials.size ? `   credentials: ${[...credentials].join(', ')}` : ''}`);
  for (const e of [...new Set(errors)]) console.log(`      x ${e}`);
  for (const w of [...new Set(warnings)]) console.log(`      ! ${w}`);
}
console.log(`\n${targets.length - failed}/${targets.length} workflows valid`);
process.exit(failed ? 1 : 0);
