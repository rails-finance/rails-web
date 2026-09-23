// Provenance vocabulary for the Liquity-V2-family LIVE reads — the risk
// surfaces' sources (/api/chain/{ebisu,asymmetry}/position) and the branch
// roster (/api/chain/{ebisu,asymmetry,liquity-v2}/branches). Shared by the two
// forks AND the reference deployment they were cloned from (the contract
// family is one V2 architecture); what differs — the protocol name, the
// stablecoin, the branch contracts, where the constants live — is parameterized.
// Three kinds of source:
//
//   • STATE — a live eth_call against the branch's own contracts at the
//     latest block: getLatestTroveData (entire debt/coll WITH pending
//     redistribution and accrued interest — the branch's own live reckoning),
//     the chain-verified MCR/CCR/SCR constants, branch aggregates.
//   • VERDICT — the TroveManager's OWN getCurrentICR at the branch's own
//     oracle price — chain-direct, stronger than client arithmetic.
//   • DERIVED — liquidation price (debt × MCR ÷ coll), branch TCR, the
//     redemption queue (a walk of the branch's own SortedTroves in its
//     descending-rate order), and oracle-USD products — arithmetic over those
//     same chain reads, so chain-derived.
//
// The price lane: fetchPrice is state-mutating on-chain, so it is SIMULATED
// via eth_call (the Liquity V1 pattern); when only the lagging lastGoodPrice
// answers, the provenance says so. The 1e(36 − decimals) scale and the ICR
// identity are proven by scripts/verify-liquity-forks-chain.mjs.
//
// Two lanes share this vocabulary, and each builder names its own in `via` so
// a receipt says which request delivered the figure:
//   • the POSITION lane (/api/chain/<fork>/position) — one trove,
//   • the BRANCH-ROSTER lane (/api/chain/<fork>/branches) — every branch at
//     one head block, behind the protocol view: the same contracts, read for
//     the whole roster and its queues rather than a single trove.

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { EBISU_BRANCHES, DEBT_SYMBOL as EBISU_DEBT } from "@/lib/ebisu/asset-catalog";
import { ASYMMETRY_BRANCHES, DEBT_SYMBOL as ASYMMETRY_DEBT } from "@/lib/asymmetry/asset-catalog";
import { BASEDOLLAR_BRANCHES, DEBT_SYMBOL as BASEDOLLAR_DEBT } from "@/lib/basedollar/asset-catalog";
import { BASEDOLLAR_PRICE_GRADES } from "@/lib/basedollar/price-feeds";
import { EBISU_PRICE_GRADES } from "@/lib/ebisu/price-feeds";
import { ASYMMETRY_PRICE_GRADES } from "@/lib/asymmetry/price-feeds";
import { LIQUITY_V2_BRANCHES, DEBT_SYMBOL as LIQUITY_V2_DEBT } from "@/lib/liquity/asset-catalog";

/** One input a branch PriceFeed reads (fork playbook §6 grading). */
export interface LiquityForkPriceLeg {
  /** Receipt row label; every identifier in the grade's formula names one. */
  label: string;
  /** "api3" — an API3 dAPI behind an Api3ReaderProxyV1; "chainlink" — a
   *  Chainlink EACAggregatorProxy; "redstone" — a RedStone push feed;
   *  "rocket-ovm-rate" — Rocket Pool's L1 rETH rate relayed into a
   *  RocketOvmPriceOracle; "rate" — a token contract's exchange-rate getter
   *  (`read` names the call); "curve" — a Curve price aggregator read through
   *  a fallback adapter (`read` names the call). */
  source: "api3" | "chainlink" | "redstone" | "rocket-ovm-rate" | "rate" | "curve";
  /** The dAPI name the proxy reads (its `dapiName()`). */
  dapiName?: string;
  /** A Chainlink or RedStone feed's `description()`. */
  feedName?: string;
  /** For "rate" and "curve" legs: the call that yields the value. */
  read?: string;
  /** The contract that answers this leg. */
  address: string;
  /** Receipt name for that contract, where the source's default does not fit. */
  contractName?: string;
  /** The PriceFeed getter that names this leg (verifier read-back). */
  getter: string;
  /** An adapter between the PriceFeed and this leg: the PriceFeed calls
   *  `via`, which reads the leg (Asymmetry's own AggregatorV3 wrappers). */
  via?: { name: string; address: string };
  pclass: "oracle" | "state";
  heartbeatS?: number;
  deviationPct?: number;
  /** Age after which the PriceFeed (or its adapter) treats the leg as down;
   *  absent where the value is read live and never ages. */
  stalenessS?: number;
  /** When the leg is read but kept out of the headline formula. */
  role?: string;
}

