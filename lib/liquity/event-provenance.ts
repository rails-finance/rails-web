// Concrete-coordinate primitives for the Liquity V2 trove view — the Liquity
// analogue of Aave's position-provenance helpers. The trove cards build their
// `<Prov>` objects inline (TroveManager contract, before/after state, derived
// CR), but the figures that come straight off an event log were naming only a
// Solidity field — never WHICH delivery (rails-server index vs live Etherscan
// getLogs) carried that log, nor the concrete tx / block the value sits at.
//
// These builders supply that missing specificity, the same way the Aave dock
// got it: a delivery phrase + via, and copyable block / tx / asset chips
// threaded from the event.

import type { Provenance, ProvInput, ProvScaling, ProvVerify } from "@/components/shared/provenance";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import type { OriginEnvelope } from "@/lib/shared/types/event-shape";
import { formatExact } from "@/lib/utils/format";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const INDEX_VIA = "rails-server index of decoded Liquity V2 logs";

export const streamVia = () => INDEX_VIA;

/** The concrete on-chain coordinates of an event-level value — the tx + block
 *  it was emitted at, and the token it concerns. Threaded from the event so the
 *  dock can show (and copy) the specific facts behind a number rather than a
 *  boilerplate sentence. Every field is optional. */
export interface EventCoords {
  txHash?: string;
  blockNumber?: number;
  /** The token this value concerns (collateral symbol or "BOLD"). */
  asset?: string;
}

/** Build the copyable input chips (asset / block / tx) for an event-level prov,
 *  optionally appended after any figure-specific inputs the caller already has. */
export function eventInputs(coords: EventCoords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs = [...extra];
  if (!coords) return inputs;
  if (coords.asset) inputs.push({ label: "asset", value: coords.asset, kind: "chain" });
  if (coords.blockNumber != null)
    inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
  if (coords.txHash)
    inputs.push({
      label: "tx",
      value: coords.txHash,
      kind: "chain",
      note: "indexed log",
    });
  return inputs;
}

/** Log-anatomy via segment: `_field: <raw>` when the index delivered the
 *  log's raw integer, plain `_field` until it does. The raw string is passed
 *  through untouched — it IS the chain value; never reconstruct it from the
 *  rounded float. */
export const fieldSeg = (field: string, raw?: string | null): string =>
  raw != null && raw !== "" ? `${field}: ${raw}` : field;

/** The via segments for a value summed from several log fields — the primary
 *  field always, secondary fields only when their raw is present and nonzero
 *  (they're almost always 0 and would drown the line). */
export function fieldSumSeg(
  primary: { f: string; raw?: string | null },
  ...rest: { f: string; raw?: string | null }[]
): string {
  const parts = [fieldSeg(primary.f, primary.raw)];
  for (const r of rest) {
    if (r.raw != null && r.raw !== "" && !/^-?0$/.test(r.raw)) parts.push(fieldSeg(r.f, r.raw));
  }
  return parts.join(" + ");
}

/** Log-anatomy via segments driven by the backend's origin envelope — the
 *  pipeline's own {event, param, raw, scale}, stamped in rails-server beside
 *  the SQL column selections. The envelope is AUTHORITATIVE when delivered:
 *  it is truthful per row where a hand-written string can't be (a batched
 *  row's collateral names BatchedTroveUpdated; the vocabulary could only
 *  claim the regular arm). The fallback declaration renders for older api
 *  responses that predate envelopes. `prior` prefixes "previous" for
 *  before-state values — the envelope names the log, not which instance;
 *  that is the section's own meaning. */
export function originSeg(
  o: OriginEnvelope | null | undefined,
  fb: { event: string; param: string; scale: number; raw?: string | null },
  prior = false,
): string {
  const prefix = prior ? "previous " : "";
  if (!o) return `${prefix}${fb.event} log · ${fieldSeg(fb.param, fb.raw)} · ÷10^${fb.scale}`;
  return `${prefix}${o.event} log · ${fieldSeg(o.param, o.raw ?? fb.raw)} · ÷10^${o.scale}`;
}

