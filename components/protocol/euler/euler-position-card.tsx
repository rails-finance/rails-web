"use client";

// An Euler V2 holding's card (J1; rails-ops reference/read-on-visit-candidates-572.md,
// row 10). A deposit: what its shares redeem for, what the share price added
// over 30 days, and the loan it backs. A loan: the debt, the collateral's value,
// health, and the interest over 30 days, with each collateral on a row of the
// band under it (J1.1). Dollars only where the vault's unit of account is USD.

import { Prov, type Provenance } from "@/components/shared/provenance";
import { PositionCard, type PositionCardHead, type PositionCardSlots } from "@/components/shared/position-card";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";
import { PoolReadStamp, Segs } from "@/components/protocol/uniswap/uniswap-readout";
import { eulerPosition } from "@/lib/euler/position";
import { cardProv, collateralProv, readContracts, type EulerReceiptContext } from "@/lib/euler/provenance";
import type { EulerPositionRead } from "@/lib/euler/types";
import { CARD_WORDS, cardExplainer, inUnit, num, rate, short } from "@/lib/euler/words";

/** Every figure's read stamp on an Euler page. */
export function EulerReadStamp({ c, what }: { c: EulerReceiptContext; what: string }) {
  return (
    <PoolReadStamp chainId={c.r.chainId} head={c.r.head} then={c.r.then} contracts={readContracts(c)} what={what} />
  );
}

/** The value line under a figure, traced to the same receipt. */
const valueLine = (s: string | null, info: Provenance) =>
  s === null ? null : (
    <span className="text-rb-500">
      <Prov info={info}>{s}</Prov>
    </span>
  );

