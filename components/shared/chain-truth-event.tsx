"use client";

// Shared renderer for the "chain-state tier" timeline (Morpho + MakerDAO): the
// pared-down explorers that show only the chain's own values. The row grammar —
// plain-text label, neutral signed deltas with token glyphs, the shared
// EventTime, and a boxed StatCard snapshot grid — lives here, once, so the two
// protocols can't drift apart. Each protocol supplies a small spec via its own
// adapter (where the provenance + field mapping live); this file owns the look.
//
// Liquity V2 / Aave V4 stay on their own richer headers (before→after metrics,
// USD, rate pills); this tier is deliberately the minimal one. Four opt-in
// layers extend it, each stating its claim in the type so the tier stays
// minimal BY DESIGN rather than by accident:
//   1. a stat may carry `usd` — the after-balance valued at the EVENT's block by
//      the protocol's own captured oracle price (never today's price), where the
//      index provides it (Aave V3 + Spark, server mig 092);
//   2. a `party` may carry a `name` (+ party-pink `tone`) — a resolved
//      counterparty name over its truncated address, degrading to the address
//      before a name registry exists (the fork batch-manager delegate);
//   3. a row may carry a `ratePill` — a rate the position holder (or a delegate
//      acting for them) CHOSE, never a utilization rate; it echoes the detail
//      grid's rate receipt (the two Liquity forks' owner-set interest);
//   4. a row may carry `status: "open"` — the green status pill Liquity V2 uses
//      for an opening event, byte-matched from its header. A status affordance
//      on the LABEL WORD, never on a number (pure-truth-status-pill-color.md);
//      it pairs with per-axis delta labels (each axis' own verb) so the CDP
//      openers read the same as V2 — `Open  Deposit 6 ◊  Borrow 10K ♭`.

import type { Provenance, ProvInput } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { RatePillShell, DelegateRatePillShell } from "@/components/shared/rate-pill";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { EventTime } from "@/components/shared/event-time";
import { ExternalActorChip } from "@/components/shared/external-actor-chip";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { DeltaToggle, StatCard, StateTransition } from "@/components/shared/state-transition";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { fmtHeaderMagnitude, useHeaderValueHideClass } from "@/lib/shared/header-values";
import { formatCompact, formatExact, formatUsdValue } from "@/lib/utils/format";

/** Compact a full grouped number string ("10,967,283.723" → "10.97M") for the
 *  snapshot grid; the full string rides the tooltip + provenance trace. Passes
 *  non-numeric placeholders ("—") and sub-1000 values through unchanged. */
function compactAmount(full: string): string {
  const n = Number(full.replace(/,/g, ""));
  return Number.isFinite(n) && full.trim() !== "" ? formatCompact(n) : full;
}

/** USD chip formatter — the Liquity V2 / Aave V4 detail-chip style: `< $0.01`
 *  sub-cent, `$0.XX` sub-dollar, integer dollars otherwise. */
