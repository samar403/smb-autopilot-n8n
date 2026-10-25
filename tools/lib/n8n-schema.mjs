// Minimal re-implementation of how the n8n editor decides which node
// parameters exist. Works off the `dist/types/nodes.json` catalog that ships
// inside the n8n-nodes-base / @n8n/n8n-nodes-langchain npm packages.
import fs from 'node:fs';

const PACKAGE_PREFIX = {
  base: 'n8n-nodes-base.',
  langchain: '@n8n/n8n-nodes-langchain.',
};

/** Load one or more nodes.json catalogs into a Map<fullType, description[]>. */
export function loadCatalog(paths) {
  const byType = new Map();
  for (const { file, pkg } of paths) {
    const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const desc of entries) {
      const type = PACKAGE_PREFIX[pkg] + desc.name;
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(desc);
    }
  }
  return byType;
}

const versionsOf = (desc) => (Array.isArray(desc.version) ? desc.version : [desc.version]);

/** Every typeVersion n8n knows for a node type. */
export function knownVersions(catalog, type) {
  return (catalog.get(type) ?? []).flatMap(versionsOf).sort((a, b) => a - b);
}

/** The description entry that implements a given typeVersion (versioned nodes ship several). */
export function descriptionFor(catalog, type, version) {
  return (catalog.get(type) ?? []).find((d) => versionsOf(d).includes(version));
}

// ---- displayOptions evaluation ------------------------------------------------

function matchCondition(cond, actual) {
  if (cond && typeof cond === 'object' && '_cnd' in cond) {
    const [op, expected] = Object.entries(cond._cnd)[0];
    switch (op) {
      case 'eq': return actual === expected;
      case 'not': return actual !== expected;
      case 'gte': return actual >= expected;
      case 'lte': return actual <= expected;
      case 'gt': return actual > expected;
      case 'lt': return actual < expected;
      case 'between': return actual >= expected.from && actual <= expected.to;
      case 'startsWith': return typeof actual === 'string' && actual.startsWith(expected);
      case 'endsWith': return typeof actual === 'string' && actual.endsWith(expected);
      case 'includes': return typeof actual === 'string' && actual.includes(expected);
      case 'regex': return typeof actual === 'string' && new RegExp(expected).test(actual);
      case 'exists': return actual !== undefined && actual !== null && actual !== '';
      default: return false;
    }
  }
  return actual === cond;
}

function resolve(key, ctx) {
  if (key === '@version') return ctx.version;
  if (key === '@tool') return false;
  const path = key.startsWith('/') ? key.slice(1) : key;
  const source = key.startsWith('/') ? ctx.root : ctx.local;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), source);
}

/**
 * Same semantics as NodeHelpers.displayParameter: every `show` key must match
 * one of its values, and no `hide` key may match. Unset parameters fall back
 * to their declared defaults, exactly like the editor does.
 */
export function isVisible(prop, ctx) {
  const opts = prop.displayOptions;
  if (!opts) return true;
  const valueOf = (key) => {
    const v = resolve(key, ctx);
    return v === undefined ? ctx.defaults?.[key.replace(/^\//, '')] : v;
  };
  for (const [key, allowed] of Object.entries(opts.show ?? {})) {
    const actual = valueOf(key);
    const values = Array.isArray(actual) ? actual : [actual];
    if (!allowed.some((cond) => values.some((v) => matchCondition(cond, v)))) return false;
  }
  for (const [key, blocked] of Object.entries(opts.hide ?? {})) {
    const actual = valueOf(key);
    const values = Array.isArray(actual) ? actual : [actual];
    if (blocked.some((cond) => values.some((v) => matchCondition(cond, v)))) return false;
  }
  return true;
}

/** Defaults for top-level properties, resolved in declaration order like the editor. */
export function topLevelDefaults(desc, params, version) {
  const defaults = {};
  for (const prop of desc.properties) {
    if (prop.name in defaults) continue;
    const ctx = { version, root: params, local: params, defaults };
    if (isVisible(prop, ctx)) defaults[prop.name] = prop.default;
  }
  return defaults;
}

/** Top-level properties that are visible for the given parameter values. */
export function visibleProperties(desc, params, version) {
  const defaults = topLevelDefaults(desc, params, version);
  return desc.properties.filter((p) => isVisible(p, { version, root: params, local: params, defaults }));
}
