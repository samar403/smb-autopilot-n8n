#!/usr/bin/env node
// Show which parameters a node accepts at a given typeVersion, after applying
// the same displayOptions rules the n8n editor uses.
//
//   node tools/describe.mjs n8n-nodes-base.googleSheets 4.5 operation=update
//   node tools/describe.mjs gmail 2.1 resource=message operation=send --n8n 1.80.0
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, knownVersions, descriptionFor, visibleProperties } from './lib/n8n-schema.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = args.indexOf('--n8n');
const release = flag >= 0 ? args.splice(flag, 2)[1] : '2.43.8';
let [type, version, ...pairs] = args;
if (!type) {
  console.error('usage: node tools/describe.mjs <nodeType> [typeVersion] [param=value ...] [--n8n <release>]');
  process.exit(1);
}
if (!type.includes('.')) type = `n8n-nodes-base.${type}`;

const dir = path.join(ROOT, '.catalog', `n8n-${release}`);
const catalog = loadCatalog([
  { file: path.join(dir, 'base.json'), pkg: 'base' },
  { file: path.join(dir, 'langchain.json'), pkg: 'langchain' },
]);
const versions = knownVersions(catalog, type);
if (!versions.length) { console.error(`${type} is not in the n8n@${release} catalog`); process.exit(1); }
const v = version ? Number(version) : versions[versions.length - 1];
const desc = descriptionFor(catalog, type, v);
if (!desc) { console.error(`${type} has no typeVersion ${v} in n8n@${release}. Known: ${versions.join(', ')}`); process.exit(1); }

const params = {};
for (const pair of pairs) {
  const [k, ...rest] = pair.split('=');
  const raw = rest.join('=');
  params[k] = raw === 'true' ? true : raw === 'false' ? false : raw;
}

const short = (x) => (x === undefined ? '' : JSON.stringify(x).slice(0, 90));
console.log(`${type} v${v}  (n8n@${release}; known versions: ${versions.join(', ')})`);
if (desc.credentials?.length) console.log(`credentials: ${desc.credentials.map((c) => c.name).join(', ')}`);
for (const p of visibleProperties(desc, params, v)) {
  if (p.type === 'notice') continue;
  let line = `  ${p.name} [${p.type}] default=${short(p.default)}`;
  if (p.required) line += ' REQUIRED';
  if (p.type === 'options' || p.type === 'multiOptions') line += `\n      values: ${p.options.map((o) => o.value).join(', ')}`;
  if (p.type === 'collection') line += `\n      fields: ${p.options.map((o) => o.name).join(', ')}`;
  if (p.type === 'fixedCollection') {
    line += p.options.map((o) => `\n      ${o.name}: ${(o.values ?? []).map((x) => x.name).join(', ')}`).join('');
  }
  if (p.type === 'resourceLocator') line += `\n      modes: ${p.modes.map((m) => m.name).join(', ')}`;
  console.log(line);
}
