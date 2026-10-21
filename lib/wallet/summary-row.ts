// rails-server's GET /api/wallet/:address/positions (api/src/routes/wallet.ts;
// the wallet_positions table, mig 395), and the small helpers every family's
// shaping in lib/wallet/families/ shares. SERVER-ONLY by use: the route and
// the page read through lib/wallet/read-wallet.ts.

export interface WalletSummaryRow {
  chain: "ethereum" | "base" | "arbitrum";
  family: string;
  positionId: string;
  owner: string;
  market: string | null;
  status: "open" | "closed" | "liquidated" | "redeemed";
  collateral: { amount: string; symbol: string | null } | null;
  debt: { amount: string; symbol: string | null } | null;
  collateralUsd: number | null;
  debtUsd: number | null;
  usdSource: string | null;
  peakCollateral: string | null;
  peakDebt: string | null;
  openedAt: number | null;
  closedAt: number | null;
  lastActivityAt: number | null;
  txCount: number | null;
  liquidationCount: number | null;
  readBlock: number | null;
  readAt: string | null;
  href: string;
  /** The family listing route's row, as rails-server's family route answers it. */
  card: unknown;
  writtenAt: string;
}

export interface WalletSummaryAnswer {
  address: string;
  rows: WalletSummaryRow[];
  total: number;
  open: number;
  closed: number;
  limit: number;
  offset: number;
}

/** The buffer from a liquidation-line ratio: capacity over debt, 1 at the
 *  line (a health factor). With the debt held, the collateral price can fall
 *  by 1 − 1/HF before the line. */
export const bufferFromHealth = (hf: number | null | undefined): number | undefined =>
  hf != null && Number.isFinite(hf) && hf > 0 ? 1 - 1 / hf : undefined;

export const isoSeconds = (iso: string | null | undefined): number | undefined => {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
};

/** A nullable figure from the summary row as an optional one. */
export const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

/** A raw integer amount scaled to its decimals; 0 on anything unreadable. */
export function scaled(raw: string | null | undefined, decimals: number): number {
  if (!raw) return 0;
  try {
    const big = BigInt(raw.split(".")[0]);
    const d = BigInt(10) ** BigInt(decimals);
    return Number(big / d) + Number(big % d) / Number(d);
  } catch {
    return 0;
  }
}

/** "12.4K" style amount with its symbol, for the History table. */
export function amountText(amount: number, symbol: string | null | undefined): string {
  const n =
    amount >= 1000
      ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(amount)
      : amount.toLocaleString("en-US", { maximumFractionDigits: amount < 1 ? 4 : 2 });
  return symbol ? `${n} ${symbol}` : n;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The History fields every family takes from the summary row's own columns. */
export function historyBase(r: WalletSummaryRow) {
  return {
    closedAt: opt(r.closedAt),
    openedAt: opt(r.openedAt),
    txCount: opt(r.txCount),
  };
}

/** The store's read stamp of a row. */
export function storeStamp(r: WalletSummaryRow) {
  return { readAtBlock: opt(r.readBlock), readAt: isoSeconds(r.readAt) };
}

/** Run `fn` with an abort after `ms`; the abort is the family's budget. */
export async function withBudget<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort.abort();
      reject(new Error(`no answer within ${Math.round(ms / 1000)} s`));
    }, ms);
  });
  try {
    return await Promise.race([fn(abort.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
