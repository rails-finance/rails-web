// What the gate does not count as a difference between preview and
// production — every rule in one place, each with the reason it is volatile.
// Anything historical (event rows, amounts, past timestamps, prose) has no
// rule here: a difference there is the finding.

const NUMBER = /-?\d[\d,]*(?:\.\d+)?/g;

// ── Markdown: text rules, applied to every line of both exports ─────────────
export const MARKDOWN_TEXT_RULES = [
  {
    // The snapshot's own stamp. The gate passes one Date to both renders, so
    // this only fires on a serializer that stamps for itself.
    name: "snapshot stamp",
    pattern: /(snapshot generated) \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/gi,
    to: "$1 <time>",
  },
  {
    // The live read's block, in the preamble and a live section's heading:
    // the head each host read at. A historical "at block" (a note's receipt,
    // an event row) sits on neither kind of line and is kept.
    name: "head block",
    pattern: /\bat block [\d,]+/g,
    to: "at block <head>",
    lines: (line) => line.startsWith("> ") || line.startsWith("## "),
  },
];

// ── Markdown: live lines, compared within a tolerance ───────────────────────
// A line in one of these sections, or matching one of these patterns, states
// a value read at the head (balances with accrued interest, oracle prices,
// health factor, rates, utilisation). Two hosts read seconds apart: the line's
// words must match exactly and each number within LIVE_TOLERANCE.
export const LIVE_SECTIONS = [
  "## Headlines", // Liquity V2 and the Aave family: the live overlay's debt, collateral, CR, HF, prices
  "## Economics", // Liquity V2: interest cost off the live recorded debt and rate
  "## Reserve rates", // Aave family: the Pool's rates and utilisation at the head
  "## Position", // the Liquity forks: the Trove's entire debt and collateral, read at the head where taken
  "## Live risk", // the Liquity forks: price, ratio, the branch's total debt and ratio at the head
];
export const LIVE_LINE_PATTERNS = [
  /\btoday\b/i, // a "today" line is read against today's price
];
/** Relative tolerance on a live number; a number printed to d decimals also
 *  passes within two units of its last place. */
export const LIVE_TOLERANCE = 0.01;

// ── Markdown: masked outright ───────────────────────────────────────────────
export const MASKED_LINE_PATTERNS = [
  // Debt in front moves with every other Trove's rate and debt.
  /\*\*Debt in front:\*\*/,
  // A market-notes count includes the live notes, which come and go with the
  // market (their own lines are dropped by the adapter).
  /^- \*\*Market notes:\*\*/,
];

// ── Markdown: masked only when the two hosts indexed to different heads ─────
// The rows above the common head are trimmed before rendering; these lines
// summarise the whole indexed history and move with its head.
export const HEAD_LINE_PATTERNS = [
  /^- \*\*(Last activity|Record closed|Transactions[^*]*|Liquidations|Peak debt|Peak collateral):\*\*/,
];

// ── JSON (approach 2): key paths dropped before the diff ────────────────────
// Matched against the dotted path, array indices written `[]`.
export const JSON_DROPPED_PATHS = [
  // The head each host read at.
  { re: /^(timeline\.)?block(Number|Timestamp)$/, why: "the head block the read was pinned to" },
  {
    re: /(^|\.)(fetchedAt|generatedAt|servedAt|cachedAt|asOf|readAt|measuredAt|refreshed_at)$/,
    why: "the time of the read",
  },
  {
    re: /(^|\.)oldestPriceFetchedAt$/,
    why: "when rails-server's price cache read the oldest price behind an Aave V4 spoke-positions row",
  },
  {
    re: /(^|\.)ltBlock$/,
    why: "the head block the Aave V4 hubs route read the liquidation thresholds at",
  },
  {
    re: /(^|\.)accruedToTreasury$/,
    why: "a reserve's treasury accrual: grows every block and resets at each mintToTreasury, so two reads seconds apart differ by more than the tolerance",
  },
  {
    re: /^gap$/,
    why: "a vault's totalAssets less its allocated sum at the head: the difference of two live reads, which a small move in either swings past the tolerance",
  },
  { re: /^data\.cache$/, why: "rails-server's state cache answering this request (miss / fresh)" },
  { re: /^timeline\.reconcile\.(toBlock|lane|refetched|refetchDiffered)$/, why: "the read's own span and RPC lane" },
  { re: /^timeline\.history$/, why: "the cache state: how much of the history this request read from the store" },
  { re: /^lanes$/, why: "which RPC lane served the read" },
  { re: /(^|\.)(ms|serverMs)$/, why: "how long the read took (the wallet route's timings)" },
  {
    re: /^censusBlock$/,
    why: "the block of the served vault roster each deployment has cached (lib/morpho-base/vault-roster.ts)",
  },
  // Live balances and prices at the head.
  {
    re: /(^|\.)(totalAssets|totalSupply|sharePrice|liquidityIndex|assetHeld|maxSlashable|claim|holderClaim|maxRedeem|maxWithdraw|valueUsd|priceUsd)$/,
    why: "a balance or price read live at the head",
  },
];

