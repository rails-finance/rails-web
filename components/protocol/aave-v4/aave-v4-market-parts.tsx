"use client";

// Aave V4 market parts (ui-jobs 548): the pieces the V4 adapter
// (lib/aave-v4/product.tsx, lib/aave-v4/reserve.tsx) hands the shared product
// shells as drawn figures, each with its receipt (lib/aave-v4/market-provenance.ts):
// the hub chip, the state tags, a spoke reserve's parameters (the spoke's and the
// hub's, each labelled) and the Details panel that opens them in a row.

import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import { HeadingTip } from "@/components/shared/tip-label";
import { v4ParameterTips } from "@/lib/aave-v4/learn-more-parameters";
import { ChevronDown } from "lucide-react";
import { AnchoredPanel } from "@/components/shared/asset-popover";
import { Prov } from "@/components/shared/provenance";
import { DATA_TABLE_PILL } from "@/components/shared/data-table/data-table";
import { fmtUsd } from "@/lib/aave-v4/format";
import { formatCompact, formatCompactTitled } from "@/lib/shared/format-compact";
import { publishedText, ageClauseText } from "@/lib/morpho/oracle-age";
import { headParamProv } from "@/lib/aave-v4/market-provenance";
import type { V4Line, V4ReserveFigures } from "@/lib/aave-v4/markets";

const TAG = `${DATA_TABLE_PILL} px-1 py-px text-[10px] uppercase tracking-wide`;

