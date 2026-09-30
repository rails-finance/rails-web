// The flows panel's (i) for a tower built from the cToken ledger
// (lib/shared/ctoken-ledger.ts): each column in words, adding up the way the
// rows do, and which price each figure uses.

import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";

const usd = (lines: TowerLine[] | undefined) => (lines ?? []).reduce((s, l) => s + (l.usd ?? 0), 0);
const byLabel = (lines: TowerLine[], label: string) => lines.filter((l) => (l.flowLabel ?? "") === label);
const plain = (lines: TowerLine[]) => lines.filter((l) => !l.flowLabel);

/** The panel's own figure format: cents, whole dollars, or compact. */
function money(data: ChainTruthTowerData): (n: number) => string {
  if (data.centsUsdAmounts)
    return (n) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (data.fullUsdAmounts) return (n) => `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
  return (n) => formatCompactUsd(Math.abs(n));
}

function list(parts: [string, number][], fmt: (n: number) => string, min: number): string {
  const shown = parts.filter(([, v]) => v >= min).map(([w, v]) => `${w} ${fmt(v)}`);
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

export function ctokenLedgerBullets(
  data: ChainTruthTowerData,
  opts: { brand: string; priceNote?: string },
): string[] | null {
  if (data.flowsPricedAtEvents === undefined || !data.valued) return null;
  const fmt = money(data);
  const min = data.centsUsdAmounts ? 0.005 : 0.5;
  const c = data.collateral;
  const d = data.debt;
  const out: string[] = [];
  const collIn = list(
    [
      ["deposited", c.lifetimeInflow],
      ["received", usd(c.received)],
      ["earned", usd(c.earned)],
    ],
    fmt,
    min,
  );
  const collOut = list(
    [
      ["withdrew", usd(plain(c.exited))],
      ["sent", usd(byLabel(c.exited, "Sent to other wallets"))],
      ["had seized by liquidation (the protocol's share included)", usd(c.liquidated)],
    ],
    fmt,
    min,
  );
  if (collIn || collOut)
    out.push(
      `Collateral: ${collIn || "nothing in"}${collOut ? `; ${collOut}` : ""}. Held now: ${fmt(usd(c.current))}.`,
    );
  const debtIn = list(
    [
      ["borrowed", d.lifetimeInflow],
      ["charged in interest", usd(d.earned)],
    ],
    fmt,
    min,
  );
  const debtOut = list(
    [
      ["repaid", usd(d.exited)],
      ["liquidated (repaid by liquidators)", usd(d.liquidated)],
    ],
    fmt,
    min,
  );
  if (debtIn || debtOut)
    out.push(
      `Debt: ${debtIn || "nothing borrowed"}${debtOut ? `; ${debtOut}` : ""}. Owed now: ${fmt(usd(d.current))}.`,
    );
  if (data.flowsPricedAtEvents) {
    out.push(
      `Each flow is valued at ${opts.brand}'s oracle price at the block it happened in${opts.priceNote ? ` ${opts.priceNote}` : ""}; what is held or owed now is valued at today's price.`,
    );
    const pc = (side: "collateral" | "debt") => {
      const l = data[side].priceChange;
      return l && l.usd != null && Math.abs(l.usd) >= min ? l.usd : null;
    };
    const cp = pc("collateral");
    const dp = pc("debt");
    if (cp != null || dp != null) {
      const parts = [
        cp != null ? `${cp >= 0 ? "+" : "−"}${fmt(cp)} on collateral` : null,
        dp != null ? `${dp >= 0 ? "+" : "−"}${fmt(dp)} on debt` : null,
      ].filter(Boolean);
      out.push(
        `Price change (${parts.join(", ")}) is what the same tokens gained or lost in value between those prices: a token deposited at one price and withdrawn or held at another counts the difference here, stablecoins included when their oracle price moved a fraction of a cent. It is what makes each column add up.`,
      );
    }
  } else {
    out.push(`Some rows had no price at their block, so the flows are valued at ${opts.brand}'s oracle price today.`);
  }
  return out;
}
