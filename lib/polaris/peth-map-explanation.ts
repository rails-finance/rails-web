// The Polaris map's explanation drawer (ui-jobs 873.5): what this address did
// across Polaris, built from the map's fill alone, in the shared drawer's
// groups (lib/shared/protocol-map/types.ts, MapExplanation). The words keep
// zone Z1's limits (rails-ops standards/prose-limits-and-zones.md §2.1), and
// scripts/test/polaris-peth-map-explanation.test.mjs checks them on both
// fixtures. Pure, and imports nothing through `@/`.
//
// Two tabs. EXPLANATION: the story and Now, eight bullets at most (Z1's pane).
// THE STORY ("Its steps", then an untitled group): one step per filled arrow, in
// the order of each arrow's first row, ties in the map's order. Two pairs
// read as one step: ETH into the zap router with what the router gave back
// (the zap buy), and the bonding curve's fee after it, which carries no time
// of its own. Each dated bullet states one time or span and one amount. Past
// the bullets Now leaves, the middle steps give way to a line linking the
// timeline filtered to their arrows. NOW: each box's "now", two to a bullet,
// then the address's balances. PARTS: each part this address used, in the
// documented term, and the dashed boxes.
//
// Every figure is a fill amount with the receipt the map shows it with. The
// zaps to vpETH, USDp, GOLDp or POLAR carry no ETH figure (ui-jobs 865), so
// their bullet names the tokens and no amount.

import { formatDate } from "../date";
import type {
  MapAmount,
  MapBullet,
  MapEdgeEnd,
  MapEdgeFill,
  MapExplanation,
  MapExplanationGroup,
  MapFill,
  MapLine,
  MapReceipt,
  MapTextPart,
} from "../shared/protocol-map/types";
import { MAP_HOLDER, mapUnusedWords, usedNodes } from "../shared/protocol-map/types";
import { PM, POLARIS_LOAN_NAME, POLARIS_MAP_LAYOUT, POLARIS_POOL_NAME, pmEdge } from "./peth-map-layout";

/** What the drawer links to, from the page. */
export interface PethMapExplainContext {
  /** One event on the address's timeline. */
  eventHref: (eventId: string) => string;
  /** The address's timeline filtered to these arrows. */
  edgesHref: (edgeIds: string[]) => string;
  /** The markets' stablecoin symbols, in the deployment's order. */
  marketOrder: string[];
}

/** One pool by the constant's name ("Earn Pool"), several as it stands. */
const POOL_ONE = POLARIS_POOL_NAME.replace(/s$/, "");

/** A story bullet's time, before its text is set: the ends, and whether a
 *  bullet holds it. */
type Span = { first: MapEdgeEnd; last: MapEdgeEnd };

interface Step {
  /** The arrows the step reads from. */
  edges: string[];
  span: Span | null;
  /** Below the address on the map. */
  mechanism: boolean;
  /** The layout index of the step's first arrow: the tie-break. */
  order: number;
  /** The dated bullet's words after its time: ", it paid …". */
  tail: MapTextPart[];
  /** Bullets drawn from the same rows, with no time ("The bonding curve took …"). */
  more: MapBullet[];
}

const EDGE_INDEX = new Map(POLARIS_MAP_LAYOUT.edges.map((e, i) => [e.id, i]));
const MECHANISMS = POLARIS_MAP_LAYOUT.nodes.filter((n) => n.band === "mechanism").map((n) => n.id);
const BAND = new Map(POLARIS_MAP_LAYOUT.nodes.map((n) => [n.id, n.band]));

const fig = (a: MapAmount, receipt: MapReceipt | undefined): MapTextPart => ({
  figure: a,
  ...((a.receipt ?? receipt) ? { receipt: a.receipt ?? receipt } : {}),
});

/** An edge's amount for its bullet: pETH where it moved, else the first. */
function lead(e: MapEdgeFill): { a: MapAmount | null; others: string[] } {
  const a = e.amounts.find((x) => x.asset === "pETH") ?? e.amounts[0] ?? null;
  return { a, others: e.amounts.filter((x) => x !== a).map((x) => x.asset) };
}

/** "9.57 pETH along with fpETH and vpETH", or "tokens" where the edge states
 *  no amount (a partial read). */
