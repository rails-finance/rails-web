// ── User Preferences — localStorage-backed persistence ─────────────────────

export type Theme = "dark" | "light";
export type RatioMode = "cr" | "ltv";

/** Liquity V2 collateral branches. Each branch has its own MCR (110% on WETH,
 *  120% on wstETH/rETH) so the user-editable risk thresholds need their own
 *  scale per branch. Keep this list in sync with backend / sieve config. */
export const LIQUITY_V2_BRANCHES = ["WETH", "wstETH", "rETH"] as const;
export type LiquityV2Branch = (typeof LIQUITY_V2_BRANCHES)[number];

/** Per-branch risk threshold. The runway uses a 3-zone model:
 *    Conservative — CR ≥ crConservativeMin (open-ended on the safe side)
 *    Caution      — MCR < CR < crConservativeMin (bounded interior)
 *    Liquidation  — CR ≤ MCR (open-ended on the loss side; trove is liquidatable)
 *  Only the Conservative→Caution boundary is user-editable; the lower bound
 *  is fixed by the branch's MCR. */
export interface LiquityV2BranchThresholds {
  crConservativeMin: number; // CR ≥ this → Conservative/green
  // CR < this → Caution/orange
}

export interface LiquityV2Preferences {
  byBranch: Record<LiquityV2Branch, LiquityV2BranchThresholds>;
}

/** Aave V4 risk-zone preferences. Aave's collateral assets each have their own
 *  liquidation threshold (LT), so there's no single MCR to express prefs
 *  against the way Liquity does. Instead the user picks how much *headroom*
 *  above an asset's liquidation price they consider "Conservative": a single
 *  global percentage that applies to every collateral asset across every
 *  spoke. The price runway maps this to a per-asset price via
 *  `thresholdPrice = liqPrice × (1 + headroomConservativeMin/100)`. */
export interface AaveV4Preferences {
  /** Conservative zone starts at `liqPrice × (1 + this/100)`. Anything below
   *  it but above liqPrice sits in Caution; below liqPrice is Liquidation. */
  headroomConservativeMin: number;
}

export interface UserPreferences {
  _version: 1;
  expandedEvents: string[]; // txHash list, FIFO capped at MAX_EXPANDED
  theme: Theme;
  ratioMode: RatioMode; // Display collateral health as Collateral Ratio (CR) or Loan-to-Value (LTV)
  hideClosedPositions: boolean; // Hide closed/liquidated positions from selectors and the protocol nav
  priceStripMinimized: boolean; // Collapse the floating price strip to a small icon
  liquityV2: LiquityV2Preferences; // Per-branch risk thresholds
  aaveV4: AaveV4Preferences; // Global headroom preference for the price runway
}

const STORAGE_KEY = "defi-explorer-preferences";
const MAX_EXPANDED = 200;

/** Defaults sit ~1.82× the branch MCR — original WETH default (200 against
 *  MCR=110). Branches with MCR=120 round to 220 so the buffer in
 *  MCR-multiples stays comparable across branches. */
export const DEFAULT_LIQUITY_V2_PREFERENCES: LiquityV2Preferences = {
  byBranch: {
    WETH: { crConservativeMin: 200 },
    wstETH: { crConservativeMin: 220 },
    rETH: { crConservativeMin: 220 },
  },
};

/** 25% above liq price is a comfortable default. Conservative defaults already
 *  span an asset's typical daily-to-weekly volatility for the bluechip side of
 *  Aave's collateral list; volatile assets sit deeper into Caution at the same
 *  setting, which is the desired conservatism. */
export const DEFAULT_AAVE_V4_PREFERENCES: AaveV4Preferences = {
  headroomConservativeMin: 25,
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  _version: 1,
  expandedEvents: [],
  theme: "dark",
  ratioMode: "cr",
  hideClosedPositions: false,
  priceStripMinimized: false,
  liquityV2: DEFAULT_LIQUITY_V2_PREFERENCES,
  aaveV4: DEFAULT_AAVE_V4_PREFERENCES,
};

/** Migrate older preference shapes:
 *    1. Legacy flat `{ crConservativeMin, crModerateMin }` — keep
 *       `crConservativeMin`, drop `crModerateMin`, apply to every branch.
 *    2. Earlier per-branch shape with `crModerateMin` alongside
 *       `crConservativeMin` — keep `crConservativeMin`, drop the rest.
 *    3. Current per-branch shape with just `crConservativeMin` — pass through. */
function normaliseLiquityV2(stored: unknown): LiquityV2Preferences {
  const out: LiquityV2Preferences = {
    byBranch: { ...DEFAULT_LIQUITY_V2_PREFERENCES.byBranch },
  };
  if (!stored || typeof stored !== "object") return out;
  const s = stored as Record<string, unknown>;

  // Legacy flat shape — distribute saved Conservative threshold to every branch.
  if (typeof s.crConservativeMin === "number") {
    const flat: LiquityV2BranchThresholds = { crConservativeMin: s.crConservativeMin as number };
    for (const b of LIQUITY_V2_BRANCHES) out.byBranch[b] = { ...flat };
  }

  // Per-branch shape — keep only the Conservative threshold; older
  // `crModerateMin` keys are silently dropped.
  const byBranch = (s.byBranch ?? null) as Partial<Record<LiquityV2Branch, { crConservativeMin?: number }>> | null;
  if (byBranch && typeof byBranch === "object") {
    for (const b of LIQUITY_V2_BRANCHES) {
      const branch = byBranch[b];
      if (branch && typeof branch.crConservativeMin === "number") {
        out.byBranch[b] = { crConservativeMin: branch.crConservativeMin };
      }
    }
  }
  return out;
}

function normaliseAaveV4(stored: unknown): AaveV4Preferences {
  if (!stored || typeof stored !== "object") return { ...DEFAULT_AAVE_V4_PREFERENCES };
  const s = stored as Record<string, unknown>;
  const headroom = typeof s.headroomConservativeMin === "number" ? s.headroomConservativeMin : null;
  if (headroom === null || !isFinite(headroom) || headroom <= 0) return { ...DEFAULT_AAVE_V4_PREFERENCES };
  return { headroomConservativeMin: headroom };
}

export function loadPreferences(): UserPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_PREFERENCES };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw);
    if (parsed._version !== 1) return { ...DEFAULT_PREFERENCES };
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      liquityV2: normaliseLiquityV2(parsed.liquityV2),
      aaveV4: normaliseAaveV4(parsed.aaveV4),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: UserPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or unavailable — silently fail
  }
}
