// BEAR Park's own data, as shared live feeds. A feed is fetched once and every
// page that shows it reads the same copy, so the header's honey and the Earn
// page's honey can never disagree, and nothing polls twice.

import { api, live } from './api.js';

const feed = (key, path, every, pick = (r) => r) => live(key, async () => pick(await api(path)), { every });

/** { total_points, raiding_points, games_points, twitter_connected, twitter_username } */
export const points = (w) => feed(`park:points:${w}`, `/points/${w}`, 60_000);

/** The profile row: { display_name, avatar_nft, bio, equipped_ring_id, equipped_banner_id, honey… } or null. */
export const profile = (w) => feed(`park:profile:${w}`, `/profile/${w}`, 5 * 60_000, (r) => r.profile || null);

/** { ring, banner } cosmetic items (with image_url) or nulls. */
export const equipped = (w) => feed(`park:equipped:${w}`, `/cosmetics/equipped/${w}`, 10 * 60_000, (r) => r.equipped || { ring: null, banner: null });

/** { minutes_today, max_minutes, remaining_minutes, can_earn_points, points_earned_today } */
export const dailyGames = (w) => feed(`park:daily:${w}`, `/games/daily-status/${w}/all-games`, 60_000);

/** Honey earned in the last 24h (the BEARdrops threshold reads this). */
export const honey24h = (w) => feed(`park:honey24h:${w}`, `/honey-points/24h?wallet=${w}`, 60_000, (r) => Number(r.points) || 0);

/** { followers, following } */
export const followCounts = (w) => feed(`park:follows:${w}`, `/follow/counts/${w}`, 5 * 60_000);

/** Notifications, newest first. */
export const notifications = (w) => feed(`park:notes:${w}`, `/notifications/${w}`, 60_000, (r) => r.notifications || []);

/** Top honey earners and the viewer's rank: { leaderboard, userRank } */
export const honeyBoard = (w) => feed(`park:honeyboard:${w || 'anon'}`, `/leaderboard?limit=25${w ? `&wallet=${w}` : ''}`, 60_000,
  (r) => ({ leaderboard: r.leaderboard || [], userRank: r.userRank || null }));

/** Active raids. */
export const raids = live('park:raids', async () => (await api('/raids/current')).raids || [], { every: 30_000 });

/** Admin role row: { role: 'master'|'admin'|'moderator', is_active } or null (UI only; the server enforces). */
export const role = (w) => feed(`park:role:${w}`, `/admin/check-role/${w}`, 10 * 60_000, (r) => r.role || null);

// Cosmetics for many people at once (leaderboards, feeds), batched and cached.
const equippedCache = new Map();
export async function equippedFor(wallets) {
  const need = [...new Set(wallets.filter((w) => w && !equippedCache.has(w)))];
  for (let i = 0; i < need.length; i += 50) {
    const chunk = need.slice(i, i + 50);
    try {
      const res = await api(`/cosmetics/equipped-batch?wallets=${chunk.join(',')}`);
      const map = res.equipped || res.data || {};
      for (const w of chunk) equippedCache.set(w, map[w] || map[w.toLowerCase()] || { ring: null, banner: null });
    } catch {
      for (const w of chunk) equippedCache.set(w, { ring: null, banner: null });
    }
  }
  return Object.fromEntries(wallets.map((w) => [w, equippedCache.get(w) || { ring: null, banner: null }]));
}

/** Refresh everything that a game or raid could have changed. */
export function honeyChanged(w) {
  if (!w) return;
  points(w).refresh();
  dailyGames(w).refresh();
  honey24h(w).refresh();
  honeyBoard(w).refresh();
}