/** The receipt's plain scaling sentence for the same field originSeg names —
 *  the raw and the power of ten from the envelope when delivered, else the
 *  fallback declaration. No raw, no sentence. */
export function scalingOf(
  o: OriginEnvelope | null | undefined,
  fb: { scale: number; raw?: string | null },
  unit: { token: string } | "rate",
): ProvScaling | undefined {
  const raw = o?.raw ?? fb.raw;
  if (raw == null || raw === "") return undefined;
  const places = o?.scale ?? fb.scale;
  return unit === "rate"
    ? { raw, places, why: "Liquity writes a rate as a fraction with 18 decimal places, where 1 means 100%", unit: "%" }
    : { raw, places, why: `${unit.token} amounts have ${places} decimal places` };
}

/** Envelope-driven sum via — fieldSumSeg with each part's name/raw preferring
 *  its origin envelope. All parts share the primary's event and scale. */
export function originSumSeg(
  primary: { o?: OriginEnvelope | null; f: string; raw?: string | null },
  rest: Array<{ o?: OriginEnvelope | null; f: string; raw?: string | null }>,
  fb: { event: string; scale: number },
): string {
  const seg = (p: { o?: OriginEnvelope | null; f: string; raw?: string | null }) =>
    fieldSeg(p.o?.param ?? p.f, p.o?.raw ?? p.raw);
  const parts = [seg(primary)];
  for (const r of rest) {
    const raw = r.o?.raw ?? r.raw;
    if (raw != null && raw !== "" && !/^-?0$/.test(raw)) parts.push(seg(r));
  }
  return `${primary.o?.event ?? fb.event} log · ${parts.join(" + ")} · ÷10^${primary.o?.scale ?? fb.scale}`;
}

// ── The event's change receipts ──────────────────────────────────────────────
// The header's collateral/debt change values are the card's canonical "what
// moved" receipts. They're built HERE — not inline in the header — because the
// same figure re-renders elsewhere on the card (the spine flanking value, the
// detail's delta toggle), and those instances echo into the same receipt (same
// info/value/symbol key) so the locator pulse reaches every rendering. One
// builder = one identity; a drifting copy would silently split the receipt.

/** V2 TroveManager per branch — the contract these chain deltas come from.
 *  Keyed by lowercased collateral symbol. */
export const TROVE_MANAGER: Record<string, string> = {
  weth: "0x7bcb64b2c9206a5b699ed43363f6f98d4776cf5a",
  wsteth: "0xa2895d6a3bf110561dfe4b71ca539d84e1928b22",
  reth: "0xb2b2abeb5c357a234363ff5d180912d319e3e19e",
};

export interface ChangeProv {
  /** The signed change (operation + redistribution [+ fee for debt], or the
   *  after − before fallback when the TroveOperation log is absent). Callers
   *  decide sign/magnitude display; the receipt's exact is the magnitude. */
  change: number;
  info: Provenance;
  /** The exact figure — every decimal the pipeline delivered, no re-rounding. */
  value: string;
  symbol: string;
}

/** A single figure's receipt identity — the vocabulary plus the exact value
 *  string. The primary rendering passes BOTH to `<Prov>`; every other
 *  rendering of the same figure echoes with the same pair, so the receipt
 *  key (label|value|symbol) matches even when the two surfaces round to
 *  different display precisions. */
export interface FigureProv {
  info: Provenance;
  /** The exact figure — every decimal the pipeline delivered, no re-rounding. */
  value: string;
}

