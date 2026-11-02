// Value held in open positions — the shape the home band states, and the rule
// that settles the server's per-explorer rows into it.
// ----------------------------------------------------------------------------
// Client-safe: types and pure functions only, no env reads and no backend
// client. The loader lives in `value-held-data.ts` (SERVER-ONLY), same split as
// home-stats.ts / home-stats-data.ts.
//
// The rule is all-or-nothing per explorer. An explorer adds to the figure only
// when its row is `counted` with a finite `usd`; a row that says it is not
// counted stays out and is named, with its reason, in the note. Every launched
// explorer must have an answer (counted or not): a roster entry the response
// does not mention means the response cannot vouch for the whole roster, so no
// value is stated at all and the position count stands alone.

/** One explorer's row as `GET /api/stats/value-held` returns it. */
export type ValueHeldExplorer = {
  protocol: string;
  chainId: number;
  /** "vaults" = the vault surface of an explorer that also has a market surface. */
  surface?: string;
  counted: boolean;
  usd: number | null;
  block: { from: number; to: number } | null;
  blockTime: string | null;
  priceSource: string | null;
  /** "own", or another protocol's slug whose oracle priced the rows. */
  priceOracleOwner: string | null;
  leftOut: { what: string; reason: string; usd?: number | null; rows?: number }[];
  /** Why the explorer is not counted (when `counted` is false). */
  reason?: string;
};

export type ValueHeldData = {
  computedAt: string;
  totalUsd: number;
  explorers: ValueHeldExplorer[];
  overlaps: string[];
};

/** A launched explorer, as the settle rule needs it. */
export type ValueHeldRoster = {
  id: string;
  slug: string;
  protocolKey?: string;
  chainId: number;
  label: string;
  chainName: string;
}[];

export type ValueHeldRow = {
  key: string;
  label: string;
  chainName: string;
  usd: number;
  /** Share of the total, 0 to 1. */
  share: number;
  block: { from: number; to: number } | null;
  /** The price source in words. */
  prices: string;
  /** Whose oracle priced it, where it is not the explorer's own ("Aave V3's oracle"). */
  oracleOf: string | null;
};

export type ValueHeld = {
  totalUsd: number;
  computedAt: string;
  /** Counted explorers, largest first. */
  rows: ValueHeldRow[];
  /** Explorers left out of the figure, each with its reason. */
  notCounted: { label: string; chainName: string; reason: string }[];
  /** Counted explorers' notable left-out items. */
  leftOut: { label: string; chainName: string; what: string; usd: number | null; reason: string }[];
  overlaps: string[];
};

/** The recomputed total may differ from the server's by at most this, in USD. */
const TOTAL_TOLERANCE_USD = 1;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** "on-chain_oracle" -> "on-chain oracle": the server's tag, read as words. */
function inWords(source: string | null): string {
  if (!source) return "not stated";
  return source.replace(/_/g, " ");
}

/** The server states each stale asset with its own age; the note reads them as one line. */
const STALE = /older than the positions' block/;
const STALE_REASON = "a stored price more than 24 hours older than the positions";

/**
 * One line per explorer and reason: "44 assets ($70.6M): a stored price more than
 * 24 hours older than the positions". A single item keeps its own name.
 */
export function groupLeftOut(
  label: string,
  chainName: string,
  items: ValueHeldExplorer["leftOut"],
): ValueHeld["leftOut"] {
  const groups = new Map<string, { whats: string[]; usd: number; priced: boolean }>();
  for (const item of items) {
    const reason = STALE.test(item.reason) ? STALE_REASON : item.reason;
    const g = groups.get(reason) ?? { whats: [], usd: 0, priced: false };
    g.whats.push(item.what);
    if (isFiniteNumber(item.usd)) {
      g.usd += item.usd;
      g.priced = true;
    }
    groups.set(reason, g);
  }
  return [...groups].map(([reason, g]) => {
    const what = g.whats.length === 1 ? g.whats[0] : `${g.whats.length} assets`;
    return { label, chainName, what, usd: g.priced ? g.usd : null, reason };
  });
}

