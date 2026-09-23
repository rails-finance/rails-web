// ============================================================================
// FETCH MAKERDAO RATE LOG
// ============================================================================
//
// Every yearly stability fee a collateral type has run at, and the drip each
// was first evidenced by — the series the vault page's rate-step market notes
// read the fee in force at each of a vault's own touches from.
//
// MakerDAO emits no rate-set log. Governance files a `duty` on the Jug and the
// spell's own block is not indexed, so there is no PrimaryRateSet-shaped row to
// join. rails-server derives the series from the Vat's own rate accumulator
// (one row per `Jug.drip`, whose delta encodes the duty it compounded at) and
// then CONFIRMS every set against `Jug.ilks(ilk).duty + Jug.base()` read at
// that set's own block: `aprPct` is the chain's answer and the one anything
// renders, `derivedAprPct` the derivation carried beside it.
//
// `artefacts` are derived sets the chain says were never a change at all —
// mostly the signature of a GAP in the fold series (no ilk has a drip in blocks
// 25,400,000–25,419,999, and the busy ilks' replayed accumulators run 0.08–0.35%
// under the Vat's own head rate from there on, which overstates every fee
// derived after it). They are listed rather than dropped silently, so a reader
// who checks the derivation against the chain can see exactly where the two
// part company. Nothing on the page reads them as a fee.

/** One fee the chain confirms the ilk ran at, and the drip it was first
 *  evidenced by. A set is the FIRST drip that compounded at a new duty: a
 *  governance `file` requires a drip in the same block first, so the interval
 *  before the file ends at the file and the next drip runs wholly at the new
 *  duty — this drip is the earliest observable moment of the change, not the
 *  spell's own block. */
export interface MakerRateSet {
  /** 1-based position in the served list. */
  ordinal: number;
  block: number;
  logIndex: number;
  /** The drip's own transaction. */
  txHash: string;
  /** Block timestamp, Unix seconds. */
  timestamp: number;
  /** The fee as a PERCENT (10.25), read from the Jug at this set's own block. */
  aprPct: number;
  /** The same fee as the Vat's own fold evidences it — equal to `aprPct` on a
   *  complete series, above it after the gap. */
  derivedAprPct: number;
}

/** A derived set the chain did not confirm as a change. */
export interface MakerRateArtefact {
  block: number;
  logIndex: number;
  txHash: string;
  timestamp: number;
  derivedAprPct: number;
  /** What the Jug actually said at that block — equal to the previous set's own
   *  fee, which is why this is not a set. */
  confirmedAprPct: number;
}

export interface MakerRateLogResponse {
  ilk: string;
  /** The Jug the fees were confirmed against. */
  jug: string;
  sets: MakerRateSet[];
  artefacts: MakerRateArtefact[];
  /** Folds walked over this ilk's whole life. */
  folds: number;
  lastFoldBlock: number | null;
  /** A one-line reason the newest sets are not confirmed yet (the archive RPC
   *  stalled); null when every set in `sets` was read from the chain. */
  stalled: string | null;
  rule: { minPp: number; confirmedAt: string };
}

/**
 * Fail-open: a vault page renders perfectly well with no rate log — it simply
 * carries no rate-step notes. Never a page that states a fee it could not
 * confirm, and never a page that fails to render because the fee series did
 * not answer.
 */
export async function fetchMakerRateLog(ilk: string, signal?: AbortSignal): Promise<MakerRateLogResponse | null> {
  try {
    const res = await fetch(`/api/makerdao/ilks/${encodeURIComponent(ilk)}/rate-log`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as MakerRateLogResponse;
    return Array.isArray(body?.sets) ? body : null;
  } catch {
    return null;
  }
}
