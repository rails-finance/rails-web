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
// value is stated at all and the position count stands alone. A counted row for
// an explorer outside the roster is checked against the server's total and
// left out of the figure.

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
  /** The explorer's position listing, and its vaults page where it has one:
   *  where a row on /about/figures links. */
  href?: string;
  vaultsHref?: string;
}[];

/** Where a line of the figure sits: its chain, its surface ("vaults" for the
 *  vault surface of an explorer that also has markets) and the page its
 *  positions are listed on (the vaults page for a vault surface). */
export type ValueHeldPlace = { chainId: number; surface: string | null; href: string | null };

export type ValueHeldRow = ValueHeldPlace & {
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
  /** A price the server exempts from the 24-hour limit, as it words it ("crvUSD's Aave
   *  price is exempt from the 24-hour limit"), read from the end of its price source. */
  exemption: string | null;
};

export type ValueHeld = {
  totalUsd: number;
  computedAt: string;
  /** Counted explorers, largest first. */
  rows: ValueHeldRow[];
  /** Explorers left out of the figure, each with its reason. */
  notCounted: (ValueHeldPlace & { label: string; chainName: string; reason: string })[];
  /** Counted explorers' notable left-out items. */
  leftOut: LeftOutLine[];
  overlaps: string[];
};

export type LeftOutLine = ValueHeldPlace & {
  label: string;
  chainName: string;
  what: string;
  usd: number | null;
  reason: string;
};

/** The recomputed total may differ from the server's by at most this, in USD. */
const TOTAL_TOLERANCE_USD = 1;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** "on-chain_oracle" -> "on-chain oracle": the server's tag, read as words. */
const EXEMPTION = /;\s*([^;]*exempt from the 24-hour limit)\s*$/;

/** The exemption clause the server appends to a price source, if any. */
export function exemptionOf(source: string | null): string | null {
  return source?.match(EXEMPTION)?.[1] ?? null;
}

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
): Omit<LeftOutLine, keyof ValueHeldPlace>[] {
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
      const place: ValueHeldPlace = {
        chainId: entry.chainId,
        surface: row.surface ?? null,
        href: (row.surface === "vaults" ? entry.vaultsHref : undefined) ?? entry.href ?? null,
      };
      if (row.counted && isFiniteNumber(row.usd)) {
        counted.push({
          ...place,
          key: `${entry.id}:${row.surface ?? ""}`,
          label,
          chainName,
          usd: row.usd,
          block: row.block,
          prices: inWords(row.priceSource),
          oracleOf: labelOfOwner(row.priceOracleOwner),
          exemption: exemptionOf(row.priceSource),
        });
        leftOut.push(...groupLeftOut(label, chainName, row.leftOut ?? []).map((l) => ({ ...l, ...place })));
      } else {
        notCounted.push({ ...place, label, chainName, reason: row.reason ?? "no figure stated" });
      }
    }
  }

  // The server's total covers every counted row it sent, including explorers
  // this build has not launched (the server counts one before the web flag
  // flips). Check the response against all of them, then state only the
  // roster's rows.
  const inRoster = (e: ValueHeldExplorer) => roster.some((r) => r.slug === e.protocol && r.chainId === e.chainId);
  const sentCounted = data.explorers.filter((e) => e.counted && isFiniteNumber(e.usd));
  const sentUsd = sentCounted.reduce((sum, e) => sum + (e.usd as number), 0);
  if (Math.abs(sentUsd - data.totalUsd) > TOTAL_TOLERANCE_USD) {
    console.error(`value-held: counted rows sum to ${sentUsd}, server states ${data.totalUsd}`);
    return null;
  }
  const unlaunched = sentCounted.filter((e) => !inRoster(e));
  if (unlaunched.length > 0) {
    console.error(
      `value-held: counted rows outside the roster, not stated: ${unlaunched.map((e) => `${e.protocol}@${e.chainId}`).join(", ")}`,
    );
  }

  const totalUsd = counted.reduce((sum, r) => sum + r.usd, 0);
  if (counted.length === 0) {
    console.error("value-held: no counted rows");
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

/** The headline total in whole dollars, en-US grouping: "$38,410,261,859". */
export function formatValueHeld(usd: number): string {
  return `$${Math.round(usd).toLocaleString("en-US")}`;
}

/** The same figure for a screen reader, rounded: "about 38.4 billion dollars". */
export function spokenValueHeld(usd: number): string {
  if (usd >= 999_950_000) return `about ${(usd / 1e9).toFixed(1)} billion dollars`;
  if (usd >= 999_950) return `about ${(usd / 1e6).toFixed(1)} million dollars`;
  return `${Math.round(usd).toLocaleString("en-US")} dollars`;
}
