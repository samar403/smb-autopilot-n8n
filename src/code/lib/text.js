// ---- text + email layout (shared helper, inlined at build time) ----
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Replace {placeholders}; unknown placeholders are left visible so typos get noticed. */
function fill(template, vars) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key] ?? '') : match));
}

function isEmail(s) {
  return /^[^\s@<>(),;:]+@[^\s@<>(),;:]+\.[a-z]{2,}$/i.test(String(s ?? '').trim());
}

function firstName(fullName) {
  const first = String(fullName ?? '').trim().split(/\s+/)[0] || '';
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
}

/** "1,250.00", "$1250", 1250 -> 1250. Returns null when no number is present. */
function toAmount(value) {
  if (typeof value === 'number') return value;
  const cleaned = String(value ?? '').replace(/[^0-9.-]/g, '');
  if (!cleaned || isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}

function money(amount, currency, locale) {
  if (amount === null || amount === undefined) return '';
  try {
    return new Intl.NumberFormat(locale || 'en-US', { style: 'currency', currency: (currency || 'USD').toUpperCase() }).format(amount);
  } catch {
    return `${currency || ''} ${Number(amount).toFixed(2)}`.trim();
  }
}

/** Plain text with blank-line paragraphs -> simple HTML paragraphs. */
function textToHtml(text) {
  return String(text ?? '')
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/** Minimal, client-safe HTML email: paragraphs, optional button, small footer. */
function emailHtml({ bodyText, buttonLabel, buttonUrl, footer }) {
  const button = buttonUrl
    ? `<p style="margin:22px 0"><a href="${escapeHtml(buttonUrl)}" style="background:#1f6feb;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;display:inline-block;font-weight:600">${escapeHtml(buttonLabel || 'Open link')}</a></p>`
    : '';
  const foot = footer ? `<p style="margin:24px 0 0;color:#6b7280;font-size:12px">${escapeHtml(footer)}</p>` : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111827;max-width:560px">\n${textToHtml(bodyText)}\n${button}${foot}\n</div>`;
}

/** Owner-facing HTML table. rows: array of arrays of cell text. */
function htmlTable(headers, rows) {
  const th = headers.map((h) => `<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #d1d5db;font-size:13px">${escapeHtml(h)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td style="padding:6px 10px;border-bottom:1px solid #eef0f3;font-size:13px">${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('\n');
  return `<table style="border-collapse:collapse;margin:8px 0 18px">\n<tr>${th}</tr>\n${body}\n</table>`;
}
