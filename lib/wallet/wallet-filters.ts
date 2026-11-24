// The wallet page's filters (ui-jobs 738): the Protocol pill and the
// position-kind pill, as URL params `protocol` and `kind`. With one protocol
// chosen the page reads that protocol alone (lib/wallet/read-wallet.ts,
// `readWallet(…, { protocol })`). Client-safe: no reads.

import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { WalletSummaryRow } from "@/lib/wallet/summary-row";

export type WalletKind = "troves" | "deposits" | "stakes" | "loans" | "vaults";

export const WALLET_KINDS: { value: WalletKind; label: string }[] = [
  { value: "troves", label: "Troves" },
  { value: "deposits", label: "Deposits" },
  { value: "stakes", label: "LQTY stakes" },
  { value: "loans", label: "Loans" },
  { value: "vaults", label: "Vaults" },
];

/** A protocol the wallet page reads: its explorer slug (the summary rows'
 *  `family`), its name and the kinds of position it holds. */
export interface WalletProtocol {
  slug: string;
  name: string;
  kinds: WalletKind[];
  /** Read on Arbitrum too, where the wallet has been opened there. */
  arbitrum?: boolean;
}

/** In the wallet read's order (WALLET_FAMILIES), one entry per protocol
 *  whatever its chains. */
export const WALLET_PROTOCOLS: WalletProtocol[] = [
  { slug: "aave-v3", name: "Aave V3", kinds: ["loans", "deposits"], arbitrum: true },
  { slug: "aave-v4", name: "Aave V4", kinds: ["loans", "deposits"] },
  { slug: "compound-v3", name: "Compound V3", kinds: ["loans", "deposits"], arbitrum: true },
  { slug: "morpho", name: "Morpho Blue", kinds: ["loans", "deposits"], arbitrum: true },
  { slug: "liquity-v2", name: "Liquity V2", kinds: ["troves", "deposits"] },
  { slug: "liquity-v1", name: "Liquity V1", kinds: ["troves", "deposits", "stakes"] },
  { slug: "makerdao", name: "MakerDAO", kinds: ["vaults"] },
  { slug: "spark", name: "SparkLend", kinds: ["loans", "deposits"] },
  { slug: "fluid", name: "Fluid", kinds: ["vaults"] },
  { slug: "ebisu", name: "Ebisu", kinds: ["troves", "deposits"] },
  { slug: "asymmetry", name: "Asymmetry", kinds: ["troves", "deposits"] },
  { slug: "basedollar", name: "Basedollar", kinds: ["troves", "deposits"] },
  { slug: "compound-v2", name: "Compound V2", kinds: ["loans", "deposits"] },
  { slug: "moonwell", name: "Moonwell", kinds: ["loans", "deposits"] },
  { slug: "seamless", name: "Seamless", kinds: ["loans", "deposits"] },
  { slug: "euler-v2", name: "Euler V2", kinds: ["loans", "deposits"] },
  { slug: "sky-savings", name: "Sky Savings", kinds: ["deposits"] },
  { slug: "llamalend", name: "LlamaLend", kinds: ["loans"] },
  { slug: "dolomite", name: "Dolomite", kinds: ["loans", "deposits"] },
  { slug: "alchemix", name: "Alchemix", kinds: ["loans", "deposits"] },
  { slug: "maple", name: "Maple", kinds: ["deposits"] },
  { slug: "fx", name: "f(x) Protocol", kinds: ["loans"] },
  { slug: "frankencoin", name: "Frankencoin", kinds: ["loans"] },
  { slug: "pwn", name: "PWN", kinds: ["loans", "deposits"] },
  { slug: "polaris", name: "Polaris", kinds: ["loans", "deposits"] },
  // MetaMorpho, Yearn V3 and Aave's vaults, from the holder census (ui-jobs
  // 783): a share holding is a deposit.
  { slug: "vaults", name: "Vault shares", kinds: ["deposits"] },
];

export const walletProtocol = (slug: string | null | undefined): WalletProtocol | undefined =>
  slug ? WALLET_PROTOCOLS.find((p) => p.slug === slug) : undefined;

