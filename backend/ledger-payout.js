// One XRPL payment from a hot wallet, with an outcome the caller can act on.
//
// Honey buys tokens and gates $BEAR drops, so a payout's outcome decides whether
// honey is refunded or a claim is reopened. Getting that wrong pays twice. Four
// outcomes, and what the caller must do with each:
//
//   not_submitted  nothing left this process; refund / reopen is safe
//   success        validated tesSUCCESS
//   failed         definitively not delivered (validated tec*, or provably never
//                  in a validated ledger up to its LastLedgerSequence); refund ok
//   unknown        it may have landed. NEVER refund or reopen; keep the hash for
//                  an admin to reconcile.
//
// Why not trust submitAndWait's own error? xrpl.js throws "latest ledger sequence
// N is greater than the transaction's LastLedgerSequence" without re-checking
// whether the transaction validated in that very last ledger, so that error does
// not prove failure. We ask the ledger by hash over the exact range instead.

const LEDGER_RANGE_SLACK = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function resultCode(txResult) {
  return txResult?.meta?.TransactionResult || txResult?.result?.meta?.TransactionResult || null;
}

/**
 * Was `hash` validated in [minLedger, lastLedger]? Waits (bounded) for the
 * network to pass lastLedger, then asks rippled to search that whole range.
 * Returns { status: 'success'|'failed'|'unknown', code }.
 */
async function settleByHash(client, { hash, minLedger, lastLedger, maxWaitMs = 45000, pollMs = 1500 }) {
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    let validatedIndex;
    try {
      validatedIndex = await client.getLedgerIndex();
    } catch {
      return { status: 'unknown', code: 'ledger_unreachable' };
    }

    try {
      const response = await client.request({
        command: 'tx',
        transaction: hash,
        min_ledger: minLedger,
        max_ledger: lastLedger,
      });
      if (response?.result?.validated) {
        const code = resultCode(response.result) || response.result?.meta?.TransactionResult;
        return { status: code === 'tesSUCCESS' ? 'success' : 'failed', code, ledger_index: response.result.ledger_index };
      }
    } catch (err) {
      const data = err?.data || {};
      const notFound = data.error === 'txnNotFound';
      const searchedAll = data.searched_all === true || data.result?.searched_all === true;
      if (notFound && searchedAll && validatedIndex > lastLedger) {
        return { status: 'failed', code: 'expired_unvalidated' };
      }
      if (!notFound) return { status: 'unknown', code: data.error || 'lookup_failed' };
    }

    if (Date.now() >= deadline) return { status: 'unknown', code: 'still_pending' };
    await sleep(pollMs);
  }
}

/**
 * Autofill, sign, submit and wait for `payment` from `wallet`.
 * `onSigned({ hash, lastLedger })` runs after signing and before submitting, so
 * the caller can record the hash first (a crash after that point still leaves it).
 */
async function sendPaymentOnce({ client, wallet, payment, onSigned, settle = settleByHash }) {
  let prepared;
  let signed;
  let minLedger;
  try {
    minLedger = await client.getLedgerIndex();
    prepared = await client.autofill(payment);
    signed = wallet.sign(prepared);
  } catch (error) {
    return { status: 'not_submitted', error };
  }

  const hash = signed.hash;
  const lastLedger = prepared.LastLedgerSequence;
  if (!Number.isInteger(lastLedger)) {
    return { status: 'not_submitted', error: new Error('payment has no LastLedgerSequence') };
  }

  if (onSigned) {
    try {
      await onSigned({ hash, lastLedger });
    } catch (error) {
      return { status: 'not_submitted', hash, error };
    }
  }

  try {
    const response = await client.submitAndWait(signed.tx_blob);
    const code = resultCode(response);
    if (response?.result?.validated && code) {
      return { status: code === 'tesSUCCESS' ? 'success' : 'failed', code, hash, ledger_index: response.result.ledger_index };
    }
  } catch (error) {
    const settled = await settle(client, { hash, minLedger: Math.max(1, minLedger - LEDGER_RANGE_SLACK), lastLedger });
    return { ...settled, hash, error };
  }

  const settled = await settle(client, { hash, minLedger: Math.max(1, minLedger - LEDGER_RANGE_SLACK), lastLedger });
  return { ...settled, hash };
}

module.exports = { sendPaymentOnce, settleByHash };