function fmtUsdChip(value: number): string {
  if (!Number.isFinite(value) || value < 0.01) return "< $0.01";
  if (value < 1) return `$${value.toFixed(2)}`;
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** One signed amount the event moved — neutral value + token glyph, wrapped in
 *  its provenance. `suffix` is a tiny trailing tag (e.g. Maker's "art"). The raw
 *  signed `value` is formatted compact ("1.2M") at render (fmtHeaderMagnitude);
 *  the exact figure rides the provenance trace. */
export interface ChainTruthDelta {
  value: number;
  symbol: string;
  /** The moved token's own address, where the builder could name it (see
   *  soleFlowAddress). Optional, and absent on most protocols by design: a
   *  curated roster's symbols are all in the house table, so the chip resolves
   *  them without help. It matters where the roster cannot — Morpho Blue lists
   *  616 distinct tokens on L1 and the table knows 88 symbols in total. */
  address?: string;
  prov: Provenance;
  suffix?: string;
  /** Optional leading label (e.g. "Cleared" / "Reduced" on a redemption). When
   *  set, the value renders as a bare magnitude — the label carries the
   *  direction, so no +/− sign is shown. Mirrors the Liquity V2 redemption /
   *  liquidation header grammar. */
  label?: string;
  /** Tint for the label. "caution" = the orange redemption/adverse tone
   *  (color-grammar.md §5); default is the neutral rb-500. */
  tone?: "caution";
  /** This label is a per-axis ACTION VERB (an open/adjust's Deposit/Borrow/…),
   *  so it follows Liquity V2's combined-header grammar: the verb word + token
   *  glyph stay visible at ≥sm and only the NUMERIC value hands off to the spine
   *  (the value's `<Prov>` carries the hide-class, like V2's wrapColl). Without
   *  this flag a labeled delta keeps the redemption/liquidation grammar — the
   *  whole lozenge (label + value) rides the hide-class together, so a passive
   *  event's label stays put and a non-passive one hides entirely. */
  axisVerb?: boolean;
  /** This delta has NO spine counterpart, by design — the card deliberately
   *  does not draw a token row for it (makerdao's fork carries its debt with
   *  the collateral, so the fork row shows only the collateral chip).
   *
   *  The ≥sm hand-off assumes every registered delta is redrawn on the spine;
   *  a delta that isn't would hide itself into nothing and the figure would
   *  simply vanish at desktop width. Set this and the value stays put, which is
   *  what the omitting card intended by "the header carries this one". Do NOT
   *  set it to paper over a missing row that ought to exist — draw the row. */
  noSpineCounterpart?: boolean;
}

export interface ChainTruthRowSpec {
  /** Action label, e.g. "Add Collateral" / "Open Vault". */
  label: string;
  /** Critical events (liquidation / grab) tint the label; the spine's red
   *  triangle carries the primary signal, so this stays restrained. */
  critical?: boolean;
  /** Adverse-but-not-terminal events (redemption): the action name lives on the
   *  spine's caution pill, so the desktop row drops the text label and shows it
   *  only as a mobile-only badge. Like `critical`, it also keeps the moved
   *  amounts visible at ≥sm — the warning spine carries no flanking numbers. */
  labelOnSpine?: boolean;
  /** Third-party action: someone other than the position owner executed this
   *  event (the spine shows the pink external-party glyph). The chip renders
   *  "by 0x12…34" in the party pink beside the deltas, with the receipt
   *  tracing both facts (tx sender + Pool caller vs owner). Like `critical`,
   *  it keeps the moved amounts in the header — the glyph spine carries no
   *  flanking numbers. */
  externalActor?: { address: string; prov: Provenance };
  /** Neutral party chip — "<prefix> 0x12…34" beside the deltas (e.g. Maker's
   *  give: "to <new owner>"). Unlike `externalActor` it carries no
   *  external-party signal: neutral tint, no spine hand-off — a named
   *  counterparty of the event itself, not a verdict about who acted.
   *  `name` renders over the truncated address when a registry resolves one
   *  (degrading to the address before it does); `tone: "party"` tints the chip
   *  party-pink for a delegate the owner handed control to (the fork batch
   *  manager). */
  party?: {
    prefix: string;
    address: string;
    prov: Provenance;
    name?: string;
    /** The named contract's protocol mark (an image src), drawn before the
     *  name. Only alongside a registry `name`. */
    icon?: string;
    tone?: "party";
    /** Resolve the address's ENS reverse record and render the name over the
     *  truncated hex where one exists (the same batched lookup the pink "by"
     *  chip makes). Opt-in: a row whose charter refuses names leaves it off. A
     *  registry `name` still wins over ENS. */
    ens?: boolean;
  };
  /** A CUSTODY move — the receipt token was transferred to or from another
   *  account, so nothing entered or left the protocol. The header then reads
   *  `400 ◎ to 0x546b…7240`: no action label (the spine's paper plane and the
   *  party chip's to/from are the verb), each delta as a bare magnitude (the
   *  chip carries the direction), and the amounts kept at every width — the
   *  spine draws no flank on a custody row, so there is nothing to hand off
   *  to (see SpineTokenRow.direction). */
  custody?: boolean;
  /** A rate the position holder (or a delegate acting for them) CHOSE — never a
   *  utilization rate. Renders as the same lozenge Liquity V2 uses (individual
   *  rb-500, or party-pink `tone: "delegate"` with the people glyph), and echoes
   *  the detail grid's rate receipt so pill and grid pulse as one identity. Not
   *  subject to the `hideClass` value hand-off — a rate is not a moved amount,
   *  and the spine never carries it. */
  ratePill?: { pct: number; tone?: "delegate"; prov: Provenance };
  /** Opening event: render the `label` as Liquity V2's green "Open" status pill
   *  instead of the plain text label. A status affordance on the label word, the
   *  same carve-out as the position-listing OPEN pill (pure-truth-status-pill-color.md)
   *  — never opinionated color on a number. The adapter pairs it with per-axis
   *  delta labels (each axis' own deposit/borrow-family verb), so the opener reads
   *  `Open  Deposit 6 ◊  Borrow 10K ♭`. Room reserved to add `"close"` (neutral)
   *  later; this pass only needs `"open"`. Ignored when `labelOnSpine`/`critical`
   *  own the label. */
  status?: "open";
  /** A trailing ratio chip ("134% CR") — the position's collateral ratio at
   *  this event, for an explorer whose rows carry the figures and an at-block
   *  price to state one (Polaris). Rendered once, just before the `evt-meta`
   *  span, as the same small chip Liquity V2's header draws; `belowMin` tints
   *  it red, the one colour a ratio may carry (below the market's minimum).
   *  Optional and drawn only when set, so no other explorer's row changes.
   *  The adapter gates it on the display flag and echoes the detail metric's
   *  receipt, so chip and metric pulse as one identity. */
  ratioChip?: { text: string; value: string; belowMin?: boolean; prov: Provenance };
  /** Signed amounts moved (0–2 in practice). A combined adjust omits the row
   *  `label` (empty string) and lets each delta's own `label` carry its per-axis
   *  verb — V2's grammar — so the header never shows a merged "Deposit & Borrow"
   *  verb ahead of the split. */
  deltas: ChainTruthDelta[];
}

/** A before→after transition attached to a snapshot stat: the reconstructed
 *  before-balance and the signed change, so the card can render a DeltaToggle.
 *  Here the CHANGE is the chain-direct logged delta (kind:"chain") and the
 *  BEFORE is derived (after − change, kind:"derived") — the inverse of the
 *  richer tiers, where the before is a snapshot and the delta is derived. */
export interface ChainTruthTransition {
  /** Reconstructed before-value, COMPACT ("11M"). */
  before: string;
  /** Full-precision before-value for the tooltip + provenance trace. */
  beforeExact: string;
  beforeProv: Provenance;
  /** Signed change string, COMPACT ("+1.2K" / "−500"). */
  change: string;
  /** Full-precision signed change for the tooltip + provenance trace. */
  changeExact: string;
  changeProv: Provenance;
}

/** One snapshot stat — the resulting on-chain state after the event. */
export interface ChainTruthStat {
  label: string;
  value: string;
  symbol: string;
  /** The token's own address, where the builder can name it — the same field,
   *  for the same reason, as ChainTruthDelta above. The icon chip resolves a
   *  mark from (chain, address); given a bare symbol it falls back to the
   *  house table, which cannot name a permissionless market's assets, and the
   *  stat draws an initial letter. Optional: a curated-roster explorer whose
   *  symbols the table already names needs nothing here. */
  address?: string;
  prov: Provenance;
  /** What the stat shows in place of the compacted `value`, where `value` is not
   *  a plain amount — a signed change shown while the balance it moved is still
   *  being read. `value` stays the receipt's exact figure. */
  display?: string;
  /** Dim the card when this side wasn't touched by the event. */
  dimmed?: boolean;
  /** When the event moved this axis, its before→after transition, rendered as a
   *  DeltaToggle. Omit for untouched axes — they stay a plain after-value. */
  transition?: ChainTruthTransition;
  /** The after-balance valued at the event-block oracle price, when the index
   *  carries one for this reserve (per-event historic prices — Aave V3 + Spark,
   *  server mig 092). Renders as the small bordered USD chip beside the
   *  after-value (the Liquity V2 / Aave V4 detail treatment), gated by the
   *  USD-values display flag. Omit where no captured price exists — the stat
   *  stays token-only (partial fill is a safe state). */
  usd?: { value: number; prov: Provenance };
}

/** The exact value string a ChainTruthRow delta registers with its receipt:
 *  labeled deltas (per-axis open/adjust verbs) register a BARE magnitude — the
 *  label carries the direction; unlabeled ones keep the sign (U+2212 minus).
 *  Cards echoing a header receipt onto a spine flank MUST build their echo
 *  value through this helper — the receipt entryKey matches byte-for-byte, so
 *  a private reimplementation that drifts silently unlinks the flank. */
export function chainTruthDeltaValue(value: number, labeled: boolean): string {
  return `${labeled ? "" : value < 0 ? "−" : "+"}${formatExact(Math.abs(value))}`;
}

/** Stamp the reconstruction's ACTUAL operand values into a transition prov.
 *  This function's caller (reconstructTransition) is the compute site — it is
 *  the code that does `before = after − change` — so it owns the numbers: for
 *  each operand phrase the prov's formula names (a phrase ending in "after" /
 *  "before" / "change"), fill the matching input row's value. The vocabularies
 *  declare the rows (label, class, per-protocol note); the driver supplies the
 *  figures. A phrase with no declared row gains a generic one, so a receipt
 *  built here never carries a named-but-untraced operand. */
function fillFormulaOperands(p: Provenance, vals: { after: string; before: string; change: string }): Provenance {
  if (!p.formula) return p;
  const phrases = [
    ...new Set(
      p.formula
        .split(/[−+×÷=()]/)
        .map((s) => s.trim())
        .filter((s) => /[a-z]/i.test(s)),
    ),
  ];
  const inputs: ProvInput[] = (p.inputs ?? []).map((i) => ({ ...i }));
  let touched = false;
  for (const phrase of phrases) {
    const lp = phrase.toLowerCase();
    const value = /(^|\s)after$/.test(lp)
      ? vals.after
      : /(^|\s)before$/.test(lp)
        ? vals.before
        : /(^|\s)change$/.test(lp)
          ? vals.change
          : null;
    if (value == null) continue;
    const hit = inputs.find((i) => {
      const l = i.label.toLowerCase();
      return l.includes(lp) || lp.includes(l);
    });
    if (hit) {
      if (!hit.value) {
        hit.value = value;
        touched = true;
      }
    } else {
      inputs.push({ label: phrase, value, kind: "chain-derived", note: "operand of this reconstruction" });
      touched = true;
    }
  }
  return touched ? { ...p, inputs } : p;
}

/** Build a before→after transition for a touched axis: before = after − change,
 *  the exact inverse of the logged delta. Returns undefined when there's no
 *  usable change (missing after, non-finite, or a zero move), so the card falls
 *  back to a plain after-value. The `changeProv` is the chain-direct logged
 *  delta; the `beforeProv` is the derived reconstruction (after − change). Both
 *  provs leave here with their formula operands VALUED (fillFormulaOperands) —
 *  this is where the arithmetic happens, so this is where the trace gets its
 *  numbers. */
export function reconstructTransition(args: {
  after: string | null | undefined;
  change: string | null | undefined;
  changeProv: Provenance;
  beforeProv: Provenance;
}): ChainTruthTransition | undefined {
  const { after, change, changeProv, beforeProv } = args;
  if (after == null || change == null) return undefined;
  const changeN = Number(change);
  const afterN = Number(after);
  if (!Number.isFinite(changeN) || !Number.isFinite(afterN) || changeN === 0) return undefined;
  const beforeN = afterN - changeN;
  const sign = changeN >= 0 ? "+" : "−";
  const vals = {
    after: formatExact(afterN),
    before: formatExact(beforeN),
    change: `${sign}${formatExact(Math.abs(changeN))}`,
  };
  return {
    before: formatCompact(beforeN),
    beforeExact: formatExact(beforeN),
    beforeProv: fillFormulaOperands(beforeProv, vals),
    change: `${sign}${formatCompact(Math.abs(changeN))}`,
    changeExact: `${sign}${formatExact(Math.abs(changeN))}`,
    changeProv: fillFormulaOperands(changeProv, vals),
  };
}

export function ChainTruthRow({
  spec,
  timestamp,
  eventNumber,
}: {
  spec: ChainTruthRowSpec;
  timestamp: number;
  eventNumber?: number;
}) {
  // Display flags (off-by-default ones are opt-in, matching Liquity / Aave):
  //  • showEventNumbers — the chronological badge.
  //  • The moved amounts follow the shared header hide-class: on the spine (≥md,
  //    Timeline values on), hidden here; otherwise rendered here.
  // Timestamps gate inside <EventTime>. px-5 pt-4 pb-3 matches the Aave header so
  // the row sits inset from the card edge (and aligns with the detail's px-5).
  const { showEventNumbers } = useTimelineDisplay();
  // `externalActor` is deliberately NOT passive. It used to be: the spine
  // replaced the token flow with a lone glyph on a third-party action, so there
  // was no flank to hand the amount to and the header had to keep it. The spine
  // now BADGES the flow instead of replacing it (SpineColumn `externalParty`),
  // so an external row hands off exactly like the owner-acted row it mirrors —
  // leaving it passive would paint the amount twice at ≥sm.
  const hideClass = useHeaderValueHideClass({
    isPassive: spec.critical || !!spec.labelOnSpine,
  });
  // The row's 12px gap separates its ITEMS — the label from the amounts, one
  // amount from the next. A party chip is not an item of its own: `Supply by
  // 0xa60d…ddeb` and `400 ◎ to 0x546b…7240` are each ONE phrase, so the chip
  // sits at phrase spacing (the 6px between a figure and its glyph) behind
  // whatever precedes it — the `-ml-1.5` on the chip wrappers below.
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4 pb-3">
      {spec.labelOnSpine ? (
        // The spine's caution pill carries "Redemption" on desktop; here it's a
        // mobile-only badge (the spine is hidden below sm), mirroring V2.
        <span className="sm:hidden inline-block shrink-0 rounded-full bg-caution-500/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-caution-600 dark:text-caution-400">
          {spec.label}
        </span>
      ) : spec.status === "open" && !spec.critical ? (
        // Opening event — the green "Open" status pill, byte-matched from Liquity
        // V2's open header (liquity-event-header.tsx). The `positive` token is the
        // Open/Enable green (app/globals.css). The per-axis delta labels beside it
        // carry each axis' own verb, so the CDP openers read as V2 does.
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-positive/20 text-positive">
          {spec.label}
        </span>
      ) : spec.label && !spec.custody ? (
        <span
          className={`shrink-0 text-sm font-medium ${spec.critical ? "text-red-600 dark:text-red-400" : "text-rb-500"}`}
        >
          {spec.label}
        </span>
      ) : // A combined adjust omits the row label — the per-axis delta labels carry
      // the verbs (V2's grammar) — and a custody row drops it: the spine's plane
      // and the chip's to/from are the verb. Render nothing so no empty span
      // steals a gap.
      null}

      {spec.deltas.map((d, i) => {
        // Labeled deltas (redemption's Cleared/Reduced) show a bare magnitude —
        // the label carries the direction; unlabeled ones keep the ± sign. A
        // custody row is bare too: the to/from chip is its direction.
        // A dust magnitude reads "<0.01"; a space keeps the sign from running
        // into the "<" ("− <0.01", not "−<0.01").
        const bare = Boolean(d.label) || Boolean(spec.custody);
        const magnitude = fmtHeaderMagnitude(Math.abs(d.value));
        const text = bare ? magnitude : `${d.value < 0 ? "−" : "+"}${magnitude.startsWith("<") ? " " : ""}${magnitude}`;
        const toneClass = d.tone === "caution" ? "text-caution-600 dark:text-caution-400" : "text-rb-500";
        // The header shows the compact form; the exact figure — full pipeline
        // precision, no re-rounding — rides the trace. Number only: the token
        // rides as `symbol` (the receipt shows its icon).
        const exact = chainTruthDeltaValue(d.value, bare);
        // A delta the spine never draws has nothing to hand off TO, so it keeps
        // its value at every width — otherwise the figure disappears at ≥sm.
        // A custody row's spine is the badged token alone, no flank, so every
        // delta on it stays.
        const deltaHide = d.noSpineCounterpart || spec.custody ? "" : hideClass;
        // The ≥sm spine hand-off (hideClass) rides the Prov wrapper itself —
        // hiding a child would leave the pill box painting an empty lozenge
        // when the receipt opens with timeline values on.
        //
        // A per-axis ACTION VERB (open/adjust) instead follows V2's combined
        // grammar: the verb word + glyph stay visible at ≥sm and ONLY the value's
        // lozenge hands off (so a combined adjust reads "Deposit ◊ Borrow ♭" at
        // desktop, its numbers on the spine — never an empty header). The value
        // still owns the whole Prov, so the lozenge never paints empty.
        if (d.axisVerb) {
          return (
            <span key={i} className="inline-flex items-center gap-1.5 text-sm">
              {d.label && <span className={toneClass}>{d.label}</span>}
              <Prov info={d.prov} value={exact} symbol={d.symbol} className={deltaHide || undefined}>
                <span className="font-semibold tabular-nums text-foreground">{text}</span>
              </Prov>
              <TokenChipIcon symbol={d.symbol} address={d.address} size={16} />
              {d.suffix && <span className="text-[10px] font-normal text-rb-500">{d.suffix}</span>}
            </span>
          );
        }
        return (
          <Prov key={i} info={d.prov} value={exact} symbol={d.symbol} className={deltaHide || undefined}>
            <span className="inline-flex items-center gap-1.5 text-sm">
              {d.label && <span className={toneClass}>{d.label}</span>}
              <span className="font-semibold tabular-nums text-foreground">{text}</span>
              <TokenChipIcon symbol={d.symbol} address={d.address} size={16} />
              {d.suffix && <span className="text-[10px] font-normal text-rb-500">{d.suffix}</span>}
            </span>
          </Prov>
        );
      })}

      {/* Rate pill — a chosen rate, rendered as the Liquity V2 lozenge. Deliberately
          NOT wrapped in hideClass: the ≥sm spine carries moved amounts, not a rate,
          so the pill stays visible in both value modes. Echoes the detail grid's
          rate receipt (same prov, same exact value key) so the two pulse as one. */}
      {spec.ratePill &&
        (() => {
          const rp = spec.ratePill;
          // The echo key is the exact 2-dp figure — shared with the detail rate
          // stat regardless of the pill's own display precision (1dp individual).
          const echoValue = `${rp.pct.toFixed(2)}%`;
          const display = rp.tone === "delegate" ? `${rp.pct.toFixed(2)}%` : `${rp.pct.toFixed(1)}%`;
          const Shell = rp.tone === "delegate" ? DelegateRatePillShell : RatePillShell;
          return (
            <Prov echo info={rp.prov} value={echoValue}>
              <Shell>{display}</Shell>
            </Prov>
          );
        })()}

      {spec.party && (
        <span className="-ml-1.5 inline-flex items-center">
          <PartyChip party={spec.party} />
        </span>
      )}

      {spec.externalActor && (
        // The acting party in the external-party pink, named where ENS resolves
        // one — the receipt traces the tx sender + Pool caller against the owner.
        <span className="-ml-1.5 inline-flex items-center">
          <ExternalActorChip address={spec.externalActor.address} prov={spec.externalActor.prov} />
        </span>
      )}

      {/* Ratio chip — the position's collateral ratio at this event. Like the
          rate pill, not a moved amount, so not behind hideClass. An echo of
          the detail grid's own ratio receipt (same info, same value key). */}
      {spec.ratioChip && (
        <Prov echo info={spec.ratioChip.prov} value={spec.ratioChip.value}>
          <span
            className={`text-xs tabular-nums ${spec.ratioChip.belowMin ? "text-red-500" : "text-rb-500"}`}
            data-ratio-chip={spec.ratioChip.belowMin ? "below-min" : "ok"}
          >
            {spec.ratioChip.text}
          </span>
        </Prov>
      )}

      {/* `evt-meta`: below sm this span becomes the header's own first row
          (app/globals.css) — date, time and event number right-aligned
          beside the card's chevron, the label and amounts beneath. */}
      <span className="evt-meta ml-auto flex items-center gap-2 tabular-nums">
        <EventTime ts={timestamp} />
        {showEventNumbers && eventNumber != null && (
          <span
            className="inline-flex items-center rounded-full bg-sunken px-1.5 py-0.5 text-[9px] text-rb-500"
            aria-label={`Event ${eventNumber}`}
            data-prov-exempt=""
          >
            {eventNumber}
          </span>
        )}
      </span>
    </div>
  );
}

/** Neutral counterparty chip (a transfer's to/from, a give's new owner) — the
 *  same shape as the external-actor chip. `tone: "party"` tints it party-pink
 *  for a delegate the owner handed control to. A registry `name` renders over
 *  the truncated address; with `ens` set and no registry name, the address's
 *  ENS reverse record does (batched through the same hook the pink chip uses),
 *  degrading to the hex until one resolves. Its own component so the hook
 *  runs unconditionally. */
function PartyChip({ party }: { party: NonNullable<ChainTruthRowSpec["party"]> }) {
  const ens = useEnsName(party.ens ? party.address : null);
  const shown = party.name ?? ens ?? `${party.address.slice(0, 6)}…${party.address.slice(-4)}`;
  return (
    <Prov
      info={party.prov}
      value={party.name ?? ens ?? party.address}
      className="inline-flex items-center gap-1 text-sm"
    >
      <span className="text-rb-500">{party.prefix}</span>
      {party.name && party.icon && (
        <img
          src={party.icon}
          alt=""
          width={14}
          height={14}
          className="size-3.5 shrink-0 rounded-full"
          data-party-icon=""
          data-prov-hidden=""
        />
      )}
      <span
        className={`font-medium ${party.tone === "party" ? "text-pink-600 dark:text-pink-400" : "text-foreground"}`}
      >
        {shown}
      </span>
    </Prov>
  );
}

export function ChainTruthDetail({ stats }: { stats: ChainTruthStat[] }) {
  // USD chips (stat.usd) follow the shared display flag, like the richer tiers.
  const { showUsdValues } = useTimelineDisplay();
  // The before→after toggle surfaces a reconstructed before (after − change).
  // Every leaf is on-chain (the replayed after, the logged delta), so the before
  // is chain-derived — it belongs in the chain-state view alongside the after it
  // pairs with, not behind the interpretation toggle. It renders in both views;
  // its `<Prov>` carries the chain-derived provenance either way. (The before-prov
  // each protocol supplies must be tagged `chain-derived`; an off-chain leaf would
  // keep it `derived` and it would collapse here, as it should.)
  return (
    // px-5 py-2 mirrors the Liquity / Aave detail bodies so the snapshot grid
    // sits inset from the shared bg-raised detail surface, not flush to its edge.
    <div className="grid grid-cols-1 gap-2.5 px-5 py-2 sm:auto-rows-fr sm:grid-cols-2">
      {stats.map((s, i) => (
        <div key={i} className={`h-full ${s.dimmed ? "opacity-50" : ""}`}>
          <StatCard label={s.label}>
            <StateTransition>
              {s.transition && (
                <DeltaToggle
                  before={
                    <Prov info={s.transition.beforeProv} value={s.transition.beforeExact}>
                      <span title={s.transition.beforeExact}>{s.transition.before}</span>
                    </Prov>
                  }
                  delta={
                    <Prov info={s.transition.changeProv} value={s.transition.changeExact}>
                      <span title={s.transition.changeExact}>{s.transition.change}</span>
                    </Prov>
                  }
                  size="sm"
                />
              )}
              <Prov
                info={s.prov}
                value={s.value}
                icon={s.symbol ? <TokenChipIcon symbol={s.symbol} address={s.address} size={16} /> : undefined}
              >
                <span
                  title={s.symbol ? `${s.value} ${s.symbol}` : s.value}
                  className="text-sm font-semibold tabular-nums"
                >
                  {s.display ?? compactAmount(s.value)}
                </span>
              </Prov>
              {showUsdValues && s.usd && (
                // The after-balance valued at the event-block oracle price —
                // the bordered chip the Liquity V2 / Aave V4 details use
                // (`3.0321 [ $7,062 ] ◊`). The exact 2-dp figure rides the
                // receipt; the chip shows whole dollars.
                <Prov info={s.usd.prov} value={formatUsdValue(s.usd.value)}>
                  <span className="text-xs flex font-bold items-center text-rb-500 border-l-2 border-r-2 border-rb-500 rounded-sm px-1 py-0">
                    {fmtUsdChip(s.usd.value)}
                  </span>
                </Prov>
              )}
            </StateTransition>
          </StatCard>
        </div>
      ))}
    </div>
  );
}
