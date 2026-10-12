// A stand-in for `@supabase/supabase-js` v2 that compiles the query builder to
// parameterised SQL on the sandbox's PGlite database — the way PostgREST would:
// rows are shaped by Postgres itself (json_agg / row_to_json), so numbers,
// timestamps ("2026-10-11T19:09:15.139+00:00") and jsonb come back exactly as
// Supabase's REST API returns them.
//
// Supported (everything server.js uses, plus the rest of the common surface):
//   from(t).select(cols, { count, head })   embedded resources a:t!fk(*), t(*), !inner
//   insert / upsert(onConflict, ignoreDuplicates, defaultToNull) / update / delete, chained .select()
//   eq neq gt gte lt lte like ilike is in contains containedBy overlaps not or match filter
//   order(col, { ascending, nullsFirst, foreignTable|referencedTable }) limit range
//   single / maybeSingle (PGRST116), throwOnError, abortSignal, returns
//   rpc(fn, args)    storage.from(bucket).upload/getPublicUrl/remove/download/list (in memory)
// Result: { data, error, count, status, statusText }; error: { message, code, details, hint }.

const lock = require('./pg-lock');

let dbReady = null; // Promise<PGlite>
let storagePublicBase = 'http://localhost:3000/api/__sandbox/storage';
function configure(promise, { publicBase } = {}) {
  dbReady = promise;
  if (publicBase) storagePublicBase = publicBase.replace(/\/$/, '');
}

const log = { queries: 0 };

// ---------------------------------------------------------------------------
// Schema cache (like PostgREST's): columns, primary keys, foreign keys, functions

let schemaCache = null;
async function schema(db, { refresh = false } = {}) {
  if (schemaCache && !refresh) return schemaCache;
  const cols = await db.query(`
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c WHERE c.table_schema = 'public'`);
  const pks = await db.query(`
    SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY tc.table_name, kcu.ordinal_position`);
  const fks = await db.query(`
    SELECT c.conname,
           src.relname AS src, dst.relname AS dst,
           ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(n, i)
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.i) AS src_cols,
           ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(n, i)
                 JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.i) AS dst_cols
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid JOIN pg_namespace sn ON sn.oid = src.relnamespace
    JOIN pg_class dst ON dst.oid = c.confrelid JOIN pg_namespace dn ON dn.oid = dst.relnamespace
    WHERE c.contype = 'f' AND sn.nspname = 'public' AND dn.nspname = 'public'`);
  const tables = new Map();
  for (const r of cols.rows) {
    if (!tables.has(r.table_name)) tables.set(r.table_name, { columns: new Map(), pk: [] });
    tables.get(r.table_name).columns.set(r.column_name, r.data_type);
  }
  for (const r of pks.rows) tables.get(r.table_name)?.pk.push(r.column_name);
  schemaCache = { tables, fks: fks.rows };
  return schemaCache;
}

async function tableInfo(db, table) {
  let s = await schema(db);
  if (!s.tables.has(table)) s = await schema(db, { refresh: true }); // created at runtime
  return s.tables.get(table) || null;
}

// ---------------------------------------------------------------------------
// Errors

class PgrstError extends Error {
  constructor({ message, code = null, details = null, hint = null, status = 400 }) {
    super(message);
    this.payload = { message, code, details, hint };
    this.status = status;
  }
}

function pgToPostgrest(err) {
  if (err instanceof PgrstError) return err;
  const code = err.code || null;
  const status = code === '23505' ? 409
    : code === '23503' ? 409
      : code === '42P01' ? 404
        : code === '42501' ? 403
          : code === 'P0001' ? 400
            : /^(22|23)/.test(code || '') ? 400
              : 400;
  return new PgrstError({ message: err.message, code, details: err.detail || null, hint: err.hint || null, status });
}

