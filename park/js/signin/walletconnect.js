// Sign in with any WalletConnect wallet on the XRP Ledger (BEAR Wallet, Joey…).
// The SDK (~250 KB) loads only when someone picks WalletConnect.
//
// Proof of ownership, in order of preference:
//   xrpl_signMessage      the wallet signs BEAR Park's challenge text
//   xrpl_signTransaction  the wallet signs, and does NOT submit, a no-op
//                         AccountSet whose memo carries the challenge
// Either way the server checks the signature (backend/wallet-sign-in.js).

import { post } from '../core/api.js';

/**
 * WalletConnect (Reown) project. BEAR Wallet's own project is used until BEAR
 * Park has one: create a free project at cloud.reown.com, allow
 * www.bearpark.xyz and bearpark.xyz, and paste its id here.
 */
export const WC_PROJECT_ID = '5f2ea584e977d9df3b5a888f15757468';

const SDK = 'https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.23.8/+esm';
const CHAIN = 'xrpl:0';
const METHODS = ['xrpl_signMessage', 'xrpl_signTransaction'];
const hex = (text) => [...new TextEncoder().encode(text)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

let clientPromise = null;
function client() {
  clientPromise ||= import(SDK)
    .then((m) => (m.SignClient || m.default).init({
      projectId: WC_PROJECT_ID,
      metadata: {
        name: 'BEAR Park',
        description: 'Sign in to BEAR Park — play, raid, earn honey.',
        url: location.origin,
        icons: [`${location.origin}/apple-touch-icon.png`],
      },
    }))
    .catch((err) => { clientPromise = null; throw err; });
  return clientPromise;
}

/** Start loading the SDK early (e.g. when the sheet opens) without waiting. */
export function warmWalletConnect() { client().catch(() => {}); }

function untilAborted(promise, signal, ms, message) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * Run the whole sign-in. `onUri(uri)` shows the pairing QR / deep link;
 * `onStatus(stage)` reports 'connected' and 'signing'. Resolves with the
 * server's sign-in answer ({ wallet, auth_token, access }).
 */
export async function walletConnectSignIn({ signal, onUri, onStatus }) {
  const wc = await client();
  const { uri, approval } = await wc.connect({
    optionalNamespaces: { xrpl: { chains: [CHAIN], methods: METHODS, events: [] } },
  });
  if (uri) onUri(uri);

  const session = await untilAborted(approval(), signal, 5 * 60_000, 'The wallet did not connect in time. Try again.');
  const ns = session.namespaces?.xrpl || {};
  const account = (ns.accounts || []).find((a) => a.startsWith(`${CHAIN}:`)) || ns.accounts?.[0] || '';
  const address = account.split(':')[2];
  if (!address) throw new Error('That wallet did not share an XRP Ledger account.');
  const methods = ns.methods || [];
  onStatus?.('connected', address);

  const ask = (method, params) => untilAborted(
    wc.request({ topic: session.topic, chainId: CHAIN, request: { method, params } }),
    signal, 3 * 60_000, 'The wallet did not answer in time. Try again.');

  try {
    const challenge = await post('/auth/challenge', {}, { signal });
    onStatus?.('signing', address);
    let proof = null;
    if (methods.includes('xrpl_signMessage')) {
      const r = await ask('xrpl_signMessage', { message: challenge.message });
      if (r?.signature && r?.publicKey) proof = { address: r.address || address, publicKey: r.publicKey, signature: r.signature };
    }
    if (!proof) {
      const r = await ask('xrpl_signTransaction', {
        tx_json: {
          TransactionType: 'AccountSet',
          Account: address,
          // Already in the past: even if the signed proof leaked, it can't be applied.
          LastLedgerSequence: 1,
          Memos: [{ Memo: { MemoType: hex('bearpark/sign-in'), MemoData: hex(challenge.message) } }],
        },
        autofill: true,
        submit: false,
      });
      const blob = r?.tx_blob || r?.signedTransaction || r?.signed_tx_blob;
      proof = blob ? { address, txBlob: blob } : { address, txJson: r?.tx_json || r };
    }
    return await post('/auth/verify', { challengeId: challenge.challengeId, via: 'walletconnect', ...proof }, { signal });
  } finally {
    // The session's only job was the signature.
    wc.disconnect({ topic: session.topic, reason: { code: 6000, message: 'Signed in to BEAR Park' } }).catch(() => {});
  }
}