/** The /wallet page for a wallet a listing search names, where that page
 *  reads the protocol (`WALLET_PROTOCOLS`); null where it does not, so a
 *  protocol it leaves out draws no link to an empty page. */
export const walletPageHref = (protocol: string | undefined, wallet: string | undefined): string | null =>
  wallet && walletProtocol(protocol) ? `/wallet/${encodeURIComponent(wallet)}` : null;

/** A wallet address, as the wallet page takes it. */
export const WALLET_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** An ENS name the wallet page resolves: no space, ending ".eth", seven
 *  characters or more. A listing search sends only these to the wallet page. */
export const isWalletEnsName = (v: string): boolean => /^[^\s]+\.eth$/i.test(v) && v.length >= 7;

/** The families whose listings send a wallet search to the wallet page
 *  (ui-jobs 738): their Trove and Stability Pool listings. The session id of
 *  each explorer is its slug here. */
export const WALLET_SEARCH_FAMILIES = new Set(["liquity-v2", "ebisu", "asymmetry", "basedollar"]);

/** The wallet page for a wallet within one protocol. */
export const walletProtocolHref = (wallet: string, protocol: string): string =>
  `/wallet/${encodeURIComponent(wallet.toLowerCase())}?protocol=${protocol}`;

/** Where a listing search lands: the wallet page with the protocol chosen,
 *  where the search names a whole address or an ENS name and the family's
 *  listings send a wallet there; null for anything else, which the listing
 *  searches itself. */
export function walletSearchHref(protocol: string | undefined, q: string | null | undefined): string | null {
  if (!protocol || !WALLET_SEARCH_FAMILIES.has(protocol)) return null;
  const v = (q ?? "").trim();
  return WALLET_ADDRESS.test(v) || isWalletEnsName(v) ? walletProtocolHref(v, protocol) : null;
}

/** Fields that name a market's figures, a count or a block, never the
 *  account's debt (Alchemix states each debt with its `asOfBlock`). */
const NOT_THE_ACCOUNTS = /total|bad_?debt|rate|count|symbol|address|apy|index|share|cap|block/i;
const DEBT_KEY = /debt|borr/i;
const positive = (v: unknown) => (typeof v === "number" || typeof v === "string") && Number(v) > 0;

/** Whether a family's stored listing row shows the account owing, now or at
 *  its peak: a positive figure under a debt or borrow key (`peak_borr_raw`,
 *  `peakReserves[].peakDebtRaw`, `borrows[].amount`, `borrowedBase`). */
function owedIn(v: unknown, underDebt = false, depth = 0): boolean {
  if (depth > 4 || v == null || typeof v !== "object") return false;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (NOT_THE_ACCOUNTS.test(k)) continue;
    const debt = underDebt || DEBT_KEY.test(k);
    if (debt && positive(x)) return true;
    if (typeof x === "object" && owedIn(x, debt, depth + 1)) return true;
  }
  return false;
}

/** A summary row's kind: the row's own where it states one; a lending
 *  account is a loan where it owes or ever owed, a deposit where it never
 *  borrowed. The row's own debt fields are
 *  read first; the lending families leave them empty, so their listing row
 *  (`card`) is read next. */
export function kindOfRow(row: WalletSummaryRow): WalletKind {
  if (row.kind) return row.kind;
  const kinds = walletProtocol(row.family)?.kinds ?? ["loans"];
  if (kinds.length === 1) return kinds[0];
  // A Trove protocol's deposits carry their kind (listing-summary-rows.ts).
  if (kinds.includes("troves")) return "troves";
  // A PWN row names its side of the loan: the borrower owes, the lender's
  // credit is a deposit (mig 527). A Polaris row names its kind: a Stability
  // Pool deposit owes nothing, a CDP or a reserve loan is a loan (mig 529).
  const card = row.card as { role?: unknown; kind?: unknown } | null;
  if (row.family === "pwn" && (card?.role === "borrower" || card?.role === "lender"))
    return card.role === "borrower" ? "loans" : "deposits";
  if (row.family === "polaris" && (card?.kind === "sp" || card?.kind === "cdp" || card?.kind === "loan"))
    return card.kind === "sp" ? "deposits" : "loans";
  // An Euler V2 pair states no amount: its vault is the account's controller
  // where the account borrows from it. A controller can stay enabled with no
  // debt (about 1,800 stored pairs, mig 517), so the flag is the best signal
  // the store gives and no proof of a loan.
  const controller = (row.card as { controller?: unknown } | null)?.controller === true;
  // A Dolomite account borrowing in several markets states no debt unit (mig
  // 522): its borrow market count says it owes.
  const borrowsIn = Number((row.card as { borrowMarketCount?: unknown } | null)?.borrowMarketCount ?? 0) > 0;
  const owed =
    positive(row.debt?.amount) ||
    positive(row.peakDebt) ||
    positive(row.debtUsd) ||
    owedIn(row.card) ||
    controller ||
    borrowsIn;
  return owed ? "loans" : "deposits";
}