// ---------------------------------------------------------------------------
// SQL helpers

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function q(ident) {
  if (!IDENT.test(ident)) throw new PgrstError({ message: `invalid identifier "${ident}"`, code: 'PGRST100', status: 400 });
  return `"${ident}"`;
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

class Params {
  constructor() { this.values = []; }
  add(v) { this.values.push(v); return `$${this.values.length}`; }
}

/** `col`, `col->key`, `col->>key`, `col::type`, `col->a->>b::text` → SQL on alias. */
function colRef(alias, expr) {
  let rest = String(expr).trim();
  let cast = null;
  const castM = /::([A-Za-z_][A-Za-z0-9_ \[\]]*)$/.exec(rest);
  if (castM) { cast = castM[1]; rest = rest.slice(0, castM.index); }
  const parts = rest.split(/(->>|->)/);
  let sql = `${alias}.${q(parts[0].trim())}`;
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i + 1].trim();
    sql += `${parts[i]}${/^\d+$/.test(key) ? key : lit(key)}`;
  }
  if (cast) sql = `(${sql})::${cast.replace(/[^A-Za-z0-9_ \[\]]/g, '')}`;
  return sql;
}

/** Top-level comma split that respects (), "" and \ escapes. */
function splitTop(str, sep = ',') {
  const out = [];
  let depth = 0;
  let quoted = false;
  let buf = '';
  for (let i = 0; i < str.length; i += 1) {
    const c = str[i];
    if (c === '\\' && quoted) { buf += c + (str[i + 1] || ''); i += 1; continue; }
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === '(') depth += 1;
    else if (!quoted && c === ')') depth -= 1;
    if (c === sep && depth === 0 && !quoted) { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim() !== '' || out.length) out.push(buf);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

function unquote(v) {
  const s = String(v).trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\(.)/g, '$1');
  return s;
}

/** PostgREST list literal "(a,b,"c,d")" → ['a','b','c,d'] */
function parseList(v) {
  if (Array.isArray(v)) return v;
  const s = String(v).trim().replace(/^\(/, '').replace(/\)$/, '');
  return s === '' ? [] : splitTop(s).map(unquote);
}

const filterValue = (v) => (v === null || v === undefined ? null : typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : String(v));

/** One PostgREST condition → SQL. `value` is a JS value (builder API) or PostgREST text (or/filter). */
function condition(alias, col, op, value, params, { negate = false, fromText = false } = {}) {
  const c = colRef(alias, col);
  let sql;
  switch (op) {
    case 'eq': sql = `${c} = ${params.add(filterValue(value))}`; break;
    case 'neq': sql = `${c} <> ${params.add(filterValue(value))}`; break;
    case 'gt': sql = `${c} > ${params.add(filterValue(value))}`; break;
    case 'gte': sql = `${c} >= ${params.add(filterValue(value))}`; break;
    case 'lt': sql = `${c} < ${params.add(filterValue(value))}`; break;
    case 'lte': sql = `${c} <= ${params.add(filterValue(value))}`; break;
    case 'like': sql = `${c} LIKE ${params.add(String(value).replace(/\*/g, '%'))}`; break;
    case 'ilike': sql = `${c} ILIKE ${params.add(String(value).replace(/\*/g, '%'))}`; break;
    case 'is': {
      const v = value === null || value === undefined ? 'null' : String(value).toLowerCase();
      if (!['null', 'true', 'false', 'unknown'].includes(v)) throw new PgrstError({ message: `failed to parse filter (is.${value})`, code: 'PGRST100', status: 400 });
      sql = `${c} IS ${v.toUpperCase()}`;
      break;
    }
    case 'in': {
      const list = fromText || typeof value === 'string' ? parseList(value) : (value || []);
      sql = list.length ? `${c} IN (${list.map((v) => params.add(filterValue(v))).join(', ')})` : 'FALSE';
      break;
    }
    case 'cs': case 'contains':
      sql = `${c} @> ${params.add(Array.isArray(value) ? `{${value.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',')}}` : filterValue(value))}`;
      break;
    case 'cd': case 'containedBy':
      sql = `${c} <@ ${params.add(Array.isArray(value) ? `{${value.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(',')}}` : filterValue(value))}`;
      break;
    case 'ov': case 'overlaps':
      sql = `${c} && ${params.add(Array.isArray(value) ? `{${value.join(',')}}` : filterValue(value))}`;
      break;
    case 'fts': case 'plfts': case 'phfts': case 'wfts':
      sql = `to_tsvector(${c}) @@ ${op === 'plfts' ? 'plainto_tsquery' : op === 'phfts' ? 'phraseto_tsquery' : op === 'wfts' ? 'websearch_to_tsquery' : 'to_tsquery'}(${params.add(String(value))})`;
      break;
    default:
      throw new PgrstError({ message: `unknown operator "${op}"`, code: 'PGRST100', status: 400 });
  }
  return negate ? `NOT (${sql})` : sql;
}

