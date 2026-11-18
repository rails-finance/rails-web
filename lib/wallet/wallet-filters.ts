// The wallet page's filters (ui-jobs 738): the Protocol pill and the
// position-kind pill, as URL params `protocol` and `kind`. With one protocol
// chosen the page reads that protocol alone (lib/wallet/read-wallet.ts,
// `readWallet(…, { protocol })`); a protocol with a listing on the wallet
// page (Liquity V2) draws its listing's pills and sort there
// (components/wallet/wallet-protocol-listing.tsx). Client-safe: no reads.

import type { SerializableDimension, BaseListFilters } from "@/lib/shared/list-filter";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import type { WalletSummaryRow } from "@/lib/wallet/summary-row";

export type WalletKind = "troves" | "deposits" | "loans" | "vaults";

export const WALLET_KINDS: { value: WalletKind; label: string }[] = [
  { value: "troves", label: "Troves" },
  { value: "deposits", label: "Deposits" },
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
  { slug: "compound-v3", name: "Compound V3", kinds: ["loans", "deposits"], arbitrum: true },
  { slug: "morpho", name: "Morpho Blue", kinds: ["loans", "deposits"], arbitrum: true },
  { slug: "liquity-v2", name: "Liquity V2", kinds: ["troves"] },
  { slug: "makerdao", name: "MakerDAO", kinds: ["vaults"] },
  { slug: "spark", name: "SparkLend", kinds: ["loans", "deposits"] },
  { slug: "fluid", name: "Fluid", kinds: ["vaults"] },
  { slug: "ebisu", name: "Ebisu", kinds: ["troves"] },
  { slug: "asymmetry", name: "Asymmetry", kinds: ["troves"] },
  { slug: "basedollar", name: "Basedollar", kinds: ["troves"] },
];

export const walletProtocol = (slug: string | null | undefined): WalletProtocol | undefined =>
  slug ? WALLET_PROTOCOLS.find((p) => p.slug === slug) : undefined;

/** The protocols whose wallet view is their listing, with its pills. */
export const LISTED_ON_WALLET = new Set(["liquity-v2"]);

const amountOver0 = (a: { amount: string } | null | undefined) => a != null && Number(a.amount) > 0;

/** A summary row's kind: a lending account is a loan where it owes or ever
 *  owed (its peak debt), a deposit where it never borrowed. */
export function kindOfRow(row: WalletSummaryRow): WalletKind {
  const kinds = walletProtocol(row.family)?.kinds ?? ["loans"];
  if (kinds.length === 1) return kinds[0];
  return amountOver0(row.debt) || Number(row.peakDebt ?? 0) > 0 || (row.debtUsd ?? 0) > 0 ? "loans" : "deposits";
}

/** `?kind=` as the page reads it: known kinds only. */
export function parseKinds(raw: string | string[] | undefined): WalletKind[] {
  const s = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const known = new Set(WALLET_KINDS.map((k) => k.value));
  return [...new Set(s.split(",").filter((k): k is WalletKind => known.has(k as WalletKind)))];
}

/** The URL of the wallet page for a protocol and kinds; a kind the protocol
 *  does not hold, or the one kind a protocol holds, is left out. */
export function walletHref(address: string, protocol: string | undefined, kinds: WalletKind[] = []): string {
  const p = walletProtocol(protocol);
  const keep = p ? (p.kinds.length > 1 ? kinds.filter((k) => p.kinds.includes(k)) : []) : kinds;
  const sp = new URLSearchParams();
  if (p) sp.set("protocol", p.slug);
  if (keep.length) sp.set("kind", keep.join(","));
  const s = sp.toString().replace(/%2C/gi, ",");
  return `/wallet/${address}${s ? `?${s}` : ""}`;
}

/** The two pills' selection, on any filter object that carries them. */
export interface WalletPillFilters extends BaseListFilters {
  protocol?: string;
  kinds: string[];
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