/** The Status pill: open positions, or those that ended (closed, liquidated,
 *  redeemed, or passed to another wallet). */
export type WalletStatus = "open" | "closed";
export const WALLET_STATUSES: { value: WalletStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

/** `?status=` as the page reads it: one status, or none for both. */
export function parseStatus(raw: string | string[] | undefined): WalletStatus | undefined {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s === "open" || s === "closed" ? s : undefined;
}

/** `?kind=` as the page reads it: known kinds only. */
export function parseKinds(raw: string | string[] | undefined): WalletKind[] {
  const s = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const known = new Set(WALLET_KINDS.map((k) => k.value));
  return [...new Set(s.split(",").filter((k): k is WalletKind => known.has(k as WalletKind)))];
}

/** The URL of the wallet page for a protocol and kinds; a kind the protocol
 *  does not hold, or the one kind a protocol holds, is left out. */
export function walletHref(
  address: string,
  protocol: string | undefined,
  kinds: WalletKind[] = [],
  status?: WalletStatus,
): string {
  const p = walletProtocol(protocol);
  const keep = p ? (p.kinds.length > 1 ? kinds.filter((k) => p.kinds.includes(k)) : []) : kinds;
  const sp = new URLSearchParams();
  if (p) sp.set("protocol", p.slug);
  if (keep.length) sp.set("kind", keep.join(","));
  if (status) sp.set("status", status);
  const s = sp.toString().replace(/%2C/gi, ",");
  return `/wallet/${address}${s ? `?${s}` : ""}`;
}

/** The two pills' selection, on any filter object that carries them. */
export interface WalletPillFilters extends BaseListFilters {
  protocol?: string;
  kinds: string[];
  status?: string;
}

/** One protocol the wallet holds, for the Protocol pill. */
export interface WalletProtocolCount {
  slug: string;
  name: string;
  positions: number;
}

export function protocolDimension<F extends WalletPillFilters>(held: WalletProtocolCount[]): SerializableDimension<F> {
  const options: FilterOptionDef[] = held.map((h) => ({
    value: h.slug,
    label: h.name,
    meta: h.positions.toLocaleString("en-US"),
  }));
  return {
    id: "protocol",
    label: "Protocol",
    group: "Protocol",
    cardinality: "single",
    param: "protocol",
    options,
    get: (f) => (f.protocol ? [f.protocol] : []),
    set: (f, values) => ({ ...f, protocol: values[0] }),
  };
}

export function kindDimension<F extends WalletPillFilters>(kinds: WalletKind[]): SerializableDimension<F> {
  return {
    id: "kind",
    label: "Kind",
    group: "Kind",
    cardinality: "multi",
    param: "kind",
    options: WALLET_KINDS.filter((k) => kinds.includes(k.value)),
    get: (f) => f.kinds,
    set: (f, values) => ({ ...f, kinds: values }),
  };
}

export function statusDimension<F extends WalletPillFilters>(): SerializableDimension<F> {
  return {
    id: "status",
    label: "Status",
    group: "Status",
    cardinality: "single",
    param: "status",
    options: WALLET_STATUSES,
    get: (f) => (f.status ? [f.status] : []),
    set: (f, values) => ({ ...f, status: values[0] }),
  };
}
