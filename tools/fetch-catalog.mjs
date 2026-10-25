#!/usr/bin/env node
// Downloads the node catalogs (dist/types/nodes.json) that a given n8n release
// ships with, straight from the npm registry. No npm install needed.
//
//   node tools/fetch-catalog.mjs 2.43.8        -> .catalog/n8n-2.43.8/{base,langchain}.json
//   node tools/fetch-catalog.mjs 1.80.0 2.43.8 -> several releases at once
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = 'https://registry.npmjs.org';
const PACKAGES = { base: 'n8n-nodes-base', langchain: '@n8n/n8n-nodes-langchain' };

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/** Pull a single file out of a gzipped npm tarball without touching disk. */
function extractFromTarball(gz, wanted) {
  const tar = zlib.gunzipSync(gz);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.toString('utf8', 0, 100).replace(/\0.*$/s, '');
    if (!name) break;
    const prefix = header.toString('utf8', 345, 500).replace(/\0.*$/s, '');
    const size = parseInt(header.toString('utf8', 124, 136).replace(/\0.*$/s, '').trim() || '0', 8);
    const full = prefix ? `${prefix}/${name}` : name;
    const body = offset + 512;
    if (full === wanted) return tar.subarray(body, body + size);
    offset = body + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${wanted} not found in tarball`);
}

async function fetchCatalog(n8nVersion) {
  const manifest = await getJson(`${REGISTRY}/n8n/${n8nVersion}`);
  const outDir = path.join(ROOT, '.catalog', `n8n-${n8nVersion}`);
  fs.mkdirSync(outDir, { recursive: true });
  const versions = {};
  for (const [key, pkg] of Object.entries(PACKAGES)) {
    const range = manifest.dependencies?.[pkg];
    if (!range) { console.warn(`  n8n@${n8nVersion} has no ${pkg} dependency, skipping`); continue; }
    const exact = range.replace(/^[\^~=]/, '');
    const pkgManifest = await getJson(`${REGISTRY}/${pkg.replace('/', '%2F')}/${exact}`);
    const res = await fetch(pkgManifest.dist.tarball);
    if (!res.ok) throw new Error(`tarball download failed: ${res.status}`);
    const json = extractFromTarball(Buffer.from(await res.arrayBuffer()), 'package/dist/types/nodes.json');
    fs.writeFileSync(path.join(outDir, `${key}.json`), json);
    versions[key] = `${pkg}@${exact}`;
  }
  fs.writeFileSync(path.join(outDir, 'versions.json'), JSON.stringify({ n8n: n8nVersion, ...versions }, null, 2));
  console.log(`n8n@${n8nVersion}: ${Object.values(versions).join(', ')} -> ${path.relative(ROOT, outDir)}`);
}

const requested = process.argv.slice(2);
if (!requested.length) {
  console.error('usage: node tools/fetch-catalog.mjs <n8n-version> [more versions...]');
  process.exit(1);
}
for (const v of requested) await fetchCatalog(v);
