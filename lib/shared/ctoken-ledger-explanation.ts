// The flows panel's (i) for a tower built from the cToken ledger
// (lib/shared/ctoken-ledger.ts): each column in words, adding up the way the
// rows do, and which price each figure uses.

import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";

const usd = (lines: TowerLine[] | undefined) => (lines ?? []).reduce((s, l) => s + (l.usd ?? 0), 0);
const byLabel = (lines: TowerLine[], label: string) => lines.filter((l) => (l.flowLabel ?? "") === label);
const plain = (lines: TowerLine[]) => lines.filter((l) => !l.flowLabel);

function list(parts: [string, number][]): string {
  const shown = parts.filter(([, v]) => v >= 0.005).map(([w, v]) => `${w} ${formatCompactUsd(v)}`);
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

export function ctokenLedgerBullets(
  data: ChainTruthTowerData,
  opts: { brand: string; priceNote?: string },
): string[] | null {
  if (data.flowsPricedAtEvents === undefined || !data.valued) return null;
  const c = data.collateral;
  const d = data.debt;
  const out: string[] = [];
  const collIn = list([
    ["deposited", c.lifetimeInflow],
    ["received", usd(c.received)],
    ["earned", usd(c.earned)],
  ]);
  const collOut = list([
    ["withdrew", usd(plain(c.exited))],
    ["sent", usd(byLabel(c.exited, "Sent to other wallets"))],
    ["lost to liquidation (the protocol's share included)", usd(c.liquidated)],
  ]);
  if (collIn || collOut)
    out.push(
      `Collateral: ${collIn || "nothing in"}${collOut ? `; ${collOut}` : ""}. Held now: ${formatCompactUsd(usd(c.current))}.`,
    );
  const debtIn = list([
    ["borrowed", d.lifetimeInflow],
    ["charged in interest", usd(d.earned)],
  ]);
  const debtOut = list([
    ["repaid", usd(d.exited)],
    ["repaid by liquidators", usd(d.liquidated)],
  ]);
  if (debtIn || debtOut)
    out.push(
      `Debt: ${debtIn || "nothing borrowed"}${debtOut ? `; ${debtOut}` : ""}. Owed now: ${formatCompactUsd(usd(d.current))}.`,
    );
  out.push(
    data.flowsPricedAtEvents
      ? `Each flow is valued at ${opts.brand}'s oracle price at the block it happened in${opts.priceNote ? ` ${opts.priceNote}` : ""}. What is held or owed now is valued at today's price, and the Price change row is the difference, so each column adds up.`
      : `Some rows had no price at their block, so the flows are valued at ${opts.brand}'s oracle price today.`,
  );
  return out;
}
