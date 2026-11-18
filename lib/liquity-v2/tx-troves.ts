// The read behind a Liquity V2 deposit card's "In this transaction" line
// (rails-ops ui-jobs 751): the Trove operations one transaction logged,
// through the proxy at app/api/liquity-v2/tx/[hash]/troves. The card's rows
// are read in the browser, so this read is too, once the card's Explanation
// mounts. Any failure is null and the card draws no line; a mined
// transaction's Troves do not change, so a read with rows is kept for the page.

import { useEffect, useState } from "react";
import { TX_HASH, type TxTrovesResponse } from "./tx-troves-words";

const reads = new Map<string, Promise<TxTrovesResponse | null>>();

async function fetchTxTroves(hash: string): Promise<TxTrovesResponse | null> {
  try {
    const res = await fetch(`/api/liquity-v2/tx/${hash}/troves`);
    if (!res.ok) return null;
    const body = (await res.json()) as TxTrovesResponse;
    return Array.isArray(body?.rows) ? body : null;
  } catch {
    return null;
  }
}

function readTxTroves(hash: string): Promise<TxTrovesResponse | null> {
  const key = hash.toLowerCase();
  let p = reads.get(key);
  if (!p) {
    p = fetchTxTroves(key);
    // A failed or empty read is asked again at the next mount: the index may
    // not have reached a new transaction yet.
    p.then((r) => (r == null || r.rows.length === 0) && reads.delete(key));
    reads.set(key, p);
  }
  return p;
}

/** The transaction's Trove operations: undefined while read, null on failure. */
export function useTxTroves(hash: string): TxTrovesResponse | null | undefined {
  const valid = TX_HASH.test(hash);
  const [got, setGot] = useState<{ hash: string; res: TxTrovesResponse | null } | null>(null);
  useEffect(() => {
    if (!valid) return;
    let live = true;
    readTxTroves(hash).then((res) => live && setGot({ hash, res }));
    return () => {
      live = false;
    };
  }, [hash, valid]);
  if (!valid) return null;
  return got?.hash === hash ? got.res : undefined;
}