/** "a.eq.1,b.not.is.null,and(c.gt.2,d.lt.3)" → SQL joined by `joiner`. */
function logicTree(alias, expr, params, joiner = 'OR') {
  const parts = splitTop(String(expr));
  const sqls = parts.map((part) => {
    const group = /^(not\.)?(and|or)\((.*)\)$/s.exec(part);
    if (group) {
      const inner = `(${logicTree(alias, group[3], params, group[2].toUpperCase())})`;
      return group[1] ? `NOT ${inner}` : inner;
    }
    const m = /^([^.]+)\.(not\.)?([a-z]+)\.(.*)$/s.exec(part);
    if (!m) throw new PgrstError({ message: `failed to parse logic tree (${expr})`, code: 'PGRST100', status: 400 });
    const [, col, not, op, raw] = m;
    const value = op === 'is' ? (raw === 'null' ? null : raw) : op === 'in' ? parseList(raw) : unquote(raw);
    return condition(alias, col, op, value, params, { negate: Boolean(not), fromText: true });
  });
  return sqls.length ? sqls.join(` ${joiner} `) : 'TRUE';
}

// ---------------------------------------------------------------------------
// select-list parsing with embedded resources

function parseSelect(str) {
  const items = splitTop(String(str || '*').replace(/\s+/g, ' ').trim());
  return items.map((item) => {
    const embed = /^(?:([A-Za-z_][A-Za-z0-9_]*)\s*:\s*)?([A-Za-z_][A-Za-z0-9_]*)((?:![A-Za-z_][A-Za-z0-9_]*)*)\s*\((.*)\)$/s.exec(item);
    if (embed) {
      const hints = embed[3].split('!').filter(Boolean);
      return {
        kind: 'embed',
        alias: embed[1] || embed[2],
        table: embed[2],
        inner: hints.includes('inner'),
        hint: hints.find((h) => h !== 'inner' && h !== 'left') || null,
        select: embed[4].trim() || '*',
      };
    }
    if (item === '*') return { kind: 'star' };
    const aliased = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/.exec(item);
    const expr = aliased ? aliased[2].trim() : item;
    const keyName = aliased ? aliased[1] : expr.replace(/::.*$/, '').split(/->>|->/).pop().trim().replace(/^'|'$/g, '');
    return { kind: 'column', expr, alias: keyName };
  });
}

function findRelationship(s, base, target, hint) {
  let candidates = [];
  for (const fk of s.fks) {
    if (fk.src === base && fk.dst === target) candidates.push({ fk, toOne: true });
    else if (fk.src === target && fk.dst === base) candidates.push({ fk, toOne: false });
  }
  if (hint) {
    candidates = candidates.filter(({ fk, toOne }) => fk.conname === hint
      || (toOne ? fk.src_cols : fk.src_cols).includes(hint) || fk.dst_cols.includes(hint));
  }
  if (!candidates.length) {
    throw new PgrstError({
      message: `Could not find a relationship between '${base}' and '${target}' in the schema cache`,
      code: 'PGRST200',
      details: hint ? `Searched for a foreign key relationship between '${base}' and '${target}' using the hint '${hint}' in the schema 'public', but no matches were found.` : null,
      status: 400,
    });
  }
  if (candidates.length > 1) {
    throw new PgrstError({
      message: `Could not embed because more than one relationship was found for '${base}' and '${target}'`,
      code: 'PGRST201',
      details: candidates.map(({ fk }) => ({ relationship: `${fk.conname} using ${fk.src}(${fk.src_cols.join(', ')}) and ${fk.dst}(${fk.dst_cols.join(', ')})` })),
      hint: `Try changing '${target}' to one of the following: ${candidates.map(({ fk }) => `'${target}!${fk.conname}'`).join(', ')}.`,
      status: 300,
    });
  }
  return candidates[0];
}

