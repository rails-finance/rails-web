import { useMemo } from "react";
import {
  type LiquityV2Branch,
  type LiquityV2BranchThresholds,
  type RatioMode,
  LIQUITY_V2_BRANCHES,
  DEFAULT_LIQUITY_V2_PREFERENCES,
} from "@/lib/shared/preferences";
import { usePreferences } from "@/lib/shared/preferences-context";

export function ratioLabel(mode: RatioMode): string {
  return mode === "ltv" ? "Loan-to-Value" : "Collateral Ratio";
}

export function ratioLabelShort(mode: RatioMode): string {
  return mode === "ltv" ? "LTV" : "CR";
}

// Convert a CR% value (e.g. 150 means 150%) to the display string for the chosen mode.
// LTV% = 10000 / CR%  (because LTV = debt/coll = 1 / (CR as ratio))
export function formatRatio(cr: number, mode: RatioMode, decimals = 1): string {
  if (!isFinite(cr) || cr <= 0) return mode === "ltv" ? "—" : "0%";
  const value = mode === "ltv" ? 10000 / cr : cr;
  return value.toFixed(decimals) + "%";
}

// Color class for a CR% value. Rails does not color-code collateral-ratio
// risk with green/amber/orange valence — every tier renders in neutral
// `text-foreground`; the ratio number itself carries the meaning. The
// threshold params are retained (callers still pass them) but no longer drive
// a hue, and the per-tier class options remain overridable for any call site
// that genuinely needs a non-default neutral. Evaluation still happens in CR
// terms so the (now neutral) result is correct under LTV display too.
export interface RatioColorOptions {
  danger?: number;
  warn?: number;
  safeClass?: string;
  warnClass?: string;
  dangerClass?: string;
  zeroClass?: string;
}

export function ratioColorClass(cr: number, opts: RatioColorOptions = {}): string {
  const {
    danger = 150,
    warn = 200,
    safeClass = "text-foreground",
    warnClass = "text-foreground",
    dangerClass = "text-foreground",
    zeroClass = "",
  } = opts;
  if (!isFinite(cr) || cr <= 0) return zeroClass;
  if (cr < danger) return dangerClass;
  if (cr < warn) return warnClass;
  return safeClass;
}

/** Resolve a collateral-type string ("WETH", "wstETH", "rETH" — sometimes
 *  rendered as "ETH" in legacy events) to the branch key used by preferences.
 *  Unknown branches fall back to WETH so the colour palette is never undefined. */
export function resolveLiquityBranch(collateralType: string | undefined): LiquityV2Branch {
  if (!collateralType) return "WETH";
  const normalised = collateralType === "ETH" ? "WETH" : collateralType;
  return (LIQUITY_V2_BRANCHES as readonly string[]).includes(normalised) ? (normalised as LiquityV2Branch) : "WETH";
}

/**
 * React hook that returns a Liquity V2-aware ratio colourer. Reads the user's
 * per-branch Conservative threshold and produces a function
 * `(cr, branch, extraOpts?) => className`. Callers pass the trove's
 * collateral type so each branch's threshold applies correctly — a wstETH
 * trove (MCR 120) uses a different cut-off from a WETH trove (MCR 110).
 *
 * The 3-zone runway model collapses Moderate+Aggressive into a single Caution
 * band, so this hook is binary: above vs below the Conservative threshold. Both
 * tiers render neutral (`text-foreground`) per §1 — the threshold params drive
 * the split, not a hue. `extraOpts` lets specific call sites override classes.
 */
export function useLiquityRatioColorClass(): (
  cr: number,
  branch: LiquityV2Branch | string | undefined,
  extraOpts?: RatioColorOptions,
) => string {
  const { prefs } = usePreferences();
  const byBranch = prefs.liquityV2.byBranch;
  return useMemo(() => {
    return (cr: number, branchInput: LiquityV2Branch | string | undefined, extraOpts: RatioColorOptions = {}) => {
      const branch = resolveLiquityBranch(branchInput);
      const t: LiquityV2BranchThresholds = byBranch[branch] ?? DEFAULT_LIQUITY_V2_PREFERENCES.byBranch[branch];
      // danger: 0 collapses to a single threshold — anything below the
      // Conservative cut-off falls through to warnClass, matching the runway's
      // single Caution band. (Both classes default to neutral; see header.)
      return ratioColorClass(cr, { danger: 0, warn: t.crConservativeMin, ...extraOpts });
    };
  }, [byBranch]);
}
