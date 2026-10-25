// ---- dates (shared helper, inlined at build time) ----
// Sheet dates arrive as serial numbers (date cells read as SERIAL_NUMBER), ISO
// text ("2026-10-31"), or day/month text whose order depends on DATE_FORMAT.
function isoFromParts(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

function toIsoDate(value, dateFormat) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial < 20000 || serial > 80000) return null; // not a plausible 1954-2119 date
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return isoFromParts(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    return String(dateFormat).toUpperCase().startsWith('MM') ? isoFromParts(y, a, b) : isoFromParts(y, b, a);
  }
  const parsed = new Date(s); // "Oct 31, 2026", "31 October 2026"
  if (!isNaN(parsed)) return isoFromParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  return null;
}

/** Whole days from `fromIso` to `toIso` (positive when toIso is later). */
function daysBetween(fromIso, toIso) {
  const [a, b] = [fromIso, toIso].map((iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86400000);
}

function displayDate(iso, locale) {
  const [y, m, d] = iso.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(locale || 'en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return iso;
  }
}
