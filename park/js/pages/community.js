// Community: the bulletin board, BEAR friends, the stream and the
// BEARABLEGUY123 posters, as one pivot. Each tab is built the first time it's
// opened; the board refreshes only while it's the tab on screen, and the Kick
// player exists only while Stream is.
//
//   #/community                     the board
//   #/community?tab=friends|stream|bg123
//   #/community?post=<id>[&comment=<id>]   opens a post (notifications can link here)

import { h } from '../core/dom.js';
import { pageHead, pivot, loadCss } from '../core/ui.js';
import { arrive } from '../core/motion.js';
import { boardTab } from './community/board.js';
import { friendsTab } from './community/friends.js';
import { streamTab } from './community/stream.js';
import { postersTab } from './community/posters.js';

export const title = 'Community';

const TABS = [
  { id: 'board', label: 'Board' },
  { id: 'friends', label: 'Friends' },
  { id: 'stream', label: 'Stream' },
  { id: 'bg123', label: 'BEARABLEGUY123' },
];
const IDS = TABS.map((t) => t.id);
const tabFrom = (q) => (q.get('post') ? 'board' : IDS.includes(q.get('tab')) ? q.get('tab') : 'board');

export default function community({ wallet, query, signal, scope }) {
  loadCss('community');
  let current = tabFrom(query);

  const syncUrl = () => {
    const q = current === 'board' ? '' : `?tab=${current}`;
    if (location.hash !== `#/community${q}`) history.replaceState(null, '', `#/community${q}`);
  };

  const make = {
    board: () => boardTab({ wallet, signal, scope, onDeepLinkDone: () => { if (/[?&](post|comment)=/.test(location.hash)) syncUrl(); } }),
    friends: () => friendsTab({ wallet, signal }),
    stream: () => streamTab(),
    bg123: () => postersTab(),
  };
  const built = {};
  const host = h('div.cm-panels');

  function tab(id) {
    if (!built[id]) {
      const t = make[id]();
      const panel = h('div.cm-panel', { role: 'tabpanel', id: `panel-${id}`, 'aria-labelledby': `tab-${id}`, hidden: true }, t.el);
      host.append(panel);
      piv.querySelector(`#tab-${id}`)?.setAttribute('aria-controls', `panel-${id}`);
      built[id] = { ...t, panel };
    }
    return built[id];
  }

  function show(id, animate) {
    for (const [k, t] of Object.entries(built)) {
      if (k !== id && !t.panel.hidden) { t.panel.hidden = true; t.hide?.(); }
    }
    const t = tab(id);
    t.panel.hidden = false;
    t.show?.();
    if (animate) arrive(t.panel.querySelectorAll('[data-e]'), { school: 'panorama', stagger: 40 });
  }

  const piv = pivot(TABS, {
    selected: current, align: 'start', label: 'Community',
    onChange: (id, user) => { current = id; show(id, true); if (user) syncUrl(); },
  });

  const el = h('main.page.cm-page',
    pageHead({ eyebrow: 'What are the BEARs up to?', title: 'Community', gold: 'Community' }),
    h('div.cm-pivot', { 'data-e': '' }, piv, h('div.rule')),
    host);

  show(current, false);
  if (query.get('post')) tab('board').want(query.get('post'), query.get('comment'));

  el.onQuery = (q) => {
    const next = tabFrom(q);
    if (next !== current) piv.select(next);
    if (q.get('post')) tab('board').want(q.get('post'), q.get('comment'));
  };
  scope.add(() => { for (const t of Object.values(built)) t.hide?.(); });
  return el;
}
