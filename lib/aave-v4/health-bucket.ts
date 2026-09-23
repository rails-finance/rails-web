// Shared health-factor → status-pill bucketing for Aave V4 position cards.
// Both the listing card and the detail card consume this so their status
// pills speak the same vocabulary (SUPPLY ONLY / BORROWING / LIQUIDATABLE).
//
// One axis only: what the position is doing right now, read straight off the
// health factor. Supply only (nothing borrowed, so no HF and no liquidation
// risk), Borrowing (has a loan, HF ≥ 1), Liquidatable (HF < 1 — a hard
// on-chain fact). These three are mutually exclusive — a position is exactly
// one of them. Deliberately NOT lifecycle words ("open"/"closed"): Aave has no
// position object with an open/close event, so that framing is Liquity's and
// doesn't map here. Liquidation *history* (was this ever liquidated?) is a
// separate, orthogonal axis carried by the LiquidatedBadge, not this pill — a
// position can be Borrowing now and have been liquidated before. Rails does not
// editorialize where within the healthy band a position sits with words like
// "cautious" or "at risk"; the HF value and headroom % carry that meaning.
//
// Color is intentionally neutral across every bucket too — no red/amber/green
// valence. Every pill renders in the same neutral surface token; the value
// color is plain foreground.

export interface HealthBucket {
  pillLabel: string;
  pillClass: string;
  valueColor: string;
}

// Single neutral pill style shared by every bucket — distinguished by label,
// not hue.
const NEUTRAL_PILL = "bg-rb-300 dark:bg-rb-700 text-foreground/80 dark:text-foreground/60";

export function bucketForHealth(hf: number | null): HealthBucket {
  if (hf == null) {
    return { pillLabel: "Supply only", pillClass: NEUTRAL_PILL, valueColor: "text-rb-500" };
  }
  if (hf >= 1.0) {
    return { pillLabel: "Borrowing", pillClass: NEUTRAL_PILL, valueColor: "text-foreground/80" };
  }
  return { pillLabel: "Liquidatable", pillClass: NEUTRAL_PILL, valueColor: "text-foreground/80" };
}