let aliasSeq = 0;
/** SELECT-list SQL for `items` read from `alias` (a row of `table`). */
async function projection(db, table, alias, items, ctx) {
  const s = await schema(db);
  const out = [];
  const innerConds = [];
  for (const item of items) {
    if (item.kind === 'star') { out.push(`${alias}.*`); continue; }
    if (item.kind === 'column') { out.push(`${colRef(alias, item.expr)} AS ${q(item.alias)}`); continue; }
    // embedded resource
    if (!(await tableInfo(db, item.table))) {
      throw new PgrstError({ message: `Could not find a relationship between '${table}' and '${item.table}' in the schema cache`, code: 'PGRST200', status: 400 });
    }
    const { fk, toOne } = findRelationship(s, table, item.table, item.hint);
    const ea = `_e${(aliasSeq = (aliasSeq + 1) % 1e6)}`;
    const join = toOne
      ? fk.src_cols.map((c, i) => `${ea}.${q(fk.dst_cols[i])} = ${alias}.${q(c)}`).join(' AND ')
      : fk.src_cols.map((c, i) => `${ea}.${q(c)} = ${alias}.${q(fk.dst_cols[i])}`).join(' AND ');
    const sub = await projection(db, item.table, ea, parseSelect(item.select), ctx);
    const opts = ctx.embedOptions.get(item.alias) || ctx.embedOptions.get(item.table) || {};
    const order = (opts.orders || []).map((o) => orderSql(ea, o)).join(', ');
    const where = [join, ...sub.innerConds].join(' AND ');
    const inner = `SELECT ${sub.columns} FROM ${q(item.table)} AS ${ea} WHERE ${where}${order ? ` ORDER BY ${order}` : ''}${toOne ? ' LIMIT 1' : opts.limit != null ? ` LIMIT ${Number(opts.limit)}` : ''}${!toOne && opts.offset ? ` OFFSET ${Number(opts.offset)}` : ''}`;
    out.push(toOne
      ? `(SELECT row_to_json(_x) FROM (${inner}) _x) AS ${q(item.alias)}`
      : `(SELECT coalesce(json_agg(_x), '[]'::json) FROM (${inner}) _x) AS ${q(item.alias)}`);
    if (item.inner) innerConds.push(`EXISTS (SELECT 1 FROM ${q(item.table)} AS ${ea} WHERE ${join})`);
  }
  return { columns: out.join(', ') || `${alias}.*`, innerConds };
}

function orderSql(alias, o) {
  return `${colRef(alias, o.column)} ${o.ascending === false ? 'DESC' : 'ASC'}${o.nullsFirst === true ? ' NULLS FIRST' : o.nullsFirst === false ? ' NULLS LAST' : ''}`;
}

// ---------------------------------------------------------------------------
// The query builder