/** A branch PriceFeed's source chain: legs, formula, redemption and failure rules. */
export interface LiquityForkPriceGrade {
  contractName: string;
  formula: string;
  legs: LiquityForkPriceLeg[];
  redemption: string | null;
  onFailure: string;
  /** The price's class where no leg is an oracle (default "oracle"). */
  pclass?: "oracle" | "state";
}

const hours = (s: number) => `${+(s / 3600).toFixed(2)} h`;

const FEED_LABEL: Record<"api3" | "chainlink" | "redstone", string> = {
  api3: "API3",
  chainlink: "Chainlink",
  redstone: "RedStone",
};

function legNote(l: LiquityForkPriceLeg): string {
  const cadence = `${l.deviationPct}% deviation · ${hours(l.heartbeatS ?? 0)} heartbeat`;
  const head =
    l.source === "api3"
      ? `API3 dAPI "${l.dapiName}" · ${cadence}`
      : l.source === "chainlink"
        ? `Chainlink "${l.feedName}" · ${cadence}`
        : l.source === "redstone"
          ? `RedStone "${l.feedName}" · ${cadence}`
          : l.source === "rocket-ovm-rate"
            ? "Rocket Pool's L1 rETH rate, relayed to Base · RocketOvmPriceOracle.rate()"
            : (l.read ?? "");
  const age = l.stalenessS ? ` · counted down after ${hours(l.stalenessS)}` : " · read live";
  const via = l.via ? ` · read through ${l.via.name} ${l.via.address}` : "";
  return `${head}${age}${via}${l.role ? ` · ${l.role}` : ""}`;
}

function legContractName(l: LiquityForkPriceLeg): string {
  if (l.contractName) return l.contractName;
  if (l.source === "api3") return `API3 ${l.label} proxy`;
  if (l.source === "chainlink") return `Chainlink ${l.feedName} proxy`;
  if (l.source === "redstone") return `RedStone ${l.label} feed`;
  if (l.source === "rocket-ovm-rate") return "RocketOvmPriceOracle";
  return l.label;
}

function legInputs(g: LiquityForkPriceGrade): ProvInput[] {
  return g.legs.map((l) => ({
    label: l.label,
    kind: "chain",
    pclass: l.pclass,
    note: legNote(l),
    contract: { name: legContractName(l), address: l.address },
  }));
}

/** One sentence naming the source chain, appended to a price summary. The
 *  cadence clause appears only when every oracle leg shares one provider,
 *  deviation, heartbeat and staleness threshold and no fallback stands in for
 *  a stale leg; otherwise each leg's row carries its own. */
