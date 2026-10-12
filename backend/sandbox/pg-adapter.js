// A stand-in for the `pg` package (node-postgres) that runs on the sandbox's
// PGlite database. server.js uses `new Pool(...)`, `pool.query(text, params)`,
// `pool.connect()` → client.query(...) / client.release(), and BEGIN/COMMIT/
// ROLLBACK on a checked-out client.
//
// Values come back the way node-postgres returns them: int8 and numeric as
// strings, timestamps as Date, json as objects.

const { EventEmitter } = require('events');
const lock = require('./pg-lock');

let dbReady = null; // Promise<PGlite>
function configure(promise) { dbReady = promise; }

const PARSERS = {
  20: (v) => v, // int8 → string, like node-postgres
  1700: (v) => v, // numeric → string
  1082: (v) => { // date → local midnight, like node-postgres
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : v;
  },
};

function normaliseArgs(text, values, cb) {
  if (text && typeof text === 'object') {
    cb = typeof values === 'function' ? values : cb;
    values = text.values;
    text = text.text;
  }
  if (typeof values === 'function') { cb = values; values = undefined; }
  return { text: String(text), values, cb };
}

// node-postgres serialises objects as JSON, Dates as timestamps and Buffers as
// bytea; arrays become Postgres arrays.
function prepareValue(v) {
  if (v === undefined) return null;
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Date || Buffer.isBuffer(v) || v instanceof Uint8Array || Array.isArray(v)) return v;
  return JSON.stringify(v);
}

function toResult(res, text) {
  const command = (/^\s*(?:--[^\n]*\n\s*)*([A-Za-z]+)/.exec(text)?.[1] || '').toUpperCase();
  const rows = res.rows || [];
  const dml = command === 'INSERT' || command === 'UPDATE' || command === 'DELETE' || command === 'MERGE';
  return {
    command,
    rowCount: dml ? (res.affectedRows ?? rows.length) : rows.length,
    rows,
    fields: (res.fields || []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    oid: null,
  };
}

async function execute(text, values) {
  const db = await dbReady;
  if (values && values.length) {
    const res = await db.query(text, values.map(prepareValue), { parsers: PARSERS });
    return toResult(res, text);
  }
  const results = await db.exec(text, { parsers: PARSERS });
  if (results.length <= 1) return toResult(results[0] || { rows: [] }, text);
  return results.map((r) => toResult(r, text));
}

function withCallback(promise, cb) {
  if (typeof cb !== 'function') return promise;
  promise.then((r) => cb(null, r), (e) => cb(e));
  return undefined;
}

const BEGIN_RE = /^\s*(BEGIN|START\s+TRANSACTION)\b/i;
const END_RE = /^\s*(COMMIT|ROLLBACK|END|ABORT)\s*(;|$|\s+(WORK|TRANSACTION)\b)/i;

class Client extends EventEmitter {
  constructor(pool = null) {
    super();
    this.pool = pool;
    this.tx = null;
    this.released = false;
  }

  connect(cb) { return withCallback(Promise.resolve(this), cb); }

  query(textOrConfig, valuesOrCb, maybeCb) {
    const { text, values, cb } = normaliseArgs(textOrConfig, valuesOrCb, maybeCb);
    let promise;
    if (BEGIN_RE.test(text) && !this.tx) {
      // Claim the connection for this transaction; the caller's flow owns it.
      const token = lock.newToken(text);
      this.tx = token;
      lock.enterFlow(token);
      promise = this.txQueue = lock.acquire(token).then(() => execute(text, values)).catch((err) => {
        lock.release(token);
        this.tx = null;
        throw err;
      });
    } else if (this.tx) {
      const token = this.tx;
      promise = this.txQueue = (this.txQueue || Promise.resolve()).catch(() => {}).then(() => execute(text, values)).finally(() => {
        if (END_RE.test(text)) {
          this.tx = null;
          lock.release(token);
        }
      });
    } else {
      promise = lock.standalone(text, () => execute(text, values));
    }
    return withCallback(promise, cb);
  }

  release() {
    if (this.released) return;
    this.released = true;
    if (this.tx) {
      // Released inside a transaction: roll it back rather than leak the lock.
      const token = this.tx;
      this.tx = null;
      execute('ROLLBACK').catch(() => {}).finally(() => lock.release(token));
    }
    if (this.pool) this.pool._checkedOut -= 1;
  }

  end(cb) { this.release(); return withCallback(Promise.resolve(), cb); }
}

class Pool extends EventEmitter {
  constructor(config = {}) {
    super();
    this.options = config;
    this._checkedOut = 0;
  }

  query(textOrConfig, valuesOrCb, maybeCb) {
    const { text, values, cb } = normaliseArgs(textOrConfig, valuesOrCb, maybeCb);
    return withCallback(lock.standalone(text, () => execute(text, values)), cb);
  }

  connect(cb) {
    this._checkedOut += 1;
    return withCallback(Promise.resolve(new Client(this)), cb);
  }

  end(cb) { return withCallback(Promise.resolve(), cb); }
  get totalCount() { return this._checkedOut; }
  get idleCount() { return 0; }
  get waitingCount() { return 0; }
}

const types = {
  setTypeParser() {},
  getTypeParser() { return (v) => v; },
  builtins: {},
};

module.exports = { Pool, Client, types, configure, native: null, defaults: {} };
