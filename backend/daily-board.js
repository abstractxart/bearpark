// Flappy Bear Daily Run leaderboards.
//
// Each day's course gets its own board, stored as its own game_id in
// game_leaderboards: "flappy-bear-daily-2026-10-10". The table already keeps
// one row per (wallet, game_id) and only replaces it on a higher score, so a
// game_id per day IS a daily board - each wallet's best for that day - with
// no schema change. The row's metadata carries that run's ghost (a compact
// recording the game replays for other players to race).
//
// Kept apart from the all-time "flappy-bear" board on purpose: the Daily is
// one known course that can be practised, so it is ranked only against itself.

const DAILY_GAME_ID = /^flappy-bear-daily-(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;
// A ghost is ~40 chars per pipe; this allows runs far longer than anyone flies.
const MAX_GHOST_CHARS = 100000;
const GHOST_CHARS = /^[A-Za-z0-9_-]+$/;

function isDailyGameId(gameId) {
  return typeof gameId === 'string' && gameId.startsWith('flappy-bear-daily');
}

/** The board's date as a UTC midnight timestamp, or null if malformed. */
function dailyBoardDate(gameId) {
  const m = DAILY_GAME_ID.exec(typeof gameId === 'string' ? gameId : '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // Reject dates that roll over (2026-02-31) rather than silently moving them.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t;
}

/**
 * Is this board taking scores right now? Players post their LOCAL date, and
 * somewhere in the world it is the UTC date's yesterday or tomorrow, so a
 * board is open from one day before to one day after its date in UTC.
 * Older and future boards are closed: no backfilling, no squatting.
 */
function isOpenDailyBoard(gameId, now = Date.now()) {
  const day = dailyBoardDate(gameId);
  if (day === null) return false;
  const d = new Date(now);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.abs(day - today) <= DAY_MS;
}

/**
 * Metadata as stored for a daily score: a ghost is kept only if it looks
 * like one (bounded, base64url). Anything else is dropped, never stored.
 */
function cleanDailyMetadata(metadata) {
  const m = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
  if ('ghost' in m) {
    const g = m.ghost;
    if (typeof g !== 'string' || g.length === 0 || g.length > MAX_GHOST_CHARS || !GHOST_CHARS.test(g)) delete m.ghost;
  }
  return m;
}

/**
 * Leaderboard lists send no ghosts - ten of them would weigh more than the
 * rest of the response - just a flag that one exists. The single-entry
 * endpoint returns it in full, for the game to race.
 */
function withoutGhost(entry) {
  if (!entry || !entry.metadata || typeof entry.metadata !== 'object' || !entry.metadata.ghost) return entry;
  const { ghost, ...rest } = entry.metadata;
  return { ...entry, metadata: { ...rest, has_ghost: true } };
}

module.exports = {
  DAILY_GAME_ID,
  MAX_GHOST_CHARS,
  isDailyGameId,
  dailyBoardDate,
  isOpenDailyBoard,
  cleanDailyMetadata,
  withoutGhost,
};