function gradeSentence(g: LiquityForkPriceGrade, withFailure = false): string {
  const feeds = g.legs.filter(
    (l): l is LiquityForkPriceLeg & { source: keyof typeof FEED_LABEL } => l.source in FEED_LABEL && !l.role,
  );
  const [f] = feeds;
  const uniform =
    f &&
    feeds.every(
      (l) =>
        l.source === f.source &&
        l.deviationPct === f.deviationPct &&
        l.heartbeatS === f.heartbeatS &&
        l.stalenessS === f.stalenessS,
    ) &&
    g.legs.every((l) => l.source !== "curve" && (!l.stalenessS || l.stalenessS === f.stalenessS));
  const cadence =
    uniform && f.stalenessS
      ? feeds.length > 1
        ? ` Each ${FEED_LABEL[f.source]} leg updates on a ${f.deviationPct}% move or every ${hours(f.heartbeatS ?? 0)}; the PriceFeed shuts the branch down when a leg is older than ${hours(f.stalenessS)}.`
        : ` The ${FEED_LABEL[f.source]} leg updates on a ${f.deviationPct}% move or every ${hours(f.heartbeatS ?? 0)}; the PriceFeed shuts the branch down when it is older than ${hours(f.stalenessS)}.`
      : "";
  return ` ${g.contractName} computes ${g.formula}.${cadence}${g.redemption ? ` ${g.redemption}` : ""}${withFailure ? ` ${g.onFailure}` : ""}`;
}

export interface LiquityForkLiveVocab {
  troveStateProv: (what: string, field: string, branchSymbol: string) => Provenance;
  /** The live rate, with its author named — the generic troveStateProv's
   *  entire-figure sentence (redistribution gains, accrued interest) reads as
   *  nonsense on a RATE, and a batch member's rate is the manager's choice. */
  liveRateProv: (branchSymbol: string, isBatched: boolean) => Provenance;
  contractIcrProv: (branchSymbol: string) => Provenance;
  forkPriceProv: (branchSymbol: string, stale: boolean) => Provenance;
  constantProv: (what: string, name: string, branchSymbol: string) => Provenance;
  liqPriceProv: (branchSymbol: string) => Provenance;
  tcrProv: (branchSymbol: string) => Provenance;
  debtInFrontProv: (branchSymbol: string) => Provenance;
  queueShareProv: (branchSymbol: string) => Provenance;
  forkUsdProv: (what: string, branchSymbol: string) => Provenance;
  debtFaceUsdProv: (what: string) => Provenance;
  // ── The branch-roster (protocol view) lane — /api/chain/<fork>/branches ──
  branchAggregateProv: (what: string, getter: string, branchSymbol: string) => Provenance;
  branchTcrProv: (branchSymbol: string) => Provenance;
  branchPriceProv: (branchSymbol: string, stale: boolean) => Provenance;
  branchConstantProv: (what: string, name: string, branchSymbol: string) => Provenance;
  branchListSizeProv: (branchSymbol: string) => Provenance;
  /** `idsCapped` = the ids enumeration hit its bound — the census is a floor. */
  zombieProv: (branchSymbol: string, idsCapped?: boolean) => Provenance;
  /** `cappedShown` = the rates were read over the queue's first N troves only. */
  branchRateSpanProv: (what: string, branchSymbol: string, cappedShown?: number) => Provenance;
  branchCollUsdProv: (branchSymbol: string) => Provenance;
}

interface ForkLiveConfig {
  protocolId: "ebisu" | "asymmetry" | "basedollar" | "liquity-v2";
  protocolName: string;
  stablecoin: string;
  branchBySymbol: Record<string, { troveManager: string; priceFeed: string; sortedTroves: string }>;
  constantsSource: string; // where MCR/CCR/SCR live on this revision
  /** Per-branch PriceFeed grading, keyed by display symbol. A fork without one
   *  names its PriceFeed contract and stops there. */
  priceGrades?: Record<string, LiquityForkPriceGrade>;
}