class QueryBuilder {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.op = 'select';
    this.columns = '*';
    this.returning = false;
    this.countMode = null;
    this.head = false;
    this.conds = []; // fn(params) → sql
    this.hasFilter = false;
    this.orders = [];
    this.embedOptions = new Map();
    this.limitN = null;
    this.offsetN = null;
    this.singleMode = null;
    this.payload = null;
    this.onConflict = null;
    this.ignoreDuplicates = false;
    this.defaultToNull = true;
    this.shouldThrow = false;
  }

  // --- verbs
  select(columns = '*', { count = null, head = false } = {}) {
    if (this.op === 'select') {
      this.columns = columns;
      this.countMode = count;
      this.head = head;
    } else {
      this.returning = true;
      this.columns = columns;
    }
    return this;
  }
  insert(values, { count = null, defaultToNull = true } = {}) {
    this.op = 'insert'; this.payload = values; this.countMode = count; this.defaultToNull = defaultToNull; return this;
  }
  upsert(values, { onConflict = null, ignoreDuplicates = false, count = null, defaultToNull = true } = {}) {
    this.op = 'upsert'; this.payload = values; this.onConflict = onConflict; this.ignoreDuplicates = ignoreDuplicates;
    this.countMode = count; this.defaultToNull = defaultToNull; return this;
  }
  update(values, { count = null } = {}) { this.op = 'update'; this.payload = values; this.countMode = count; return this; }
  delete({ count = null } = {}) { this.op = 'delete'; this.countMode = count; return this; }

  // --- filters
  _add(fn) { this.conds.push(fn); this.hasFilter = true; return this; }
  eq(c, v) { return this._add((a, p) => condition(a, c, 'eq', v, p)); }
  neq(c, v) { return this._add((a, p) => condition(a, c, 'neq', v, p)); }
  gt(c, v) { return this._add((a, p) => condition(a, c, 'gt', v, p)); }
  gte(c, v) { return this._add((a, p) => condition(a, c, 'gte', v, p)); }
  lt(c, v) { return this._add((a, p) => condition(a, c, 'lt', v, p)); }
  lte(c, v) { return this._add((a, p) => condition(a, c, 'lte', v, p)); }
  like(c, v) { return this._add((a, p) => condition(a, c, 'like', v, p)); }
  ilike(c, v) { return this._add((a, p) => condition(a, c, 'ilike', v, p)); }
  likeAnyOf(c, vs) { return this._add((a, p) => `(${vs.map((v) => condition(a, c, 'like', v, p)).join(' OR ')})`); }
  ilikeAnyOf(c, vs) { return this._add((a, p) => `(${vs.map((v) => condition(a, c, 'ilike', v, p)).join(' OR ')})`); }
  is(c, v) { return this._add((a, p) => condition(a, c, 'is', v, p)); }
  in(c, vs) { return this._add((a, p) => condition(a, c, 'in', vs, p)); }
  contains(c, v) { return this._add((a, p) => condition(a, c, 'cs', v, p)); }
  containedBy(c, v) { return this._add((a, p) => condition(a, c, 'cd', v, p)); }
  overlaps(c, v) { return this._add((a, p) => condition(a, c, 'ov', v, p)); }
  textSearch(c, query, { type = null } = {}) {
    const op = type === 'plain' ? 'plfts' : type === 'phrase' ? 'phfts' : type === 'websearch' ? 'wfts' : 'fts';
    return this._add((a, p) => condition(a, c, op, query, p));
  }
  match(obj) { for (const [c, v] of Object.entries(obj || {})) this.eq(c, v); return this; }
  not(c, op, v) {
    return this._add((a, p) => condition(a, c, op, op === 'in' ? parseList(v) : v, p, { negate: true, fromText: typeof v === 'string' }));
  }
  or(expr, { foreignTable = null, referencedTable = null } = {}) {
    if (foreignTable || referencedTable) return this; // embedded-resource filters: not used by server.js
    return this._add((a, p) => `(${logicTree(a, expr, p, 'OR')})`);
  }
  filter(c, op, v) {
    const m = /^(not\.)?([a-z]+)$/.exec(op);
    if (!m) throw new Error(`sandbox supabase: unsupported filter operator ${op}`);
    return this._add((a, p) => condition(a, c, m[2], m[2] === 'in' ? parseList(v) : m[2] === 'is' && v === 'null' ? null : v, p, { negate: Boolean(m[1]), fromText: true }));
  }

  // --- modifiers
  order(column, { ascending = true, nullsFirst, foreignTable = null, referencedTable = null } = {}) {
    const target = referencedTable || foreignTable;
    const o = { column, ascending, nullsFirst };
    if (target) {
      const opts = this.embedOptions.get(target) || {};
      (opts.orders ||= []).push(o);
      this.embedOptions.set(target, opts);
    } else {
      this.orders.push(o);
    }
    return this;
  }
  limit(n, { foreignTable = null, referencedTable = null } = {}) {
    const target = referencedTable || foreignTable;
    if (target) { const opts = this.embedOptions.get(target) || {}; opts.limit = n; this.embedOptions.set(target, opts); } else this.limitN = n;
    return this;
  }
  range(from, to, { foreignTable = null, referencedTable = null } = {}) {
    const target = referencedTable || foreignTable;
    if (target) {
      const opts = this.embedOptions.get(target) || {}; opts.offset = from; opts.limit = to - from + 1; this.embedOptions.set(target, opts);
    } else { this.offsetN = from; this.limitN = to - from + 1; }
    return this;
  }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  throwOnError() { this.shouldThrow = true; return this; }
  abortSignal() { return this; }
  returns() { return this; }
  overrideTypes() { return this; }
  csv() { return this; }
  geojson() { return this; }
  explain() { return this; }

  // --- execution
  then(onFulfilled, onRejected) { return this._execute().then(onFulfilled, onRejected); }
  catch(onRejected) { return this._execute().catch(onRejected); }
  finally(fn) { return this._execute().finally(fn); }

  async _execute() {
    let result;
    try {
      const db = await dbReady;
      log.queries += 1;
      result = await lock.standalone(`${this.op} ${this.table}`, () => this._run(db));
    } catch (err) {
      const e = pgToPostgrest(err);
      if (process.env.SANDBOX_LOG_SQL_ERRORS !== '0' && !(err instanceof PgrstError && e.status === 406)) {
        console.warn(`[sandbox-supabase] ${this.op} ${this.table}: ${e.payload.code || ''} ${e.payload.message}`);
      }
      result = { data: null, error: e.payload, count: null, status: e.status, statusText: 'Error' };
    }
    if (result.error && this.shouldThrow) {
      const err = new Error(result.error.message);
      Object.assign(err, result.error);
      throw err;
    }
    return result;
  }

  _where(alias, params, extra = []) {
    const parts = [...this.conds.map((fn) => fn(alias, params)), ...extra];
    return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
  }

  _shape(rows, count, status) {
    if (this.singleMode) {
      if (rows.length === 1) return { data: rows[0], error: null, count, status, statusText: 'OK' };
      if (rows.length === 0 && this.singleMode === 'maybe') return { data: null, error: null, count, status, statusText: 'OK' };
      throw new PgrstError({
        message: 'JSON object requested, multiple (or no) rows returned',
        code: 'PGRST116',
        details: `The result contains ${rows.length} rows`,
        hint: null,
        status: 406,
      });
    }
    return { data: rows, error: null, count, status, statusText: 'OK' };
  }

  async _run(db) {
    const info = await tableInfo(db, this.table);
    if (!info) {
      throw new PgrstError({ message: `relation "public.${this.table}" does not exist`, code: '42P01', status: 404 });
    }
    const ctx = { embedOptions: this.embedOptions };
    const A = '_t';
    const T = `"public".${q(this.table)}`;

    if (this.op === 'select') {
      const params = new Params();
      const proj = await projection(db, this.table, A, parseSelect(this.columns), ctx);
      const where = this._where(A, params, proj.innerConds);
      let count = null;
      if (this.countMode) {
        const c = await db.query(`SELECT count(*)::int AS n FROM ${T} AS ${A}${where}`, params.values);
        count = c.rows[0].n;
      }
      if (this.head) return { data: null, error: null, count, status: 200, statusText: 'OK' };
      const order = this.orders.map((o) => orderSql(A, o)).join(', ');
      const sql = `SELECT coalesce(json_agg(_r), '[]'::json)::text AS body FROM (SELECT ${proj.columns} FROM ${T} AS ${A}${where}${order ? ` ORDER BY ${order}` : ''}${this.limitN != null ? ` LIMIT ${Number(this.limitN)}` : ''}${this.offsetN ? ` OFFSET ${Number(this.offsetN)}` : ''}) _r`;
      const res = await db.query(sql, params.values);
      return this._shape(JSON.parse(res.rows[0].body), count, 200);
    }

    // writes
    const params = new Params();
    let write;
    if (this.op === 'insert' || this.op === 'upsert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      if (!rows.length) return { data: this.returning ? [] : null, error: null, count: 0, status: 201, statusText: 'Created' };
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r || {})))];
      for (const c of cols) {
        if (!info.columns.has(c)) {
          throw new PgrstError({ message: `Could not find the '${c}' column of '${this.table}' in the schema cache`, code: 'PGRST204', status: 400 });
        }
      }
      const normalised = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r?.[c] === undefined ? null : r[c]])));
      const body = params.add(JSON.stringify(normalised));
      const colList = cols.map(q).join(', ');
      // Like PostgREST: the body goes in as ONE json parameter and Postgres converts
      // it (json_populate_recordset), so types coerce exactly as they do on Supabase.
      // Keys missing from some rows of a bulk insert become NULL (supabase-js's
      // default, defaultToNull: true).
      let sql = `INSERT INTO ${T} AS ${A} (${colList}) SELECT ${cols.map((c) => `_v.${q(c)}`).join(', ')} FROM json_populate_recordset(NULL::${T}, ${body}::json) AS _v`;
      if (this.op === 'upsert') {
        const target = (this.onConflict ? String(this.onConflict).split(',').map((s) => s.trim()) : info.pk);
        if (!target.length) throw new PgrstError({ message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification', code: '42P10', status: 400 });
        const updates = cols.filter((c) => !target.includes(c));
        sql += ` ON CONFLICT (${target.map(q).join(', ')}) ${this.ignoreDuplicates || !updates.length ? 'DO NOTHING' : `DO UPDATE SET ${updates.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(', ')}`}`;
      }
      write = { sql, status: 201 };
    } else if (this.op === 'update') {
      if (!this.hasFilter) throw new PgrstError({ message: 'UPDATE requires a WHERE clause', code: '21000', status: 400 });
      const cols = Object.keys(this.payload || {});
      for (const c of cols) {
        if (!info.columns.has(c)) throw new PgrstError({ message: `Could not find the '${c}' column of '${this.table}' in the schema cache`, code: 'PGRST204', status: 400 });
      }
      if (!cols.length) return { data: this.returning ? [] : null, error: null, count: 0, status: 200, statusText: 'OK' };
      const body = params.add(JSON.stringify(Object.fromEntries(cols.map((c) => [c, this.payload[c] === undefined ? null : this.payload[c]]))));
      const where = this._where(A, params).replace(/^ WHERE /, '');
      write = {
        sql: `UPDATE ${T} AS ${A} SET ${cols.map((c) => `${q(c)} = _v.${q(c)}`).join(', ')} FROM json_populate_record(NULL::${T}, ${body}::json) AS _v WHERE ${where}`,
        status: 200,
      };
    } else if (this.op === 'delete') {
      if (!this.hasFilter) throw new PgrstError({ message: 'DELETE requires a WHERE clause', code: '21000', status: 400 });
      write = { sql: `DELETE FROM ${T} AS ${A}${this._where(A, params)}`, status: 200 };
    } else {
      throw new Error(`sandbox supabase: unknown op ${this.op}`);
    }

    const proj = this.returning ? await projection(db, this.table, A, parseSelect(this.columns), ctx) : null;
    const sql = `WITH _w AS (${write.sql} RETURNING ${A}.*) SELECT count(*)::int AS n, ${proj ? `coalesce(json_agg(_r), '[]'::json)::text` : `NULL::text`} AS body FROM (SELECT ${proj ? proj.columns : '1 AS one'} FROM _w AS ${A}) _r`;
    const res = await db.query(sql, params.values);
    const n = res.rows[0].n;
    const count = this.countMode ? n : null;
    if (!this.returning) return { data: null, error: null, count, status: write.status === 201 ? 201 : 204, statusText: write.status === 201 ? 'Created' : 'No Content' };
    return this._shape(JSON.parse(res.rows[0].body), count, write.status);
  }
}