const changeVerify = (coords?: EventCoords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

/** The trove's recorded annual interest rate AFTER this event. The detail
 *  grid's Interest Rate metric is the receipt's primary; the header's rate
 *  pills (RatePill / DelegateRatePill) echo it — the shared exact value keeps
 *  the receipt key stable across their different display precisions (the
 *  detail renders 1dp, the delegate pill 2dp). */
export function rateAfterProv(ctx: LiquityContext, coords?: EventCoords): FigureProv | undefined {
  const { stateAfter } = ctx;
  if (!stateAfter) return undefined;
  return {
    value: formatExact(stateAfter.annualInterestRate),
    info: {
      kind: "chain",
      pclass: "emitted",
      verify: changeVerify(coords),
      summary:
        "Annual interest rate after this event — the rate the contract logged for the trove at this event. The trove pays interest at this rate until it next changes.",
      contract: { name: "TroveManager", address: TROVE_MANAGER[(ctx.collateralType ?? "").toLowerCase()] },
      via: `${streamVia()} · ${originSeg(stateAfter.origin?.annualInterestRate, {
        event: "TroveUpdated",
        param: "_annualInterestRate",
        scale: 16,
        raw: stateAfter.raw?.annualInterestRate,
      })}`,
      scaling: scalingOf(
        stateAfter.origin?.annualInterestRate,
        { scale: 16, raw: stateAfter.raw?.annualInterestRate },
        "rate",
      ),
      inputs: eventInputs(coords),
    },
  };
}

/** The upfront fee this operation charged — emitted on the TroveOperation log
 *  and already included in the trove's recorded debt after the event (the
 *  detail's "N fee" sub-line). */
export function upfrontFeeProv(ctx: LiquityContext, coords?: EventCoords): FigureProv | undefined {
  const { troveOperation } = ctx;
  const fee = troveOperation?.debtIncreaseFromUpfrontFee ?? 0;
  if (!troveOperation || fee <= 0) return undefined;
  const debtSym = ctx.assetType ?? "BOLD";
  return {
    value: formatExact(fee),
    info: {
      kind: "chain",
      pclass: "emitted",
      verify: changeVerify(coords),
      summary: `Upfront fee (${debtSym}) charged by this operation — a one-off borrowing fee added to the trove's debt.`,
      contract: { name: "TroveManager", address: TROVE_MANAGER[(ctx.collateralType ?? "").toLowerCase()] },
      via: `${streamVia()} · ${originSeg(troveOperation.origin?.debtIncreaseFromUpfrontFee, {
        event: "TroveOperation",
        param: "_debtIncreaseFromUpfrontFee",
        scale: 18,
        raw: troveOperation.raw?.debtIncreaseFromUpfrontFee,
      })}`,
      scaling: scalingOf(
        troveOperation.origin?.debtIncreaseFromUpfrontFee,
        { scale: 18, raw: troveOperation.raw?.debtIncreaseFromUpfrontFee },
        { token: debtSym },
      ),
      inputs: eventInputs({ ...coords, asset: debtSym }),
    },
  };
}

/** The historic collateral-price pill — the on-chain oracle value at this
 *  event's block: the indexer reads the Chainlink market feeds and the LST's
 *  canonical exchange rate at the event block and applies Liquity's own
 *  PriceFeed MIN/MAX rules. Every leaf is on-chain, so the price is
 *  chain-derived, not an off-chain quote. */
export function eventPriceProv(ctx: LiquityContext, coords?: EventCoords): FigureProv | undefined {
  const price = ctx.collateralPrice ?? 0;
  if (price <= 0) return undefined;
  const collSym = ctx.collateralType ?? "collateral";
  return {
    value: formatExact(price),
    info: {
      kind: "chain-derived",
      pclass: "oracle",
      summary: `${collSym} price at this event — the price Liquity used at this block, from Chainlink's on-chain price feeds (and, for staked ETH, the token's exchange rate) combined by the rules in Liquity's PriceFeed contract.`,
      via: `${streamVia()} · on-chain oracle feeds @ event block · Liquity PriceFeed math`,
      inputs: eventInputs({ ...coords, asset: collSym }),
    },
  };
}

/** The header's collateral-change receipt identity. */
export function collChangeProv(ctx: LiquityContext, coords?: EventCoords): ChangeProv | undefined {
  const { troveOperation, stateAfter, stateBefore } = ctx;
  if (!stateAfter || !stateBefore) return undefined;
  const collSym = ctx.collateralType ?? "collateral";
  const change = troveOperation
    ? troveOperation.collChangeFromOperation + troveOperation.collIncreaseFromRedist
    : stateAfter.coll - stateBefore.coll;
  return {
    change,
    value: formatExact(Math.abs(change)),
    symbol: collSym,
    info: {
      // The prose says what the value MEANS; the via line is the log anatomy —
      // linked log, field(s) with the raw integer when the index delivers it,
      // and the wei scaling. Neither repeats the other.
      kind: troveOperation ? "chain" : "chain-derived",
      verify: changeVerify(coords),
      summary: troveOperation
        ? `Collateral (${collSym}) moved by this operation — the amount this operation added or took out, plus any share of a liquidated trove's collateral passed to this trove.`
        : `Collateral (${collSym}) moved by this operation — the balance the contract logged after this event, minus the balance it logged at the trove's previous change.`,
      contract: { name: "TroveManager", address: TROVE_MANAGER[(ctx.collateralType ?? "").toLowerCase()] },
      via: troveOperation
        ? `${streamVia()} · ${originSumSeg(
            {
              o: troveOperation.origin?.collChangeFromOperation,
              f: "_collChangeFromOperation",
              raw: troveOperation.raw?.collChangeFromOperation,
            },
            [
              {
                o: troveOperation.origin?.collIncreaseFromRedist,
                f: "_collIncreaseFromRedist",
                raw: troveOperation.raw?.collIncreaseFromRedist,
              },
            ],
            { event: "TroveOperation", scale: 18 },
          )}`
        : `${streamVia()} · TroveUpdated log · Δ_coll · ÷10^18`,
      inputs: eventInputs({ ...coords, asset: collSym }),
    },
  };
}

/** The header's debt-change receipt identity. */
export function debtChangeProv(ctx: LiquityContext, coords?: EventCoords): ChangeProv | undefined {
  const { troveOperation, stateAfter, stateBefore } = ctx;
  if (!stateAfter || !stateBefore) return undefined;
  const debtSym = ctx.assetType ?? "BOLD";
  const change = troveOperation
    ? troveOperation.debtChangeFromOperation +
      troveOperation.debtIncreaseFromRedist +
      troveOperation.debtIncreaseFromUpfrontFee
    : stateAfter.debt - stateBefore.debt;
  return {
    change,
    value: formatExact(Math.abs(change)),
    symbol: debtSym,
    info: {
      kind: troveOperation ? "chain" : "chain-derived",
      verify: changeVerify(coords),
      summary: troveOperation
        ? `Debt (${debtSym}) change from this operation — the amount borrowed or repaid, plus any share of a liquidated trove's debt passed to this trove and any upfront fee.`
        : `Debt (${debtSym}) change from this operation — the debt the contract logged after this event, minus the debt it logged at the trove's previous change.`,
      contract: { name: "TroveManager", address: TROVE_MANAGER[(ctx.collateralType ?? "").toLowerCase()] },
      via: troveOperation
        ? `${streamVia()} · ${originSumSeg(
            {
              o: troveOperation.origin?.debtChangeFromOperation,
              f: "_debtChangeFromOperation",
              raw: troveOperation.raw?.debtChangeFromOperation,
            },
            [
              {
                o: troveOperation.origin?.debtIncreaseFromRedist,
                f: "_debtIncreaseFromRedist",
                raw: troveOperation.raw?.debtIncreaseFromRedist,
              },
              {
                o: troveOperation.origin?.debtIncreaseFromUpfrontFee,
                f: "_debtIncreaseFromUpfrontFee",
                raw: troveOperation.raw?.debtIncreaseFromUpfrontFee,
              },
            ],
            { event: "TroveOperation", scale: 18 },
          )}`
        : `${streamVia()} · TroveUpdated log · Δ_debt · ÷10^18`,
      inputs: eventInputs({ ...coords, asset: debtSym }),
    },
  };
}
