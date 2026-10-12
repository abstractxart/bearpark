// Number, time and address formatting. One place, so every figure on the
// site reads the same way.

const nf = (opts) => new Intl.NumberFormat('en-US', opts);
const INT = nf({ maximumFractionDigits: 0 });
const ONE = nf({ maximumFractionDigits: 1 });
const TWO = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1234 → "1,234"; 12.5 → "12.5"; null → "—". */
export function num(value, digits = 1) {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  return Math.abs(n) >= 1000 || digits === 0 ? INT.format(n) : nf({ maximumFractionDigits: digits }).format(n);
}

/** 1_296_766 → "1.30M", 12_400 → "12.4K". */
export function compact(value, digits = 2) {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, unit] of units) {
    if (abs >= size) return `${(n / size).toFixed(abs / size >= 100 ? 0 : abs / size >= 10 ? 1 : digits)}${unit}`;
  }
  return abs >= 100 ? INT.format(n) : ONE.format(n);
}

export function usd(value, { compactAbove = 100000 } = {}) {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= compactAbove) return `$${compact(n)}`;
  if (Math.abs(n) >= 1) return `$${TWO.format(n)}`;
  return `$${price(n)}`;
}

/**
 * A price with enough significant digits to be useful: 0.0017584 → "0.001758".
 * Tiny prices use BEAR Swap's subscript zero count: 0.0000012 → "0.0₅12".
 */
export function price(value, sig = 4) {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  if (Math.abs(n) >= 1) return nf({ maximumFractionDigits: 4 }).format(n);
  const zeros = Math.max(0, -Math.floor(Math.log10(Math.abs(n))) - 1);
  if (zeros >= 4) {
    const digits = Math.round(Math.abs(n) * 10 ** (zeros + sig)).toString().slice(0, sig).replace(/0+$/, '');
    return `${n < 0 ? '-' : ''}0.0${SUB[zeros] || zeros}${digits}`;
  }
  return n.toFixed(zeros + sig).replace(/0+$/, '');
}
const SUB = { 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', 10: '₁₀', 11: '₁₁', 12: '₁₂' };

/** +1.23% / −4.5% with a real minus sign. */
export function pct(value, digits = 1) {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  const s = Math.abs(n).toFixed(Math.abs(n) >= 100 ? 0 : digits);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${s}%`;
}

export const tone = (value) => (Number(value) > 0 ? 'up' : Number(value) < 0 ? 'down' : 'flat');

/** rszi51…YtK */
export function short(address, head = 5, tail = 4) {
  if (!address || address.length <= head + tail + 1) return address || '';
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });
/** "3 min. ago", "yesterday", "2 wk. ago". */
export function ago(when) {
  const t = typeof when === 'number' ? when : Date.parse(when);
  if (!Number.isFinite(t)) return '';
  const s = (t - Date.now()) / 1000;
  const steps = [[60, 'second'], [3600, 'minute', 60], [86400, 'hour', 3600], [604800, 'day', 86400], [2629800, 'week', 604800], [31557600, 'month', 2629800], [Infinity, 'year', 31557600]];
  for (const [limit, unit, div = 1] of steps) {
    if (Math.abs(s) < limit) return Math.abs(s) < 45 && unit === 'second' ? 'just now' : RTF.format(Math.round(s / div), unit);
  }
  return '';
}

/** 3725000 → "1h 02m", 59000 → "59s". */
export function duration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/** "02:59" clock for countdowns. */
export function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Milliseconds until the next UTC midnight (daily resets run on UTC). */
export function untilUtcMidnight(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

export function plural(n, one, many = `${one}s`) {
  return `${num(n, 0)} ${Number(n) === 1 ? one : many}`;
}


export function hexToUtf8(hex) {
  try {
    const bytes = new Uint8Array(hex.match(/../g).map((b) => parseInt(b, 16)));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}