/**
 * Settle the server's rows into the figure, or return null (with the reason
 * logged) when the response cannot back the claim.
 */
export function settleValueHeld(data: ValueHeldData | null | undefined, roster: ValueHeldRoster): ValueHeld | null {
  if (!data || !Array.isArray(data.explorers) || !isFiniteNumber(data.totalUsd)) {
    console.error("value-held: incomplete data");
    return null;
  }

  // The server names an explorer by its route slug and chain ("aave-v3" on 8453),
  // the pair that is unique across the roster.
  const rowsFor = (slug: string, chainId: number) =>
    data.explorers.filter((e) => e.protocol === slug && e.chainId === chainId);

  // Every launched explorer must have an answer.
  const missing = roster.filter((r) => rowsFor(r.slug, r.chainId).length === 0);
  if (missing.length > 0) {
    console.error(`value-held: no row for ${missing.map((m) => `${m.id}@${m.chainId}`).join(", ")}`);
    return null;
  }

  const counted: Omit<ValueHeldRow, "share">[] = [];
  const notCounted: ValueHeld["notCounted"] = [];
  const leftOut: ValueHeld["leftOut"] = [];

  const labelOfOwner = (owner: string | null): string | null => {
    if (!owner || owner === "own") return null;
    const hit =
      roster.find((r) => r.slug === owner && r.chainId === 1) ??
      roster.find((r) => r.id === owner) ??
      roster.find((r) => r.protocolKey === owner);
    return `${hit?.label ?? owner}'s oracle`;
  };

  for (const entry of roster) {
    for (const row of rowsFor(entry.slug, entry.chainId)) {
      const label = entry.label;
      // "Morpho Blue Base vaults": the surface reads after the chain.
      const chainName = row.surface === "vaults" ? `${entry.chainName} vaults` : entry.chainName;
      if (row.counted && isFiniteNumber(row.usd)) {
        counted.push({
          key: `${entry.id}:${row.surface ?? ""}`,
          label,
          chainName,
          usd: row.usd,
          block: row.block,
          prices: inWords(row.priceSource),
          oracleOf: labelOfOwner(row.priceOracleOwner),
        });
        leftOut.push(...groupLeftOut(label, chainName, row.leftOut ?? []));
      } else {
        notCounted.push({ label, chainName, reason: row.reason ?? "no figure stated" });
      }
    }
  }

  const totalUsd = counted.reduce((sum, r) => sum + r.usd, 0);
  if (counted.length === 0 || Math.abs(totalUsd - data.totalUsd) > TOTAL_TOLERANCE_USD) {
    console.error(`value-held: counted rows sum to ${totalUsd}, server states ${data.totalUsd}`);
    return null;
  }

  return {
    totalUsd,
    computedAt: data.computedAt,
    rows: counted.map((r) => ({ ...r, share: r.usd / totalUsd })).sort((a, b) => b.usd - a.usd),
    notCounted,
    leftOut,
    overlaps: Array.isArray(data.overlaps) ? data.overlaps : [],
  };
}

/**
 * The headline total: one decimal at every tier ("$38.4B", Miles's "$X.XB"),
 * where the shared formatFlowUsd keeps a second. Below $1M it is whole dollars.
 */
export function formatValueHeld(usd: number): string {
  if (usd >= 999_950_000) return `$${(usd / 1e9).toFixed(1)}B`;
  if (usd >= 999_950) return `$${(usd / 1e6).toFixed(1)}M`;
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

/** The same figure for a screen reader: "38.4 billion dollars". */
export function spokenValueHeld(usd: number): string {
  if (usd >= 999_950_000) return `${(usd / 1e9).toFixed(1)} billion dollars`;
  if (usd >= 999_950) return `${(usd / 1e6).toFixed(1)} million dollars`;
  return `${Math.round(usd).toLocaleString("en-US")} dollars`;
}