/** Replace each JSON string that holds a host origin. */
function originOut(s, origins) {
  let out = s;
  for (const o of origins) out = out.split(o).join("<host>");
  return out;
}

function maskNumbers(line) {
  return line.replace(NUMBER, "#");
}

function numbersOf(line) {
  return (line.match(NUMBER) ?? []).map((s) => ({
    v: parseFloat(s.replace(/,/g, "")),
    d: s.includes(".") ? s.length - s.indexOf(".") - 1 : 0,
  }));
}

function withinTolerance(a, b) {
  const na = numbersOf(a);
  const nb = numbersOf(b);
  if (na.length !== nb.length) return false;
  return na.every((x, i) => {
    const y = nb[i];
    const unit = 2 * 10 ** -Math.min(x.d, y.d);
    return Math.abs(x.v - y.v) <= Math.max(LIVE_TOLERANCE * Math.max(Math.abs(x.v), Math.abs(y.v)), unit);
  });
}

/** Both exports' lines with the rules applied. `origins` are the two hosts;
 *  `dropLines` the adapter's live lines; `headsDiffer` turns on the head
 *  rules. Returns the two line arrays to diff. */
export function normaliseMarkdownPair(a, b, { origins, dropLines = [[], []], headsDiffer = false }) {
  const prep = (text, drop) => {
    const dropped = new Set(drop);
    let section = "";
    return originOut(text, origins)
      .split("\n")
      .filter((l) => !dropped.has(l))
      .map((raw) => {
        let line = raw;
        if (line.startsWith("## ")) section = LIVE_SECTIONS.find((s) => line.startsWith(s)) ?? "";
        for (const r of MARKDOWN_TEXT_RULES) if (!r.lines || r.lines(line)) line = line.replace(r.pattern, r.to);
        if (MASKED_LINE_PATTERNS.some((p) => p.test(line))) return { line: maskNumbers(line), live: false };
        if (headsDiffer && HEAD_LINE_PATTERNS.some((p) => p.test(line)))
          return { line: maskNumbers(line), live: false };
        const live = (section !== "" && !line.startsWith("## ")) || LIVE_LINE_PATTERNS.some((p) => p.test(line));
        return { line, live, section };
      });
  };
  const la = prep(a, dropLines[0]);
  const lb = prep(b, dropLines[1]);
  // Pair the live lines by section, masked shape and occurrence; a pair whose
  // numbers agree within the tolerance reads as its masked shape on both sides.
  const keyed = (lines) => {
    const m = new Map();
    lines.forEach((l, i) => {
      if (!l.live) return;
      const k = `${l.section}|${maskNumbers(l.line)}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    });
    return m;
  };
  const ka = keyed(la);
  const kb = keyed(lb);
  for (const [k, ia] of ka) {
    const ib = kb.get(k);
    if (!ib) continue;
    for (let j = 0; j < Math.min(ia.length, ib.length); j++) {
      const x = la[ia[j]];
      const y = lb[ib[j]];
      if (withinTolerance(x.line, y.line)) {
        x.line = maskNumbers(x.line);
        y.line = maskNumbers(y.line);
      }
    }
  }
  return [la.map((l) => l.line), lb.map((l) => l.line)];
}

/** Routes whose figures are read at the head, so two hosts asked seconds
 *  apart read different blocks: every number outside their event rows is a
 *  live value, compared within LIVE_TOLERANCE. Every other route serves stored
 *  rows and is compared exactly. */
export const LIVE_ROUTES = [
  { re: /^\/api\/chain\//, why: "the chain overlays read the contracts at the head" },
  { re: /^\/api\/fx\/position\/[^/]+\/[^/]+\/drift/, why: "fx's drift read: the position's debt ratio at the head" },
  {
    re: /^\/api\/fx\/(positions\?|stats$|position\/[^/]+\/[^/]+\/timeline)/,
    why: "the fx listing, pool stats and timeline carry rails-server's drift snapshot, refreshed every five minutes",
  },
  {
    re: /^\/api\/vaults\/positions\?/,
    why: "the vault listing's live overlay: shares and claims read at one head block",
  },
  {
    re: /^\/api\/sky-savings\/positions\?/,
    why: "Sky Savings rows are stated at rails-server's sealed block, which moves every few blocks",
  },
];
export const isLiveRoute = (route) => LIVE_ROUTES.some((r) => r.re.test(route));

/** `b` with each number that sits at the same place in `a` and agrees with it
 *  within LIVE_TOLERANCE replaced by `a`'s, so the pair prints the same. */
export function settleLiveNumbers(a, b, key = "") {
  if (typeof a === "number" && typeof b === "number")
    return Math.abs(a - b) <= LIVE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b)) ? a : b;
  // A raw on-chain amount travels as a decimal string ("raw", "…Raw", an
  // oracle "answer"); an id in one (a Trove id, a token id) is compared exactly.
  if (typeof a === "string" && typeof b === "string" && !ID_KEY.test(key) && DECIMAL.test(a) && DECIMAL.test(b))
    return settleLiveNumbers(Number(a), Number(b)) === Number(a) ? a : b;
  if (Array.isArray(a) && Array.isArray(b))
    return b.map((y, i) => (i < a.length ? settleLiveNumbers(a[i], y, key) : y));
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b))
    return Object.fromEntries(
      Object.entries(b).map(([k, y]) => [
        k,
        k in a && !(HISTORY_KEYS.has(k) && typeof y === "object") ? settleLiveNumbers(a[k], y, k) : y,
      ]),
    );
  return b;
}

/** `b` with its listing rows (`data`) in `a`'s order, when the two pages hold
 *  the same rows and differ only in order: rails-server breaks a tie on the
 *  sort key (two positions last active in one block) differently from one
 *  request to the next, and both hosts proxy the same backend. */
export function settleRowOrder(a, b) {
  if (!Array.isArray(a?.data) || !Array.isArray(b?.data) || a.data.length !== b.data.length) return b;
  const key = (r) => JSON.stringify(r);
  const left = new Map();
  for (const r of b.data) left.set(key(r), (left.get(key(r)) ?? 0) + 1);
  for (const r of a.data) {
    const n = left.get(key(r));
    if (!n) return b;
    left.set(key(r), n - 1);
  }
  return { ...b, data: a.data };
}

/** The event rows a chain route carries beside its live read (a vault
 *  holder's history, a sweep's timeline): historical, compared exactly. A
 *  number under the same name (a listing row's event count) is live. */
const HISTORY_KEYS = new Set(["events", "timeline"]);
const DECIMAL = /^-?\d+(\.\d+)?$/;
const ID_KEY = /(^id|Id|Ids|^nft|Nft)$/;

/** One route's JSON with the dropped paths removed and the host origins
 *  written out, keys sorted, pretty-printed one value per line. */
export function normaliseJson(value, origins) {
  const walk = (v, path) => {
    if (Array.isArray(v)) return v.map((x) => walk(x, `${path}[]`));
    if (v && typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) {
        const p = path ? `${path}.${k}` : k;
        if (JSON_DROPPED_PATHS.some((r) => r.re.test(p))) continue;
        out[k] = walk(v[k], p);
      }
      return out;
    }
    return typeof v === "string" ? originOut(v, origins) : v;
  };
  return JSON.stringify(walk(value, ""), null, 2).split("\n");
}

/** The newest blockNumber in any `events` array of a route's JSON. */
export function jsonHead(value) {
  let head = 0;
  const walk = (v, key) => {
    if (Array.isArray(v)) {
      if (key === "events")
        for (const e of v) if (typeof e?.blockNumber === "number") head = Math.max(head, e.blockNumber);
      v.forEach((x) => walk(x, ""));
    } else if (v && typeof v === "object") for (const k of Object.keys(v)) walk(v[k], k);
  };
  walk(value, "");
  return head || null;
}

/** The JSON with every `events` row above `maxBlock` removed: the common
 *  range when the two hosts indexed to different heads. */
export function trimJsonEvents(value, maxBlock) {
  const walk = (v, key) => {
    if (Array.isArray(v)) {
      const rows =
        key === "events" ? v.filter((e) => typeof e?.blockNumber !== "number" || e.blockNumber <= maxBlock) : v;
      return rows.map((x) => walk(x, ""));
    }
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return walk(value, "");
}