function amountParts(e: MapEdgeFill, none = "tokens"): MapTextPart[] {
  const { a, others } = lead(e);
  if (!a) return [none];
  return others.length > 0 ? [fig(a, e.receipt), " along with ", { list: others }] : [fig(a, e.receipt)];
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (at: number) => formatDate(at);
const timeOf = (at: number) => {
  const d = new Date(at * 1000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

/** The names the notes of a box give its places ("USDp CDP #36"). */
const noteNames = (lines: MapLine[], re: RegExp): string[] =>
  lines.filter((l) => l.label === "note" && l.text != null && re.test(l.text)).map((l) => l.text!);

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function pethMapExplanation(fill: MapFill, ctx: PethMapExplainContext): MapExplanation {
  const E = fill.edges;
  const lines = (id: string): MapLine[] => fill.nodes[id]?.lines ?? [];
  const unknown = fill.edgesUnknown === true;
  const partial = fill.counted.rows < fill.counted.total;

  // Each place's words, from the box's notes.
  const marketRank = (s: string) => {
    const i = ctx.marketOrder.findIndex((m) => s.startsWith(`${m} `));
    return i < 0 ? ctx.marketOrder.length : i;
  };
  const cdpNames = noteNames(lines(PM.cdp), /CDP #/).sort((a, b) => marketRank(a) - marketRank(b));
  // "Floor Loan #28": the docs' term, capitalised mid-sentence too.
  const loanNames = noteNames(lines(PM.loan), /#/);
  const spMarkets = [...new Set(noteNames(lines(PM.sp), /deposit #/).map((t) => t.split(" ")[0]))].sort(
    (a, b) => ctx.marketOrder.indexOf(a) - ctx.marketOrder.indexOf(b),
  );
  const twoOr = (names: string[], all: string): MapTextPart =>
    names.length > 0 && names.length <= 2 ? { list: names } : all;
  const placeName: Record<string, MapTextPart> = {
    [PM.cdp]: twoOr(cdpNames, "its CDPs"),
    [PM.sp]: spMarkets.length === 1 ? `the ${spMarkets[0]} ${POOL_ONE}` : `the ${POLARIS_POOL_NAME}`,
    [PM.loan]: twoOr(loanNames, `its ${POLARIS_LOAN_NAME}`),
    [PM.splitter]: "the Splitter",
    [PM.pools]: "the pools",
    [PM.svpeth]: "the svpETH vault",
    [PM.morpho]: "Morpho Blue",
  };

  const story: MapExplanationGroup[] = [];
  const nowGroups: MapExplanationGroup[] = [];
  const parts: MapExplanationGroup[] = [];

  // ── Now ──
  {
    const now = (id: string): MapLine | undefined => lines(id).find((l) => l.label === "now" && l.amounts.length > 0);
    const clauses: MapTextPart[][] = [];
    const nowFig = (l: MapLine): MapTextPart => fig(l.amounts[0], l.receipt);
    const cdp = now(PM.cdp);
    if (cdp)
      clauses.push(
        cdpNames.length === 1
          ? ["its CDP held ", nowFig(cdp), " at its last touch"]
          : ["its CDPs held ", nowFig(cdp), " at their last touch"],
      );
    const sp = now(PM.sp);
    if (sp) {
      const n = noteNames(lines(PM.sp), /deposit #/).length;
      clauses.push([`its ${POOL_ONE} ${n === 1 ? "deposit holds" : "deposits hold"} `, nowFig(sp)]);
    }
    const loan = now(PM.loan);
    if (loan)
      clauses.push(
        loanNames.length === 1
          ? [`${loanNames[0]} holds `, nowFig(loan)]
          : [`its ${POLARIS_LOAN_NAME} hold `, nowFig(loan)],
      );
    const pools = now(PM.pools);
    if (pools) clauses.push(["its pool shares hold ", nowFig(pools)]);
    const conv = lines(PM.svpeth).find((l) => l.label === "note" && l.text === "Converts to" && l.amounts.length > 0);
    if (conv) clauses.push(["its svpETH converts to ", nowFig(conv)]);

    const bullets: MapBullet[] = [];
    for (let i = 0; i < clauses.length; i += 2) {
      const [a, b] = [clauses[i], clauses[i + 1]];
      const first = [upperFirst(String(a[0])), ...a.slice(1)];
      bullets.push({ parts: b ? [...first, ", and ", ...b, "."] : [...first, "."] });
    }
    const held = lines(MAP_HOLDER);
    const heldNow = held.find((l) => l.label === "now");
    if (heldNow && heldNow.amounts.length > 0) {
      for (let i = 0; i < heldNow.amounts.length; i += 2) {
        const [a, b] = heldNow.amounts.slice(i, i + 2);
        bullets.push({
          parts: [
            i === 0 ? "It now holds " : "It also holds ",
            fig(a, heldNow.receipt),
            ...(b ? [" and ", fig(b, heldNow.receipt)] : []),
            ".",
          ],
        });
      }
    } else if (held.some((l) => l.label === "note")) {
      bullets.push({ parts: ["What it holds now is not read yet."] });
    }
    for (let i = 0; i < bullets.length; i += 4)
      nowGroups.push({
        id: i === 0 ? "now" : `now-${i / 4}`,
        ...(i === 0 ? { heading: "Now" } : {}),
        bullets: bullets.slice(i, i + 4),
      });
  }

  // The Explanation tab keeps Z1's eight bullets: the story has what Now leaves.
  const nowCount = nowGroups.reduce((n, g) => n + g.bullets.length, 0);
  const budget = Math.max(0, PANE_BULLETS - nowCount);

  // ── The story ──
  if (!unknown) {
    const steps: Step[] = [];
    const used = new Set<string>();
    const spanOf = (ids: string[]): Span | null => {
      let first: MapEdgeEnd | undefined;
      let last: MapEdgeEnd | undefined;
      for (const id of ids) {
        const e = E[id];
        if (e?.first && (!first || e.first.at < first.at)) first = e.first;
        if (e?.last && (!last || e.last.at > last.at)) last = e.last;
      }
      return first && last ? { first, last } : null;
    };
    const step = (edges: string[], tail: MapTextPart[], more: MapBullet[] = [], span = spanOf(edges.slice(0, 1))) => {
      edges.forEach((id) => used.add(id));
      const main = POLARIS_MAP_LAYOUT.edges.find((e) => e.id === edges[0])!;
      steps.push({
        edges,
        span,
        mechanism: BAND.get(main.from) === "mechanism" || BAND.get(main.to) === "mechanism",
        order: EDGE_INDEX.get(edges[0]) ?? 0,
        tail,
        more,
      });
    };
    const ethZap = pmEdge(PM.eth, PM.zap);
    const zapEth = pmEdge(PM.zap, PM.eth);
    const zapHolder = pmEdge(PM.zap, MAP_HOLDER);
    const holderZap = pmEdge(MAP_HOLDER, PM.zap);
    const zapOther = pmEdge(PM.zap, PM.other);
    const otherZap = pmEdge(PM.other, PM.zap);
    const curveFee = pmEdge(PM.curve, PM.fee);
    const zapCurve = pmEdge(PM.zap, PM.curve);
    const ethTokens = new Set(["pETH", "fpETH"]);

    // The bonding curve's fee, after the first step its rows share.
    const fee = E[curveFee];
    const feeBullet = (): MapBullet[] => {
      const a = fee ? lead(fee).a : null;
      if (!fee || !a) return [];
      used.add(curveFee);
      return [{ parts: ["The bonding curve took ", fig(a, fee.receipt), " of it in fees."] }];
    };

    // The zap buy: ETH in, and the pETH and fpETH the router gave back.
    if (E[ethZap]) {
      const e = E[ethZap];
      const bought = (E[zapHolder]?.amounts ?? []).map((a) => a.asset).filter((s) => ethTokens.has(s));
      const [first, ...rest] = e.amounts;
      const feeMore = feeBullet();
      step(
        [ethZap, zapHolder, zapCurve, ...(feeMore.length > 0 ? [curveFee] : [])].filter((id) => E[id]),
        [
          ", it paid ",
          ...(first ? [fig(first, e.receipt)] : ["ETH"]),
          " through the zap router",
          ...(bought.length > 0 ? [" for ", { list: bought }] : []),
          ".",
        ],
        [...rest.map((a) => ({ parts: ["It also paid ", fig(a, e.receipt), " through the zap router."] })), ...feeMore],
      );
    }
    if (E[zapEth]) step([zapEth], [", it received ", ...amountParts(E[zapEth], "ETH"), " from the zap router."]);
    if (E[holderZap]) step([holderZap], [", it traded ", ...amountParts(E[holderZap]), " through the zap router."]);

    // Zaps to or from vpETH, USDp, GOLDp and POLAR: named, with no ETH
    // figure. Their rows are the ones on the other tokens' arrows, and the
    // ones on the router's arrow back to this address with no ETH or token
    // going in.
    {
      const out = (E[zapOther]?.amounts ?? []).map((a) => a.asset);
      const vp = (E[zapHolder]?.amounts ?? []).some((a) => a.asset === "vpETH") ? ["vpETH"] : [];
      const sold = (E[otherZap]?.amounts ?? []).map((a) => a.asset);
      // vpETH first, then the stablecoins in the deployment's order, then POLAR.
      const rank = (t: string) => (t === "vpETH" ? -1 : ctx.marketOrder.includes(t) ? ctx.marketOrder.indexOf(t) : 99);
      const bought = [...new Set([...vp, ...out])].sort((x, y) => rank(x) - rank(y));
      const rows = fill.rows.filter(
        (r) =>
          r.edgeIds.includes(zapOther) ||
          r.edgeIds.includes(otherZap) ||
          (r.edgeIds.includes(zapHolder) && !r.edgeIds.some((id) => id === ethZap || id === holderZap)),
      );
      if (E[zapOther] || E[otherZap]) {
        let first: MapEdgeEnd | undefined;
        let last: MapEdgeEnd | undefined;
        for (const r of rows) {
          if (r.at == null) continue;
          if (!first || r.at <= first.at) first = { at: r.at, id: r.id };
          if (!last || r.at > last.at) last = { at: r.at, id: r.id };
        }
        const verb = !E[otherZap] ? "bought" : !E[zapOther] ? "sold" : "traded";
        const names =
          verb === "sold"
            ? sold
            : verb === "bought"
              ? bought
              : [...new Set([...bought, ...sold])].sort((x, y) => rank(x) - rank(y));
        step(
          [E[zapOther] ? zapOther : otherZap, ...(E[zapOther] && E[otherZap] ? [otherZap] : [])],
          [
            `, it ${verb} `,
            names.length > 0 ? { list: names } : "other tokens",
            " through the zap router; these are not counted in ETH here.",
          ],
          [],
          first && last ? { first, last } : null,
        );
      }
    }

    // The bonding curve without the zap router.
    const holderCurve = pmEdge(MAP_HOLDER, PM.curve);
    const curveHolder = pmEdge(PM.curve, MAP_HOLDER);
    if (E[holderCurve])
      step([holderCurve], [", it paid ", ...amountParts(E[holderCurve]), " into the bonding curve."], feeBullet());
    if (E[curveHolder])
      step([curveHolder], [", it received ", ...amountParts(E[curveHolder]), " from the bonding curve."], feeBullet());
    if (fee && !used.has(curveFee) && lead(fee).a)
      step([curveFee], [", the bonding curve took ", fig(lead(fee).a!, fee.receipt), " in fees."]);

    const outsideIn = pmEdge(PM.outside, MAP_HOLDER);
    const outsideOut = pmEdge(MAP_HOLDER, PM.outside);
    if (E[outsideIn]) step([outsideIn], [", it received ", ...amountParts(E[outsideIn]), " from other addresses."]);
    if (E[outsideOut]) step([outsideOut], [", it sent ", ...amountParts(E[outsideOut]), " to other addresses."]);

    // Into and out of each mechanism.
    for (const m of MECHANISMS) {
      const into = pmEdge(MAP_HOLDER, m);
      const back = pmEdge(m, MAP_HOLDER);
      const name = placeName[m];
      if (E[into]) {
        const amt = amountParts(E[into]);
        const tail: MapTextPart[] =
          m === PM.sp
            ? [", it deposited ", ...amt, " into ", name, "."]
            : m === PM.svpeth
              ? [", it staked ", ...amt, " in ", name, "."]
              : m === PM.loan
                ? [", it put ", ...amt, " into ", name, " as collateral."]
                : m === PM.morpho
                  ? [", it moved ", ...amt, " into ", name, "."]
                  : [", it put ", ...amt, " into ", name, "."];
        step([into], tail);
      }
      if (E[back]) step([back], [", it took ", ...amountParts(E[back]), " out of ", name, "."]);
    }

    steps.sort((a, b) => (a.span?.first.at ?? Infinity) - (b.span?.first.at ?? Infinity) || a.order - b.order);

    // The groups: the steps before the first mechanism, then the rest, four
    // bullets each. Past the budget, the earliest steps and the latest, and
    // a line to the ones between.
    const size = (xs: Step[]) => xs.reduce((n, s) => n + 1 + s.more.length, 0);
    const take = (xs: Step[], max: number, fromEnd = false): Step[] => {
      const out: Step[] = [];
      const seq = fromEnd ? [...xs].reverse() : xs;
      for (const s of seq) {
        if (size([...out, s]) > max) break;
        out.push(s);
      }
      return fromEnd ? out.reverse() : out;
    };
    let did: Step[];
    let then: Step[];
    let skipped: Step[] = [];
    if (size(steps) > budget) {
      did = take(steps, Math.min(4, Math.ceil(budget / 2)));
      then = take(steps.slice(did.length), Math.min(4, budget - size(did)), true);
      skipped = steps.slice(did.length, steps.length - then.length);
    } else {
      const firstMech = steps.findIndex((s) => s.mechanism);
      did = take(steps.slice(0, firstMech < 0 ? steps.length : firstMech), 4);
      then = steps.slice(did.length);
      while (size(then) > 4) {
        did = [...did, then[0]];
        then = then.slice(1);
      }
      while (size(did) > 4 && size([did[did.length - 1], ...then]) <= 4) {
        then = [did[did.length - 1], ...then];
        did = did.slice(0, -1);
      }
    }

    // Each time's words: the first in the drawer with its date, a later one
    // on the same day by its time alone.
    let day: string | null = null;
    const stamp = (end: MapEdgeEnd, sameDayAs?: string): { text: string; href: string } => {
      const d = dayOf(end.at);
      const ref = sameDayAs ?? day;
      day = d;
      return { text: d === ref ? timeOf(end.at) : `${d}, ${timeOf(end.at)}`, href: ctx.eventHref(end.id) };
    };
    const told = [...did, ...then];
    const lastStep = told[told.length - 1];
    const bulletsOf = (xs: Step[], startsThen: boolean): MapBullet[] =>
      xs.flatMap((s, i) => {
        const opener =
          told.length < 2
            ? ""
            : s === lastStep
              ? "Most recently, "
              : s === told[0]
                ? "First, "
                : startsThen && i === 0
                  ? "Then, "
                  : "";
        let when: MapTextPart[] = [];
        if (s.span) {
          const one =
            s.span.first.id === s.span.last.id ||
            (dayOf(s.span.first.at) === dayOf(s.span.last.at) && timeOf(s.span.first.at) === timeOf(s.span.last.at));
          const from = stamp(s.span.first);
          const to = one ? undefined : stamp(s.span.last, dayOf(s.span.first.at));
          when = [{ when: { from, ...(to ? { to } : {}), ...(opener ? {} : { cap: true }) } }];
        }
        const head: MapTextPart[] = when.length > 0 ? [opener, ...when] : [opener ? opener.replace(/, $/, "") : ""];
        const tail = [...s.tail];
        // With no time and no opener, the tail's leading ", it …" starts the sentence.
        if (when.length === 0 && !opener) tail[0] = upperFirst(String(tail[0]).replace(/^, /, ""));
        return [{ parts: [...head, ...tail].filter((p) => p !== "") }, ...s.more];
      });

    if (steps.length > 0) {
      story.push({
        id: "did",
        heading: "Its steps",
        ...(partial
          ? {
              lead: [
                `These steps cover the newest ${fill.counted.rows.toLocaleString("en-US")} ${fill.counted.rows === 1 ? "transaction" : "transactions"}.`,
              ],
            }
          : {}),
        bullets: bulletsOf(did, false),
      });
      if (skipped.length > 0) {
        const ids = [...new Set(skipped.flatMap((s) => s.edges).filter((id) => E[id]))];
        story.push({
          id: "more",
          lead: [
            "… and ",
            {
              link: `${skipped.length.toLocaleString("en-US")} more ${skipped.length === 1 ? "step" : "steps"}`,
              href: ctx.edgesHref(ids),
            },
            ", in the timeline.",
          ],
          bullets: [],
        });
      }
      if (then.length > 0) story.push({ id: "then", bullets: bulletsOf(then, true) });
    }
  }

  // ── What each part does ──
  {
    const used = usedNodes(POLARIS_MAP_LAYOUT, fill);
    const holds = (id: string) => lines(id).some((l) => l.amounts.length > 0);
    const touched = PART_ORDER.filter((id) => (unknown ? holds(id) : used.has(id)));
    const bullets: MapBullet[] = touched.map((id) => ({
      parts: [PART_WORDS[id]],
      ...(PART_MODAL[id] ? { learnMore: PART_MODAL[id] } : {}),
    }));
    for (let i = 0; i < bullets.length; i += 4)
      parts.push({ id: i === 0 ? "parts" : `parts-${i / 4}`, bullets: bullets.slice(i, i + 4) });
  }

  // ── The boxes the map dashes ──
  if (!unknown) {
    const used = usedNodes(POLARIS_MAP_LAYOUT, fill);
    const idle = MECHANISMS.filter((id) => !used.has(id)).map((id) => UNUSED_NAME[id]);
    if (idle.length > 0)
      parts.push({ id: "unused", bullets: [{ parts: [`${mapUnusedWords(fill)}: `, { list: idle }, "."] }] });
  }

  return {
    tabs: [
      { key: "explanation", label: "Explanation", groups: [...story, ...nowGroups] },
      { key: "parts", label: "Parts", groups: parts },
    ].filter((t) => t.groups.length > 0),
  };
}

/** Bullets in the Explanation tab at most: zone Z1's per pane (closed). */
const PANE_BULLETS = 8;

/** The parts the second section explains, in the map's order. */
const PART_ORDER = [PM.zap, PM.curve, PM.cdp, PM.sp, PM.loan, PM.splitter, PM.pools, PM.svpeth, PM.morpho];

/** What each part does, in the box's term. Polaris's docs name the zap router
 *  and the svpETH vault nowhere, so those are the map's coined names (rails-ops
 *  reference/official-docs/polaris.md, Terms). */
const PART_WORDS: Record<string, string> = {
  [PM.zap]: "Zap router: trades ETH for Polaris tokens in one transaction.",
  [PM.curve]: "Bonding curve: mints pETH against ETH and burns pETH to release ETH; its fees go to the fee router.",
  [PM.cdp]: "CDPs: lock pETH as collateral to mint USDp or GOLDp.",
  [PM.sp]: `${POLARIS_POOL_NAME}: hold USDp or GOLDp deposits that repay liquidated debt and receive its pETH collateral.`,
  [PM.loan]: `${POLARIS_LOAN_NAME}: lend ETH from the bonding curve reserve against fpETH collateral.`,
  [PM.splitter]: "Splitter: splits pETH into fpETH and vpETH, and merges them back.",
  [PM.pools]: "Pools: hold pETH paired with other tokens for trading.",
  [PM.svpeth]: "svpETH vault: stakes vpETH and supplies it to Morpho Blue.",
  [PM.morpho]: "Morpho Blue: lends and borrows vpETH; only the vpETH it moves is shown.",
};

/** The Polaris "?" modal a part's bullet opens, where one explains it. */
const PART_MODAL: Record<string, string> = { [PM.cdp]: "market" };

/** Each dashed box as the untouched line names it. */
const UNUSED_NAME: Record<string, string> = {
  [PM.cdp]: "CDPs",
  [PM.sp]: `the ${POLARIS_POOL_NAME}`,
  [PM.loan]: POLARIS_LOAN_NAME,
  [PM.splitter]: "the Splitter",
  [PM.pools]: "the pools",
  [PM.svpeth]: "the svpETH vault",
  [PM.morpho]: "Morpho Blue",
};