function makeVocab(cfg: ForkLiveConfig): LiquityForkLiveVocab {
  const LANE_VIA = `GET /api/chain/${cfg.protocolId}/position`;
  const ROSTER_VIA = `GET /api/chain/${cfg.protocolId}/branches`;
  const tmContract = (sym: string) => ({
    name: `${cfg.protocolName} ${sym} TroveManager`,
    address: cfg.branchBySymbol[sym]?.troveManager ?? "",
  });
  const pfContract = (sym: string) => ({
    name: `${cfg.protocolName} ${sym} PriceFeed`,
    address: cfg.branchBySymbol[sym]?.priceFeed ?? "",
  });
  const grade = (sym: string) => cfg.priceGrades?.[sym];
  // The graded price receipt: the PriceFeed's formula over its named legs.
  const gradedPrice = (sym: string, withFailure = false) => {
    const g = grade(sym);
    return g ? { formula: g.formula, inputs: legInputs(g), sentence: gradeSentence(g, withFailure) } : null;
  };
  // The price's class: "oracle" unless the grade says no oracle feeds it.
  const pricePclass = (sym: string) => grade(sym)?.pclass ?? "oracle";
  // An "oracle price" operand row: the formula rides in its note.
  const priceNote = (sym: string, base: string) => {
    const g = grade(sym);
    return g ? `${base} = ${g.formula}` : base;
  };
  const recompute = (target: string, method: string): ProvVerify => ({
    kind: "recompute",
    text: `Re-run the ${target}.${method} eth_call against any node`,
  });

  return {
    troveStateProv: (what, field, sym) => ({
      kind: "chain",
      pclass: "state",
      verify: recompute("TroveManager", "getLatestTroveData"),
      summary: `${what} — read live from the ${sym} branch's own TroveManager (getLatestTroveData · ${field}) at the latest block. The ENTIRE figure: pending redistribution gains from liquidations and interest accrued to this moment are included — the branch's own live reckoning, which redemptions shrink without the captured events necessarily showing it.`,
      contract: tmContract(sym),
      via: `${LANE_VIA} · TroveManager.getLatestTroveData @ head · ${field}`,
    }),
    liveRateProv: (sym, isBatched) => ({
      kind: "chain",
      pclass: "state",
      verify: recompute("TroveManager", "getLatestTroveData"),
      summary: isBatched
        ? `Annual interest rate — read live from the ${sym} branch's own TroveManager (getLatestTroveData · annualInterestRate) at the latest block. This Trove is a batch member, so the contract serves its batch's CURRENT rate — the rate its interest-batch manager sets for every member, which can differ from the rate on the Trove's own last recorded event.`
        : `Annual interest rate — read live from the ${sym} branch's own TroveManager (getLatestTroveData · annualInterestRate) at the latest block. The rate the owner set with the Trove's own latest adjustment; it accrues continuously on the recorded debt.`,
      contract: tmContract(sym),
      via: `${LANE_VIA} · TroveManager.getLatestTroveData @ head · annualInterestRate`,
    }),
    contractIcrProv: (sym) => ({
      kind: "chain",
      pclass: "state",
      verify: recompute("TroveManager", "getCurrentICR"),
      summary: `Collateral ratio — the TroveManager's OWN getCurrentICR at the branch's own oracle price, computed by the contract at the latest block. The protocol judging its own trove, not a client-side reconstruction (the arithmetic identity entireColl × price ÷ entireDebt is verified BigInt-exact by scripts/verify-liquity-forks-chain.mjs).`,
      contract: tmContract(sym),
      via: `${LANE_VIA} · TroveManager.getCurrentICR @ head`,
    }),
    forkPriceProv: (sym, stale) => {
      const g = gradedPrice(sym);
      return {
        kind: "chain",
        pclass: pricePclass(sym),
        verify: recompute("PriceFeed", stale ? "lastGoodPrice" : "fetchPrice"),
        summary:
          (stale
            ? `${sym} price in USD — the branch PriceFeed's lastGoodPrice: the last value a user operation fetched (the live fetchPrice simulation failed on this read). It lags between operations on a quiet branch; treat it as the protocol's most recent price, not this block's.`
            : `${sym} price in USD — the branch's own PriceFeed, fetchPrice SIMULATED via eth_call at the latest block (the call is state-mutating on-chain, read-only under eth_call). This is the same price the branch liquidates and redeems with.`) +
          (g?.sentence ?? ""),
        contract: pfContract(sym),
        via: `${LANE_VIA} · PriceFeed.${stale ? "lastGoodPrice" : "fetchPrice (simulated)"} @ head`,
        ...(g && { formula: g.formula, inputs: g.inputs }),
      };
    },
    constantProv: (what, name, sym) => ({
      kind: "chain",
      pclass: "state",
      verify: {
        kind: "recompute",
        text: `Re-derive from the TroveManager (${cfg.constantsSource}) — scripts/verify-liquity-forks-chain.mjs does exactly this`,
      },
      summary: `${what} (${name}) for the ${sym} branch — the governance-set constant, chain-verified against ${cfg.constantsSource} (each branch sets its own).`,
      contract: tmContract(sym),
      via: `${LANE_VIA} · ${cfg.constantsSource} · ${name}`,
    }),
    liqPriceProv: (sym) => ({
      kind: "chain-derived",
      pclass: "state",
      verify: recompute("TroveManager", "getLatestTroveData"),
      summary: `Liquidation price — the ${sym} price at which this trove's collateral ratio hits the branch minimum: entire debt × MCR ÷ entire collateral, every input a chain read at the same block (the liquidation equation rearranged for price).`,
      contract: tmContract(sym),
      via: `${LANE_VIA} · derived ratio`,
      formula: "entire debt × MCR ÷ entire collateral",
      inputs: [
        { label: "entire debt", kind: "chain", pclass: "state", note: "getLatestTroveData @ head" },
        { label: "entire collateral", kind: "chain", pclass: "state", note: "getLatestTroveData @ head" },
        { label: "MCR", kind: "chain", pclass: "state", note: cfg.constantsSource },
      ],
    }),
    tcrProv: (sym) => ({
      kind: "chain-derived",
      pclass: "state",
      verify: recompute("TroveManager", "getEntireBranchColl / getEntireBranchDebt"),
      summary: `The ${sym} branch's total collateral ratio — entire branch collateral × the branch's own oracle price ÷ entire branch debt, every input read at the same block. Below CCR the branch gates new borrowing; below SCR it can be shut down.`,
      contract: tmContract(sym),
      via: `${LANE_VIA} · derived ratio`,
      formula: "branch coll × price ÷ branch debt",
    }),
    debtInFrontProv: (sym) => ({
      kind: "chain-derived",
      pclass: "state",
      verify: recompute("SortedTroves", "getFirst/getNext + TroveManager.getLatestTroveData"),
      summary: `${cfg.stablecoin} debt redeemed before this trove — the sum of entire debt across the ${sym} branch troves sitting at LOWER interest rates (redemptions sweep the lowest user-set rate first in this family, not the lowest collateral ratio), from a live walk of the branch's own SortedTroves in its descending-rate order. Branch-scoped: cross-branch redemption routing splits by each branch's unbacked portion, and zombie troves (outside the list) are redeemed before everything in it.`,
      contract: {
        name: `${cfg.protocolName} ${sym} SortedTroves`,
        address: cfg.branchBySymbol[sym]?.sortedTroves ?? "",
      },
      via: `${LANE_VIA} · SortedTroves walk @ head`,
    }),
    queueShareProv: (sym) => ({
      kind: "chain-derived",
      pclass: "state",
      verify: recompute("SortedTroves", "getFirst/getNext walk + TroveManager.getEntireBranchDebt"),
      summary: `Share of the ${sym} branch's debt redeemed before this trove — debt in front ÷ entire branch debt, both live reads at the same block. This is the redemption runway's fill: redemptions sweep from the front of the rate-ordered queue, so a larger share is a longer runway before they reach this trove.`,
      contract: {
        name: `${cfg.protocolName} ${sym} SortedTroves`,
        address: cfg.branchBySymbol[sym]?.sortedTroves ?? "",
      },
      via: `${LANE_VIA} · derived ratio`,
      formula: "debt in front ÷ branch debt",
      inputs: [
        { label: "debt in front", kind: "chain-derived", pclass: "state", note: "SortedTroves walk @ head" },
        { label: "branch debt", kind: "chain", pclass: "state", note: "getEntireBranchDebt @ head" },
      ],
    }),
    forkUsdProv: (what, sym) => ({
      kind: "chain-derived",
      pclass: pricePclass(sym),
      summary: `${what} valued in USD from the branch's own PriceFeed — the chain balance multiplied by the same price the branch liquidates and redeems with (fetchPrice simulated at head), not an off-chain market feed.`,
      contract: pfContract(sym),
      via: "chain balance × branch PriceFeed price",
      formula: "balance × oracle price",
      inputs: [
        { label: "balance", kind: "chain", note: "branch contract read" },
        {
          label: "oracle price",
          kind: "chain",
          pclass: pricePclass(sym),
          note: priceNote(sym, "PriceFeed.fetchPrice (simulated)"),
          contract: pfContract(sym),
        },
      ],
    }),
    debtFaceUsdProv: (what) => ({
      kind: "chain-derived",
      pclass: "state",
      summary: `${what} valued at ${cfg.stablecoin}'s $1 redemption face — the protocol's own mechanism, not a market feed: any holder can redeem 1 ${cfg.stablecoin} against exactly $1 of collateral at the branch oracle price (the TroveManager's own redemption machinery, its redeemability read live). The redemption face is what the debt costs to clear, which is what a debt figure states.`,
      contract: { name: `${cfg.protocolName} TroveManager`, address: "" },
      via: "debt × $1 redemption face (protocol mechanism)",
      formula: "debt × 1.00",
    }),

    // ── The branch-roster lane ────────────────────────────────────────────
    // Same contracts as the position lane, read for every branch at ONE head
    // block instead of one trove: the protocol-level view the per-trove page
    // can't give (how the branches compare, and the whole queue from its
    // front). Its own `via` names the roster route, so a receipt says which
    // request delivered the figure.
    branchAggregateProv: (what, getter, sym) => ({
      kind: "chain",
      pclass: "state",
      verify: recompute("TroveManager", getter),
      summary: `${what} — read live from the ${sym} branch's own TroveManager (${getter}) at the latest block. The ENTIRE figure: every trove's pending redistribution gains and accrued interest are already in it, so it is the branch's own reckoning of its size rather than a sum over captured events.`,
      contract: tmContract(sym),
      via: `${ROSTER_VIA} · TroveManager.${getter} @ head`,
    }),
    branchTcrProv: (sym) => ({
      kind: "chain-derived",
      pclass: "state",
      verify: recompute("TroveManager", "getEntireBranchColl / getEntireBranchDebt"),
      summary: `The ${sym} branch's total collateral ratio — entire branch collateral × the branch's own oracle price ÷ entire branch debt, every input read at the same block. Each branch stands alone in this family: its TCR gates only its own borrowing (below CCR) and only it can be shut down (below SCR).`,
      contract: tmContract(sym),
      via: `${ROSTER_VIA} · derived ratio`,
      formula: "branch coll × price ÷ branch debt",
      inputs: [
        { label: "branch collateral", kind: "chain", pclass: "state", note: "getEntireBranchColl @ head" },
        {
          label: "price",
          kind: "chain",
          pclass: pricePclass(sym),
          note: priceNote(sym, "PriceFeed.fetchPrice (simulated) @ head"),
          contract: pfContract(sym),
        },
        { label: "branch debt", kind: "chain", pclass: "state", note: "getEntireBranchDebt @ head" },
      ],
    }),
    branchPriceProv: (sym, stale) => {
      const g = gradedPrice(sym, true);
      return {
        kind: "chain",
        pclass: pricePclass(sym),
        verify: recompute("PriceFeed", stale ? "lastGoodPrice" : "fetchPrice"),
        summary:
          (stale
            ? `${sym} price in USD — the branch PriceFeed's lastGoodPrice: the last value a user operation fetched (the live fetchPrice simulation failed on this read). It lags between operations on a quiet branch; treat it as the protocol's most recent price, not this block's.`
            : `${sym} price in USD — the branch's own PriceFeed, fetchPrice SIMULATED via eth_call at the latest block (the call is state-mutating on-chain, read-only under eth_call). This is the same price the branch liquidates and redeems with.`) +
          (g?.sentence ?? ""),
        contract: pfContract(sym),
        via: `${ROSTER_VIA} · PriceFeed.${stale ? "lastGoodPrice" : "fetchPrice (simulated)"} @ head`,
        ...(g && { formula: g.formula, inputs: g.inputs }),
      };
    },
    branchConstantProv: (what, name, sym) => ({
      kind: "chain",
      pclass: "state",
      verify: {
        kind: "recompute",
        text: `Re-derive from the TroveManager (${cfg.constantsSource}) — scripts/verify-liquity-forks-chain.mjs does exactly this`,
      },
      summary: `${what} (${name}) for the ${sym} branch — the governance-set constant, chain-verified against ${cfg.constantsSource}. Each branch sets its own, which is why they differ down this column.`,
      contract: tmContract(sym),
      via: `${ROSTER_VIA} · ${cfg.constantsSource} · ${name}`,
    }),
    branchListSizeProv: (sym) => ({
      kind: "chain",
      pclass: "state",
      verify: recompute("SortedTroves", "getSize"),
      summary: `Troves in the ${sym} branch's redemption queue — SortedTroves.getSize at the latest block: the branch's own count of its listed troves. Zombie troves are NOT in this figure; they sit outside the list (and are counted separately here) because a partial redemption left them below the branch's minimum debt.`,
      contract: {
        name: `${cfg.protocolName} ${sym} SortedTroves`,
        address: cfg.branchBySymbol[sym]?.sortedTroves ?? "",
      },
      via: `${ROSTER_VIA} · SortedTroves.getSize @ head`,
    }),
    zombieProv: (sym, idsCapped) => ({
      kind: "chain",
      pclass: "state",
      verify: recompute("TroveManager", "getTroveStatus + getTroveIdsCount/getTroveFromTroveIdsArray"),
      summary:
        `A zombie trove — status 4 on the ${sym} branch's own TroveManager: a partial redemption left it below the branch minimum debt, so the protocol removed it from SortedTroves. While it still carries debt it is redeemed BEFORE everything in the list — a debt-bearing zombie leads the queue here; one redeemed to zero debt keeps its collateral on the branch but stands outside every redemption path. Found through the TroveManager's own trove-ids array (it enumerates every trove the branch has, listed or not) — a walk of the sorted list alone cannot see it.` +
        (idsCapped ? ` The enumeration is bounded on this read, so the zombie count is a floor, not a census.` : ""),
      contract: tmContract(sym),
      via: `${ROSTER_VIA} · TroveManager.getTroveIdsCount / getTroveFromTroveIdsArray + getTroveStatus @ head`,
    }),
    branchRateSpanProv: (what, sym, cappedShown) => ({
      kind: "chain-derived",
      pclass: "state",
      verify: recompute("SortedTroves", "getLast/getPrev + TroveManager.getLatestTroveData"),
      summary: `${what} ${cappedShown ? `across the first ${cappedShown} troves of the ${sym} branch's queue (the walk's bound — the branch lists more behind them, at higher rates)` : `across the ${sym} branch's listed troves`} — over the user-set rates read live from the branch's own queue at this block. Borrowers set these rates themselves, so this describes what this branch's borrowers are currently choosing to pay; it is not a protocol-set rate.`,
      contract: tmContract(sym),
      via: `${ROSTER_VIA} · SortedTroves tail-first walk @ head · over getLatestTroveData.annualInterestRate`,
    }),
    branchCollUsdProv: (sym) => ({
      kind: "chain-derived",
      pclass: pricePclass(sym),
      verify: recompute("PriceFeed", "fetchPrice"),
      summary: `The ${sym} branch's collateral in USD — its entire collateral multiplied by the same price the branch liquidates and redeems with (fetchPrice simulated at head), not an off-chain market feed.`,
      contract: pfContract(sym),
      via: `${ROSTER_VIA} · getEntireBranchColl × PriceFeed.fetchPrice (simulated) @ head`,
      formula: "branch collateral × oracle price",
      inputs: [
        { label: "branch collateral", kind: "chain", pclass: "state", note: "getEntireBranchColl @ head" },
        {
          label: "oracle price",
          kind: "chain",
          pclass: pricePclass(sym),
          note: priceNote(sym, "PriceFeed.fetchPrice (simulated)"),
          contract: pfContract(sym),
        },
      ],
    }),
  };
}

