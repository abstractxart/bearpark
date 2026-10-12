// QR codes for the BEAR Wallet sign-in link. The encoder (qrcode-generator,
// MIT, 20 KB) loads only when a code is first needed.

import { h } from '../core/dom.js';

const SRC = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
let loading;

function loadEncoder() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.crossOrigin = 'anonymous';
    s.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error('QR encoder missing')));
    s.onerror = () => { loading = null; reject(new Error('QR encoder failed to load')); };
    document.head.append(s);
  });
  return loading;
}

/**
 * An SVG QR code for `text` with a 4-module quiet zone (without it scanners
 * have to be held close — the bug BEAR Swap fixed with marginSize={4}).
 */
export async function qrSvg(text, { size = 232 } = {}) {
  const qrcode = await loadEncoder();
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const q = 4;
  const total = n + q * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
    }
  }
  const svg = h('svg', { viewBox: `0 0 ${total} ${total}`, width: size, height: size, role: 'img', 'aria-label': 'Sign-in QR code', 'shape-rendering': 'crispEdges' },
    h('rect', { width: total, height: total, fill: '#fff' }),
    h('path', { d, fill: '#000' }));
  return svg;
}
