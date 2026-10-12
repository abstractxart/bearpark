// BEARABLEGUY123: the riddle posters as a Metro flip view — swipe, arrows,
// keys or dots; tap a poster to see it full size. Nothing auto-advances.

import { h, icon } from '../../core/dom.js';
import { dialog, external } from '../../core/ui.js';
import { roll, skip } from '../../core/motion.js';
import { R2 } from './common.js';
import { POSTERS as MEDIA } from '../../core/art.js';

// The originals (~1 MB each) stay on R2 for "Open the original"; the page shows
// right-sized WebP copies from /park/media.
const ORIGINALS = ['f6k3b1.jpg', '18vwoq.jpg', 'ruozs3.jpg', 'ha4uwj.jpg', 'n0le0t.jpg', 'wbin3t.jpg', 'lrtbxe.png'].map((f) => `${R2}/${f}`);
const POSTERS = MEDIA.map((m) => m.src);
const pad = (n) => String(n).padStart(2, '0');

export function postersTab() {
  const n = POSTERS.length;
  let i = 0;
  let drag = null;
  let dragged = false;

  const slides = POSTERS.map((src, k) => h('div.cm-flip__slide', { role: 'group', 'aria-roledescription': 'slide', 'aria-label': `Poster ${k + 1} of ${n}` },
    h('img', { src, srcset: MEDIA[k].srcset, sizes: '(min-width: 900px) 720px, 100vw', alt: `BEARABLEGUY123 riddle poster ${k + 1}`, loading: k === 0 ? 'eager' : 'lazy', decoding: 'async', draggable: false })));
  const track = h('div.cm-flip__track', slides);
  const view = h('div.cm-flip__view', track);
  const prev = h('button.icon-btn.cm-flip__nav.cm-flip__nav--prev', { type: 'button', 'aria-label': 'Previous poster', onclick: () => go(i - 1) }, icon('chevron-left'));
  const next = h('button.icon-btn.cm-flip__nav.cm-flip__nav--next', { type: 'button', 'aria-label': 'Next poster', onclick: () => go(i + 1) }, icon('chevron-right'));
  const stage = h('div.frost.cm-flip__stage', {
    tabIndex: 0, role: 'region', 'aria-roledescription': 'carousel',
    'aria-label': 'BEARABLEGUY123 posters. Left and right arrows flip, Enter opens full size.',
  }, view, prev, next);

  const now = h('span.cm-flip__now.num');
  const dots = POSTERS.map((_, k) => h('button.cm-flip__dot', { type: 'button', 'aria-label': `Poster ${k + 1}`, onclick: () => go(k) }, h('i')));
  const full = h('button.btn.btn--line.btn--sm', { type: 'button', onclick: (e) => openFull(e.currentTarget) }, icon('image'), 'Full size');

  function go(k, animate = true) {
    const to = Math.max(0, Math.min(n - 1, k));
    i = to;
    track.style.transition = animate && !skip() ? '' : 'none';
    track.style.transform = `translateX(${-i * 100}%)`;
    if (!animate) { void track.offsetWidth; track.style.transition = ''; }
    roll(now, pad(i + 1));
    dots.forEach((d, j) => d.setAttribute('aria-current', j === i ? 'true' : 'false'));
    slides.forEach((s, j) => s.setAttribute('aria-hidden', String(j !== i)));
    prev.disabled = i === 0;
    next.disabled = i === n - 1;
    // The poster on show shimmers until it lands (they're ~1 MB each); once it
    // has, its neighbours start loading so the next flip is instant.
    const slide = slides[i];
    const img = slide.querySelector('img');
    const warm = () => { for (const j of [i - 1, i + 1]) slides[j]?.querySelector('img')?.setAttribute('loading', 'eager'); };
    if (img.complete && img.naturalWidth) { slide.classList.remove('sk'); warm(); }
    else if (!slide.classList.contains('sk')) {
      slide.classList.add('sk');
      const settle = () => { slide.classList.remove('sk'); warm(); };
      img.addEventListener('load', settle, { once: true });
      img.addEventListener('error', settle, { once: true });
    }
  }

  function openFull(origin) {
    const src = POSTERS[i];
    dialog({
      eyebrow: 'BEARABLEGUY123', title: `Poster ${i + 1} of ${n}`, size: 'xl', origin,
      body: [h('img.cm-full-poster', { src, alt: `BEARABLEGUY123 riddle poster ${i + 1}`, decoding: 'async' })],
      foot: [external(ORIGINALS[i], 'Open the original')],
    });
  }

  // ── keys ──
  stage.addEventListener('keydown', (e) => {
    if (e.target !== stage) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(n - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFull(slides[i]); }
  });

  // ── swipe: the track follows the finger, then lands on a poster ──
  view.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragged = false;
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, id: e.pointerId, on: false };
  });
  view.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (Math.abs(dx) < 8) return;
      drag.on = true;
      dragged = true;
      view.setPointerCapture(e.pointerId);
      track.style.transition = 'none';
    }
    const edge = (i === 0 && dx > 0) || (i === n - 1 && dx < 0);
    drag.dx = edge ? dx * 0.3 : dx;
    track.style.transform = `translateX(calc(${-i * 100}% + ${drag.dx}px))`;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { on, dx, t } = drag;
    drag = null;
    if (!on) return;
    track.style.transition = '';
    const w = view.clientWidth || 1;
    const v = dx / Math.max(1, performance.now() - t);
    if (dx < -w * 0.18 || v < -0.5) go(i + 1);
    else if (dx > w * 0.18 || v > 0.5) go(i - 1);
    else go(i);
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  view.addEventListener('click', () => { if (!dragged) openFull(slides[i]); dragged = false; });

  // The castle poster (the lightest file, and the last in the flip) sets the scene.
  const band = h('section.park-band.cm-bg-band', { 'data-e': '' },
    h('img', { src: MEDIA[n - 1].thumb, alt: '', decoding: 'async' }),
    h('div.zune',
      h('div.eyebrow', 'Since 2018'),
      h('h2.park-title.park-title--sm', 'BEARABLE', h('span.gold', 'GUY123')),
      h('p.cm-bg-band__line', 'Bearableguy posts riddles as pictures of a red-masked bear. The community has cracked hints like ', h('b.gold', '589'), '. Look closer.')));

  const flip = h('section.cm-flip', { 'data-e': '' },
    stage,
    h('div.cm-flip__bar',
      h('div.cm-flip__count', now, h('span.cm-flip__of.num', `/ ${pad(n)}`)),
      h('div.cm-flip__dots', { role: 'group', 'aria-label': 'Choose a poster' }, dots),
      full));

  go(0, false);

  return { el: h('div.stack.cm-bg', { style: { '--gap': '18px' } }, band, flip) };
}