/** A percentage to two places, trailing zeros dropped: "82.5%". */
export const pctText = (x: number) => `${(x * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** The hub a reserve draws from, beside its symbol. */
export function HubChip({ label }: { label: string }) {
  return (
    <span
      className={`${DATA_TABLE_PILL} px-1.5 py-px text-[10px]`}
      data-hub-chip={label}
      title={`Drawn from the ${label} hub`}
    >
      {label}
    </span>
  );
}

/** A token amount in USD at the reserve's price, or in tokens where there is none. */
export function amountText(tokens: number, price: number | null, symbol: string): { display: string; title: string } {
  if (tokens === 0) return { display: price != null ? "$0" : `0 ${symbol}`, title: "None" };
  if (price != null) return fmtUsd(tokens * price);
  const t = formatCompactTitled(tokens);
  return { display: `${t.display} ${symbol}`, title: `${t.title} ${symbol}` };
}

/** Who the reserve's figures name in their receipts. */
export interface V4Names {
  symbol: string;
  spoke: string;
  hub: string;
}

/** The state tags beside the symbol: states, not judgements. */
export function V4StateTags({ f, line, names }: { f: V4ReserveFigures | null; line: V4Line; names: V4Names }) {
  const paused = f?.paused ?? line.base?.paused ?? false;
  const frozen = f?.frozen ?? line.base?.frozen ?? false;
  const halted = f?.halted ?? line.halted ?? false;
  const tag = (word: string, title: string, call: string, side: "spoke" | "hub", meaning: string) =>
    f ? (
      <span className={TAG} title={title}>
        <Prov info={headParamProv(f, side, `${names.symbol} ${word}`, call, meaning, names)}>{word}</Prov>
      </span>
    ) : (
      <span className={TAG} title={title} data-prov-exempt="">
        {word}
      </span>
    );
  return (
    <>
      {paused &&
        tag(
          "paused",
          "Paused: every action suspended",
          "getReserveConfig(reserveId).paused",
          "spoke",
          "the spoke has paused the reserve",
        )}
      {frozen &&
        tag(
          "frozen",
          "Frozen: no new supply or borrowing; existing positions unwind",
          "getReserveConfig(reserveId).frozen",
          "spoke",
          "the spoke has frozen the reserve",
        )}
      {halted &&
        tag(
          "halted",
          "Halted by the hub: the spoke cannot add or draw",
          "getSpokeConfig(assetId, spoke).halted",
          "hub",
          "the hub has halted this spoke's line",
        )}
      {line.base?.registryPaused && (
        <span className={TAG} title="Coinbase's registry has paused this stock's price" data-prov-exempt="">
          price paused
        </span>
      )}
    </>
  );
}

/** The terms' sentences (`v4ParameterTips`), set by V4Parameters. */
const TipsContext = createContext<Record<string, string>>({});

/** One parameter row; its label explains itself on a press (C10's HeadingTip). */
function Line({ term, title, children }: { term: string; title?: string; children: ReactNode }) {
  const tip = useContext(TipsContext)[term] ?? title;
  return (
    <div className="contents">
      <dt className="text-rb-500" data-parameter-term={term}>
        <HeadingTip text={term} tip={tip} />
      </dt>
      <dd className="text-right tabular-nums text-foreground">{children}</dd>
    </div>
  );
}

const capText = (cap: number | null, symbol: string) =>
  cap == null ? "no cap" : cap === 0 ? "closed" : `${formatCompact(cap)} ${symbol}`;

/** The spoke's terms for the reserve, from the head read. */
function SpokeTerms({ f, line, names }: { f: V4ReserveFigures; line: V4Line; names: V4Names }) {
  const p = (what: string, call: string, meaning: string, side: "spoke" | "oracle" = "spoke") =>
    headParamProv(f, side, `${names.symbol} ${what}`, call, meaning, names);
  return (
    <>
      <Line term="Oracle price" title="The price the spoke's oracle gives this asset, in USD">
        {f.price != null ? (
          <Prov
            info={p("oracle price", "getReservePrice(reserveId)", "the price the spoke values the asset at", "oracle")}
          >
            ${f.price.toLocaleString("en-US", { maximumFractionDigits: f.price < 10 ? 4 : 2 })}
          </Prov>
        ) : (
          <span data-prov-exempt="">not read</span>
        )}
      </Line>
      {line.base?.feedUpdatedAt != null && (
        <Line term="Price published" title="When the feed behind the oracle last published">
          <span data-prov-exempt="" title={ageClauseText(line.base.feedUpdatedAt, line.base.readTs, line.base.block)}>
            {publishedText(line.base.feedUpdatedAt, line.base.readTs)}
          </span>
        </Line>
      )}
      <Line term="Collateral factor" title="The share of the asset's value the spoke counts toward a borrow">
        <Prov
          info={p(
            "collateral factor",
            "getDynamicReserveConfig(reserveId, key).collateralFactor",
            "the share of the asset's value counted toward a borrow",
          )}
        >
          {f.collateralFactor != null ? pctText(f.collateralFactor) : "not collateral"}
        </Prov>
      </Line>
      <Line term="Max liquidation bonus" title="The most extra collateral a liquidator can take">
        <Prov
          info={p(
            "max liquidation bonus",
            "getDynamicReserveConfig(reserveId, key).maxLiquidationBonus",
            "the most extra collateral a liquidator takes, over 100%",
          )}
        >
          {f.maxLiquidationBonus != null ? pctText(f.maxLiquidationBonus) : "none"}
        </Prov>
      </Line>
      <Line term="Liquidation fee" title="The share of the liquidation bonus the protocol keeps">
        <Prov
          info={p(
            "liquidation fee",
            "getDynamicReserveConfig(reserveId, key).liquidationFee",
            "the share of the liquidation bonus the protocol keeps",
          )}
        >
          {f.liquidationFee != null ? pctText(f.liquidationFee) : "none"}
        </Prov>
      </Line>
      <Line
        term="Collateral risk"
        title="Sets the premium a borrower pays above the drawn rate when posting this asset"
      >
        <Prov
          info={p(
            "collateral risk",
            "getReserveConfig(reserveId).collateralRisk",
            "the risk that sets the premium a borrower posting this asset pays above the drawn rate",
          )}
        >
          {f.collateralRisk != null ? pctText(f.collateralRisk) : "not read"}
        </Prov>
      </Line>
      <Line term="Borrowable" title="Whether the spoke lends this asset">
        <Prov info={p("borrowable", "getReserveConfig(reserveId).borrowable", "whether the spoke lends the asset")}>
          {f.borrowable ? "yes" : "no"}
        </Prov>
      </Line>
      {line.base && (
        <Line term="Paused" title="The spoke's pause, then Coinbase's registry pause on the stock's price">
          <Prov info={p("paused", "getReserveConfig(reserveId).paused", "whether the spoke has paused the reserve")}>
            {f.paused ? "by the spoke" : "no"}
          </Prov>
          {line.base.registryPaused != null && (
            <span className="block text-[11px] text-rb-500" data-prov-exempt="">
              {line.base.registryPaused ? "price paused by Coinbase" : "price live at Coinbase"}
            </span>
          )}
        </Line>
      )}
    </>
  );
}

/** The hub's terms for the spoke's line, from the head read. */
function HubTerms({ f, names }: { f: V4ReserveFigures; names: V4Names }) {
  const p = (what: string, call: string, meaning: string) =>
    headParamProv(f, "hub", `${names.symbol} ${what}`, call, meaning, names);
  return (
    <>
      <Line term="Add cap" title="The most the hub takes in from this spoke">
        <Prov
          info={p(
            "add cap",
            "getSpokeConfig(assetId, spoke).addCap",
            "the most the hub takes in from this spoke, whole tokens",
          )}
        >
          {capText(f.addCap, names.symbol)}
        </Prov>
      </Line>
      <Line term="Draw cap" title="The most this spoke can draw from the hub">
        <Prov
          info={p("draw cap", "getSpokeConfig(assetId, spoke).drawCap", "the most this spoke can draw, whole tokens")}
        >
          {capText(f.drawCap, names.symbol)}
        </Prov>
      </Line>
      <Line term="Liquidity fee" title="The share of borrowers' interest the hub keeps">
        <Prov
          info={p(
            "liquidity fee",
            "getAssetConfig(assetId).liquidityFee",
            "the share of borrowers' interest the hub keeps",
          )}
        >
          {f.liquidityFee != null ? pctText(f.liquidityFee) : "not read"}
        </Prov>
      </Line>
      <Line term="Line" title="Whether the hub lets this spoke add and draw">
        <Prov
          info={p(
            "line status",
            "getSpokeConfig(assetId, spoke).active, .halted",
            "whether the line is active or halted",
          )}
        >
          {f.halted ? "halted" : f.active === false ? "inactive" : "active"}
        </Prov>
      </Line>
      {f.curve && (
        <Line term="Optimal usage" title="The utilisation at which the drawn rate starts to climb steeply">
          <Prov
            info={p(
              "optimal usage",
              "strategy getInterestRateData(assetId).optimalUsageRatio",
              "where the rate curve turns",
            )}
          >
            {pctText(f.curve.optimal)}
          </Prov>
        </Line>
      )}
    </>
  );
}

/** A spoke reserve's parameters: the spoke's, then the hub's, each labelled. */
export function V4Parameters({ f, line, names }: { f: V4ReserveFigures; line: V4Line; names: V4Names }) {
  const head = "mb-1.5 text-[11px] uppercase tracking-wider text-rb-500";
  const list = "grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]";
  return (
    <TipsContext.Provider value={v4ParameterTips(names)}>
      <div data-reserve-parameters="">
        <p className={head}>This spoke</p>
        <dl className={list} data-parameters-side="spoke">
          <SpokeTerms f={f} line={line} names={names} />
        </dl>
        <p className={`${head} mt-3`}>Hub: {names.hub}</p>
        <dl className={list} data-parameters-side="hub">
          <HubTerms f={f} names={names} />
        </dl>
      </div>
    </TipsContext.Provider>
  );
}

/** The Details control in the asset cell: the parameters in a panel. */
export function V4Details({
  f,
  line,
  names,
  rowKey,
}: {
  f: V4ReserveFigures;
  line: V4Line;
  names: V4Names;
  rowKey: string;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const label = `${names.symbol} reserve, ${names.hub} hub`;
  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${names.symbol} details`}
        className={`focus-ring relative z-30 inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-md px-1 py-0.5 text-[11px] transition-colors hover:text-foreground ${open ? "text-foreground" : "text-rb-500"}`}
        data-reserve-details-toggle={rowKey}
      >
        Details
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <span className="contents" onClick={(e) => e.stopPropagation()}>
          <AnchoredPanel
            id={panelId}
            label={label}
            anchor={() => button.current}
            onClose={close}
            fit={340}
            drop
            name="reserve-details"
            surface="overlay"
          >
            <p className="mb-3 pr-8 text-[13px] font-semibold text-foreground sm:pr-0">{label}</p>
            <V4Parameters f={f} line={line} names={names} />
          </AnchoredPanel>
        </span>
      )}
    </>
  );
}
