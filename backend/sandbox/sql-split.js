// Split a SQL script into statements the way psql would: semicolons end a
// statement only at the top level, never inside quotes, dollar-quoted bodies,
// identifiers or comments.

function splitSql(text) {
  const out = [];
  let buf = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    // -- line comment
    if (c === '-' && next === '-') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? n : end + 1;
      buf += text.slice(i, stop);
      i = stop;
      continue;
    }
    // /* block comment */ (Postgres nests them)
    if (c === '/' && next === '*') {
      let depth = 0;
      let j = i;
      while (j < n) {
        if (text[j] === '/' && text[j + 1] === '*') { depth += 1; j += 2; continue; }
        if (text[j] === '*' && text[j + 1] === '/') { depth -= 1; j += 2; if (depth === 0) break; continue; }
        j += 1;
      }
      buf += text.slice(i, j);
      i = j;
      continue;
    }
    // 'string' (with '' escapes; E'' strings also allow backslash escapes)
    if (c === "'") {
      const escaped = /[eE]$/.test(buf) && !/[A-Za-z0-9_][eE]$/.test(buf);
      let j = i + 1;
      while (j < n) {
        if (escaped && text[j] === '\\') { j += 2; continue; }
        if (text[j] === "'") {
          if (text[j + 1] === "'") { j += 2; continue; }
          break;
        }
        j += 1;
      }
      buf += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // "identifier"
    if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') { j += 2; continue; }
          break;
        }
        j += 1;
      }
      buf += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // $tag$ ... $tag$
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i, i + 64));
      if (m && !/[A-Za-z0-9_]$/.test(buf)) {
        const tag = m[0];
        const end = text.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        buf += text.slice(i, stop);
        i = stop;
        continue;
      }
    }
    if (c === ';') {
      if (stripComments(buf).trim()) out.push(buf.trim());
      buf = '';
      i += 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  if (stripComments(buf).trim()) out.push(buf.trim());
  return out;
}

/** The statement without its comments (for logging and for "is this empty?"). */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** First meaningful line of a statement, for logs. */
function headline(sql) {
  return stripComments(sql).replace(/\s+/g, ' ').trim().slice(0, 110);
}

module.exports = { splitSql, stripComments, headline };