function CollateralBand({ c }: { c: EulerReceiptContext }) {
  const { p, r } = c;
  return (
    <div className="mt-4" data-anatomy="J1.1" data-euler-collaterals="">
      <div className="mb-1 text-xs text-rb-500">{CARD_WORDS.band}</div>
      <div className="overflow-x-auto rounded-lg border border-rb-200 dark:border-rb-500/30">
        <table className="w-full text-left text-[13px]">
          <thead className="text-xs text-rb-500">
            <tr>
              <th className="px-3 py-1.5 font-medium">Vault</th>
              <th className="px-3 py-1.5 text-right font-medium">{CARD_WORDS.bandAmount}</th>
              {p.unit.kind !== "off" && <th className="px-3 py-1.5 text-right font-medium">{CARD_WORDS.bandValue}</th>}
              <th className="px-3 py-1.5 text-right font-medium">{CARD_WORDS.bandLtv}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rb-200 dark:divide-rb-500/30">
            {p.collaterals.map((x, i) => (
              <tr key={x.vault} data-euler-collateral={x.vault}>
                <td className="px-3 py-1.5 text-foreground">{x.vaultSymbol}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  <Prov info={collateralProv(i, "amount", c)}>
                    {num(x.amount)} {x.asset.symbol}
                  </Prov>
                </td>
                {p.unit.kind !== "off" && (
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {x.value === null ? (
                      <span className="text-rb-500">{CARD_WORDS.unpriced}</span>
                    ) : (
                      <Prov info={collateralProv(i, "value", c)}>{inUnit(x.value, p.unit) ?? CARD_WORDS.unpriced}</Prov>
                    )}
                  </td>
                )}
                <td className="px-3 py-1.5 text-right tabular-nums">
                  <Prov info={collateralProv(i, "ltv", c)}>{rate(x.ltvLiquidation)}</Prov>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.borrow?.truncated && <p className="mt-1 text-xs text-rb-500">{CARD_WORDS.bandTruncated}</p>}
    </div>
  );
}

/** Earned in 30 days or Interest in 30 days: the figure where the holding matched at both reads,
 *  its value and the vault's yearly rate under it; otherwise "Opened" or "Changed inside the 30
 *  days", and the (i) says why (Fluid's treatment). */
function windowHead(c: EulerReceiptContext, id: "earned" | "interest"): PositionCardHead {
  const { p } = c;
  const loan = id === "interest";
  const x = loan ? p.interest : p.earned;
  const head = {
    id,
    label: loan ? CARD_WORDS.interest : CARD_WORDS.earned,
    labelTip: loan ? CARD_WORDS.interestTip : CARD_WORDS.earnedTip,
  };
  if (p.windowState !== "ok" || x === null)
    return {
      ...head,
      value: (
        <span className="text-xs text-rb-500" data-window-withheld={p.windowState}>
          {p.windowState === "opened" ? CARD_WORDS.windowOpenedShort : CARD_WORDS.windowChangedShort}
        </span>
      ),
    };
  const year = loan ? p.window.borrowRateYear : p.window.supplyRateYear;
  return {
    ...head,
    value: (
      <Prov info={cardProv(id, c)}>
        {num(x)} {p.asset.symbol}
      </Prov>
    ),
    usd: valueLine(inUnit(p.windowValue, p.unit), cardProv(id, c)),
    sub:
      year === null ? undefined : (
        <span data-figure={`${id}-rate`}>{(loan ? CARD_WORDS.interestYear : CARD_WORDS.earnedYear)(year)}</span>
      ),
  };
}

function slots(r: EulerPositionRead): PositionCardSlots {
  const p = eulerPosition(r);
  const c = { p, r };
  const A = p.asset.symbol;
  const heads: PositionCardHead[] = [];
  if (p.kind === "deposit") {
    heads.push({
      id: "supplied",
      label: CARD_WORDS.supplied,
      labelTip: CARD_WORDS.suppliedTip,
      value: (
        <Prov info={cardProv("supplied", c)}>
          {num(p.supplied)} {A}
        </Prov>
      ),
      usd: valueLine(inUnit(p.suppliedValue, p.unit), cardProv("supplied", c)),
    });
    heads.push(windowHead(c, "earned"));
    heads.push({
      id: "collateral",
      label: CARD_WORDS.collateralFor,
      labelTip: CARD_WORDS.collateralForTip,
      value: (
        <Prov info={cardProv("collateralFor", c)}>
          {p.collateralFor.length
            ? CARD_WORDS.backs(p.collateralFor)
            : p.collateralEnabled
              ? CARD_WORDS.enabledNoLoan
              : CARD_WORDS.backsNone}
        </Prov>
      ),
    });
  } else {
    heads.push({
      id: "borrowed",
      label: CARD_WORDS.borrowed,
      labelTip: CARD_WORDS.borrowedTip,
      value: (
        <Prov info={cardProv("borrowed", c)}>
          {num(p.borrowed)} {A}
        </Prov>
      ),
      usd: valueLine(inUnit(p.borrowedValue, p.unit), cardProv("borrowed", c)),
    });
    if (p.unit.kind !== "off")
      heads.push({
        id: "collateral-value",
        label: CARD_WORDS.collateralValue,
        labelTip: CARD_WORDS.collateralValueTip,
        tier: "amount",
        value:
          p.collateralValue === null || inUnit(p.collateralValue, p.unit) === null ? null : (
            <Prov info={cardProv("collateralValue", c)}>{inUnit(p.collateralValue, p.unit)}</Prov>
          ),
      });
    heads.push({
      id: "health",
      label: CARD_WORDS.health,
      labelTip: CARD_WORDS.healthTip,
      value: p.health === null ? null : <Prov info={cardProv("health", c)}>{p.health.toFixed(2)}</Prov>,
      sub: CARD_WORDS.healthSub,
    });
    heads.push(windowHead(c, "interest"));
  }
  const words = cardExplainer(p);
  return {
    surface: "detail",
    heading: CARD_WORDS.heading,
    status: null,
    identity: (
      <span className="text-xs text-rb-500">
        {p.vaultSymbol} · <span className="font-mono">{short(p.account)}</span>
      </span>
    ),
    heads,
    counters: null,
    menu: { exports: null },
    stamp: <EulerReadStamp c={c} what="Every figure on this card" />,
    explainer: {
      body: (
        <div data-position-explanation="">
          {words.map((g) => (
            <ExplainGroup key={g.title} title={g.title}>
              {g.bullets.map((b, i) => (
                <ExplainBullet key={i}>
                  <Segs segs={b} />
                </ExplainBullet>
              ))}
            </ExplainGroup>
          ))}
        </div>
      ),
    },
    learnMore: null,
    band: p.kind === "loan" && p.collaterals.length ? <CollateralBand c={c} /> : null,
    foot: <p className="mt-3 text-xs text-rb-500">{CARD_WORDS.foot(p)}</p>,
    panel: [[], []],
  };
}

export function EulerPositionCard({ r }: { r: EulerPositionRead }) {
  return (
    <div
      data-anatomy="J1"
      data-position-card={`${r.account}:${r.vault.address}`}
      data-euler-kind={r.borrow ? "loan" : "deposit"}
      data-live-block={r.head.block}
    >
      <PositionCard slots={slots(r)} />
    </div>
  );
}
