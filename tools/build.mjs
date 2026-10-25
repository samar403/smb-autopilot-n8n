#!/usr/bin/env node
// Builds workflows/*.json (the importable product) from src/workflows/*.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBuilder, loadCode, assignments, conditions, sheetColumns, rl } from './lib/dsl.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'workflows');
const CODE = path.join(ROOT, 'src', 'code');
const OUT = path.join(ROOT, 'workflows');

fs.mkdirSync(OUT, { recursive: true });
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.mjs')).sort();
for (const file of files) {
  const mod = await import(pathToFileURL(path.join(SRC, file)).href);
  const workflow = mod.default({
    createBuilder,
    code: (name, vars) => loadCode(CODE, name, vars),
    assignments: (...args) => assignments(...args),
    conditions,
    sheetColumns,
    rl,
  });
  const outFile = path.join(OUT, `${mod.slug}.json`);
  fs.writeFileSync(outFile, JSON.stringify(workflow, null, 2) + '\n');
  const real = workflow.nodes.filter((n) => n.type !== 'n8n-nodes-base.stickyNote').length;
  console.log(`built ${path.relative(ROOT, outFile)}  (${real} nodes)`);
}