const pick = (b: { symbol: string; troveManager: string; priceFeed: string; sortedTroves: string }) => ({
  troveManager: b.troveManager,
  priceFeed: b.priceFeed,
  sortedTroves: b.sortedTroves,
});

const VOCABS: Record<string, LiquityForkLiveVocab> = {
  ebisu: makeVocab({
    protocolId: "ebisu",
    protocolName: "Ebisu",
    stablecoin: EBISU_DEBT,
    branchBySymbol: Object.fromEntries(Object.values(EBISU_BRANCHES).map((b) => [b.symbol, pick(b)])),
    constantsSource: "the per-branch AddressesRegistry (TM storage slot 15)",
    priceGrades: Object.fromEntries(Object.values(EBISU_BRANCHES).map((b) => [b.symbol, EBISU_PRICE_GRADES[b.key]])),
  }),
  asymmetry: makeVocab({
    protocolId: "asymmetry",
    protocolName: "Asymmetry",
    stablecoin: ASYMMETRY_DEBT,
    branchBySymbol: Object.fromEntries(Object.values(ASYMMETRY_BRANCHES).map((b) => [b.symbol, pick(b)])),
    constantsSource: "BorrowerOperations getters",
    priceGrades: Object.fromEntries(
      Object.values(ASYMMETRY_BRANCHES).map((b) => [b.symbol, ASYMMETRY_PRICE_GRADES[b.key]]),
    ),
  }),
  // The only entry whose contracts are not on Ethereum. Its receipts name Base
  // addresses, so it MUST be registered here rather than falling through to
  // forkLiveVocab's default — a defaulted receipt would cite Ebisu's mainnet
  // TroveManager under a Basedollar figure, which is worse than no receipt.
  basedollar: makeVocab({
    protocolId: "basedollar",
    protocolName: "Basedollar",
    stablecoin: BASEDOLLAR_DEBT,
    branchBySymbol: Object.fromEntries(Object.values(BASEDOLLAR_BRANCHES).map((b) => [b.symbol, pick(b)])),
    constantsSource: "BorrowerOperations getters",
    priceGrades: Object.fromEntries(
      Object.values(BASEDOLLAR_BRANCHES).map((b) => [b.symbol, BASEDOLLAR_PRICE_GRADES[b.key]]),
    ),
  }),
  // The reference deployment, reading the SAME architecture through the same
  // machinery — its constants sit on each branch's own BorrowerOperations
  // getters (the forks moved them to an AddressesRegistry slot).
  "liquity-v2": makeVocab({
    protocolId: "liquity-v2",
    protocolName: "Liquity V2",
    stablecoin: LIQUITY_V2_DEBT,
    branchBySymbol: Object.fromEntries(Object.values(LIQUITY_V2_BRANCHES).map((b) => [b.symbol, pick(b)])),
    constantsSource: "BorrowerOperations getters",
  }),
};

/** The live-lane vocabulary for a fork explorer, keyed by protocol id. */
export function forkLiveVocab(protocolId: string): LiquityForkLiveVocab {
  return VOCABS[protocolId] ?? VOCABS.ebisu;
}

/** The stablecoin each explorer on this machinery mints (display symbol). */
export const FORK_DEBT_SYMBOL: Record<string, string> = {
  ebisu: EBISU_DEBT,
  asymmetry: ASYMMETRY_DEBT,
  basedollar: BASEDOLLAR_DEBT,
  "liquity-v2": LIQUITY_V2_DEBT,
};