// ---------------------------------------------------------------------------
// rpc()

class RpcBuilder {
  constructor(fn, args, opts) { this.fn = fn; this.args = args || {}; this.opts = opts || {}; this.singleMode = null; }
  single() { this.singleMode = 'single'; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  throwOnError() { this.shouldThrow = true; return this; }
  abortSignal() { return this; }
  returns() { return this; }
  then(a, b) { return this._execute().then(a, b); }
  catch(b) { return this._execute().catch(b); }

  async _execute() {
    try {
      const db = await dbReady;
      return await lock.standalone(`rpc ${this.fn}`, async () => {
        const meta = await db.query(`
          SELECT p.proretset AS set, t.typtype AS kind, t.typname AS type,
                 coalesce(p.proargnames, ARRAY[]::text[]) AS names
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_type t ON t.oid = p.prorettype
          WHERE n.nspname = 'public' AND p.proname = $1`, [this.fn]);
        if (!meta.rows.length) {
          throw new PgrstError({ message: `Could not find the function public.${this.fn}(${Object.keys(this.args).join(', ')}) in the schema cache`, code: 'PGRST202', status: 404 });
        }
        const params = new Params();
        const named = Object.entries(this.args).map(([k, v]) => `${q(k)} => ${params.add(v !== null && typeof v === 'object' ? JSON.stringify(v) : v)}`).join(', ');
        const call = `"public".${q(this.fn)}(${named})`;
        const { set, kind, type } = meta.rows[0];
        if (type === 'void') {
          await db.query(`SELECT ${call}`, params.values);
          return { data: null, error: null, count: null, status: 204, statusText: 'No Content' };
        }
        let data;
        if (set || kind === 'c') {
          const res = await db.query(`SELECT coalesce(json_agg(_r), '[]'::json)::text AS body FROM ${call} AS _r`, params.values);
          data = JSON.parse(res.rows[0].body);
          if (!set) data = data[0] ?? null;
        } else {
          const res = await db.query(`SELECT to_json(${call})::text AS body`, params.values);
          data = JSON.parse(res.rows[0].body);
        }
        if (this.singleMode && Array.isArray(data)) {
          if (data.length === 1) data = data[0];
          else if (data.length === 0 && this.singleMode === 'maybe') data = null;
          else throw new PgrstError({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: `The result contains ${data.length} rows`, status: 406 });
        }
        return { data, error: null, count: null, status: 200, statusText: 'OK' };
      });
    } catch (err) {
      const e = pgToPostgrest(err);
      console.warn(`[sandbox-supabase] rpc ${this.fn}: ${e.payload.code || ''} ${e.payload.message}`);
      if (this.shouldThrow) throw Object.assign(new Error(e.payload.message), e.payload);
      return { data: null, error: e.payload, count: null, status: e.status, statusText: 'Error' };
    }
  }
}

// ---------------------------------------------------------------------------
// storage (in memory, shared by every client like a real bucket)

const buckets = new Map(); // bucket -> Map(path -> { body: Buffer, contentType })
function bucket(name) {
  if (!buckets.has(name)) buckets.set(name, new Map());
  return buckets.get(name);
}
const storage = {
  from(name) {
    const files = bucket(name);
    return {
      async upload(path, body, { contentType = 'application/octet-stream', upsert = false } = {}) {
        if (files.has(path) && !upsert) return { data: null, error: { message: 'The resource already exists', statusCode: '409', error: 'Duplicate' } };
        const buf = Buffer.isBuffer(body) ? body : Buffer.from(body instanceof ArrayBuffer ? new Uint8Array(body) : typeof body === 'string' ? body : JSON.stringify(body));
        files.set(path, { body: buf, contentType });
        return { data: { path, id: `${name}/${path}`, fullPath: `${name}/${path}` }, error: null };
      },
      getPublicUrl(path) {
        return { data: { publicUrl: `${storagePublicBase}/${encodeURIComponent(name)}/${path.split('/').map(encodeURIComponent).join('/')}` } };
      },
      async remove(paths) {
        const removed = [];
        for (const p of paths || []) if (files.delete(p)) removed.push({ name: p });
        return { data: removed, error: null };
      },
      async download(path) {
        const f = files.get(path);
        return f ? { data: new Blob([f.body], { type: f.contentType }), error: null } : { data: null, error: { message: 'Object not found', statusCode: '404' } };
      },
      async list(prefix = '') {
        return { data: [...files.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ name: k.slice(prefix ? prefix.length + 1 : 0) })), error: null };
      },
    };
  },
  _read(name, path) { return buckets.get(name)?.get(path) || null; },
};

// ---------------------------------------------------------------------------
// client

function createClient(url, key, options = {}) {
  return {
    supabaseUrl: url,
    supabaseKey: key,
    from: (table) => new QueryBuilder(null, table),
    schema: () => ({ from: (table) => new QueryBuilder(null, table), rpc: (fn, args, opts) => new RpcBuilder(fn, args, opts) }),
    rpc: (fn, args, opts) => new RpcBuilder(fn, args, opts),
    storage,
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe: async () => 'ok' }),
    removeChannel: async () => 'ok',
    removeAllChannels: async () => [],
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: 'sandbox: auth is not emulated' } }),
      getSession: async () => ({ data: { session: null }, error: null }),
      admin: {},
    },
  };
}

module.exports = { createClient, configure, storage, log, _internal: { parseSelect, splitTop, logicTree, parseList } };
