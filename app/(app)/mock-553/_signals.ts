// ui-jobs 553, step 1: the mock's reads. A vault's five plain signals, each
// worked from data Rails already holds: the index's summary (lib/vaults) and
// the daily store's share-price and total-assets series, read here over 130
// days so a 90-day figure has room for a gap. MOCK ONLY: the build puts these
// behind the product shells with receipts (decision 0059).
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { loadVaultIndex } from "@/lib/vaults/index-read";
import { vaultDisplayName, type VaultSummary } from "@/lib/vaults/summary";
import { VAULT_FAMILIES } from "@/lib/vaults/families";
import { illiquidSentence } from "@/lib/vaults/illiquid";
import { formatCompact } from "@/lib/shared/format-compact";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { tooSmallToMeasure, type VaultSeries } from "@/lib/vaults/yield";
import { vaultAssetsSeriesKey, vaultSeriesKey } from "@/lib/vaults/yield-read";

const DAY_MS = 86_400_000;
const READ_DAYS = 130;

export interface Read {
  day: number;
  value: number;
}

/** One vault's two daily series, oldest first, as numbers in the asset. */
export interface VaultDaily {
  price: Read[];
  assets: Read[];
}

async function readSeries(chainId: number, keys: string[]): Promise<Record<string, VaultSeries> | null> {
  const base = process.env.RAILS_API_URL;
  if (!base || keys.length === 0) return null;
  const qs = new URLSearchParams({
    chain: String(chainId),
    series: keys.join(","),
    from: String(Math.floor(Date.now() / DAY_MS) - READ_DAYS),
  });
  try {
    const res = await fetch(`${base}/api/prices/daily?${qs}`, createAuthFetchOptions({ next: { revalidate: 3600 } }));
    if (!res.ok) return null;
    return ((await res.json()) as { series?: Record<string, VaultSeries> }).series ?? {};
  } catch {
    return null;
  }
}

const toReads = (s: VaultSeries | undefined, decimals: number, zeroIsRead: boolean): Read[] =>
  (s?.obs ?? [])
    .filter((o) => o[1] != null && (zeroIsRead || BigInt(o[1] as string) > BigInt(0)))
    .map((o) => ({ day: o[0], value: Number(BigInt(o[1] as string)) / 10 ** decimals }))
    .sort((a, b) => a.day - b.day);

/** Daily series for many vaults on one chain, 40 keys a request. */
export async function loadDaily(vaults: VaultSummary[]): Promise<Map<string, VaultDaily>> {
  const out = new Map<string, VaultDaily>();
  const byChain = new Map<number, VaultSummary[]>();
  for (const v of vaults) byChain.set(v.chainId, [...(byChain.get(v.chainId) ?? []), v]);
  await Promise.all(
    [...byChain].flatMap(([chainId, vs]) => {
      const chunks: VaultSummary[][] = [];
      for (let i = 0; i < vs.length; i += 20) chunks.push(vs.slice(i, i + 20));
      return chunks.map(async (chunk) => {
        const keys = chunk.flatMap((v) => [
          vaultSeriesKey(chainId, v.address),
          vaultAssetsSeriesKey(chainId, v.address),
        ]);
        const series = await readSeries(chainId, keys);
        if (!series) return;
        for (const v of chunk)
          out.set(`${chainId}:${v.address}`, {
            price: toReads(series[vaultSeriesKey(chainId, v.address)], v.asset.decimals, false),
            assets: toReads(series[vaultAssetsSeriesKey(chainId, v.address)], v.asset.decimals, true),
          });
      });
    }),
  );
  return out;
}

/** The latest read, and the latest read at least `days` before it. */
function span(reads: Read[], days: number): { from: Read; to: Read } | null {
  if (reads.length === 0) return null;
  const to = reads[reads.length - 1];
  let from: Read | null = null;
  for (const r of reads) {
    if (r.day > to.day - days) break;
    from = r;
  }
  return from ? { from, to } : null;
}

const yearly = (s: { from: Read; to: Read }) => (s.to.value / s.from.value - 1) * (365 / (s.to.day - s.from.day));

export const dayText = (day: number) =>
  new Date(day * DAY_MS).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const pct = (x: number, digits = 1) =>
  `${(x * 100).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const signedPct = (x: number, digits = 1) => `${x > 0 ? "+" : ""}${pct(x, digits)}`;

export type SignalKey = "size" | "earning" | "exit" | "losses" | "steward";

/** One line of the readout. `state` is what the line can say today:
 *  `read` a measured sentence, `partial` a sentence missing a part, `missing`
 *  nothing measured for this family yet. `receipt` lists the reads behind it. */
export interface Signal {
  key: SignalKey;
  label: string;
  word: string | null;
  sentence: string;
  state: "read" | "partial" | "missing";
  receipt: string[];
  /** For ordering in the lens: a number where one exists. */
  figure?: number;
}

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  size: "Growing or shrinking",
  earning: "Earning steadily",
  exit: "Can I get out today",
  losses: "Has it lost money",
  steward: "Who runs it",
};

export interface Readout {
  size: Signal;
  earning: Signal & { y30?: number; y90?: number; low?: number; high?: number };
  exit: Signal;
  losses: Signal;
  steward: Signal;
}

const STEWARD_ROLE: Record<string, string> = { curator: "curator", owner: "owner", roleManager: "role manager" };

export function readout(v: VaultSummary, d: VaultDaily | undefined): Readout {
  const sym = v.asset.symbol;
  const fam = VAULT_FAMILIES[v.family].label;

  // 1. Size over 30 days, from the total-assets series.
  const a = d ? span(d.assets, 30) : null;
  let size: Signal;
  if (!a) {
    size = {
      key: "size",
      label: SIGNAL_LABELS.size,
      word: null,
      sentence: `No total-assets series for ${fam} vaults yet.`,
      state: "missing",
      receipt: [],
    };
  } else {
    const change = a.from.value === 0 ? null : a.to.value / a.from.value - 1;
    const flat = change != null && Math.abs(change) < 0.01;
    size = {
      key: "size",
      label: SIGNAL_LABELS.size,
      word: change == null ? "New" : flat ? "Steady" : change > 0 ? "Growing" : "Shrinking",
      sentence:
        change == null
          ? `Holds ${formatCompact(a.to.value)} ${sym}; it held nothing on ${dayText(a.from.day)}.`
          : `Holds ${formatCompact(a.to.value)} ${sym}, ${signedPct(change)} since ${dayText(a.from.day)} (${formatCompact(a.from.value)}).`,
      state: "read",
      receipt: [`totalAssets() on ${dayText(a.from.day)} and ${dayText(a.to.day)}, the daily store`],
      figure: change ?? undefined,
    };
  }

  // 2. Earning: 30 and 90 days, and the three 30-day windows inside the 90.
  const p30 = d ? span(d.price, 30) : null;
  const p90 = d ? span(d.price, 90) : null;
  let earning: Readout["earning"];
  const tiny = v.totalAssets != null && tooSmallToMeasure(v.totalAssets.raw);
  if (!p30 || tiny) {
    earning = {
      key: "earning",
      label: SIGNAL_LABELS.earning,
      word: null,
      sentence: tiny
        ? "Too small to measure: rounding moves its share price more than its earnings do."
        : v.family === "maple-pool"
          ? "Maple pools have no share-price series in the daily store yet."
          : "Its share-price series is younger than 30 days.",
      state: "missing",
      receipt: [],
    };
  } else {
    const y30 = yearly(p30);
    const y90 = p90 ? yearly(p90) : undefined;
    const windows: number[] = [];
    if (p90 && d) {
      const end = d.price[d.price.length - 1].day;
      for (const k of [0, 30, 60]) {
        const upto = d.price.filter((r) => r.day <= end - k);
        const s = span(upto, 30);
        if (s) windows.push(yearly(s));
      }
    }
    const low = windows.length === 3 ? Math.min(...windows) : undefined;
    const high = windows.length === 3 ? Math.max(...windows) : undefined;
    const steady = low != null && high != null && high - low < Math.max(0.01, Math.abs(y30) * 0.25);
    const flat = Math.abs(y30) < 0.0005 && (y90 == null || Math.abs(y90) < 0.0005);
    earning = {
      key: "earning",
      label: SIGNAL_LABELS.earning,
      word: flat ? "Flat" : y30 < 0 ? "Falling" : low == null ? "Young" : steady ? "Steady" : "Uneven",
      sentence: flat
        ? v.family === "umbrella-stake"
          ? "Its share price does not move: Umbrella pays its rewards outside the share, and Rails does not read them yet."
          : "Its share price has not moved in 90 days."
        : `${pct(y30)} a year over 30 days` +
          (y90 != null ? `, ${pct(y90)} over 90` : "") +
          (low != null && high != null
            ? `. Each 30 days of the last 90 earned between ${pct(low)} and ${pct(high)}.`
            : ". The series is too young for 90 days."),
      state: low != null ? "read" : "partial",
      receipt: [
        `convertToAssets(1 share) on ${dayText(p30.from.day)} and ${dayText(p30.to.day)}`,
        ...(p90 ? [`and on ${dayText(p90.from.day)}, ${windows.length + 1} reads in all`] : []),
      ],
      figure: y30,
      y30,
      y90,
      low,
      high,
    };
  }

  // 3. Can I get out today.
  let exit: Signal;
  if (v.family === "metamorpho") {
    exit = v.illiquid
      ? {
          key: "exit",
          label: SIGNAL_LABELS.exit,
          word: "Not all of it",
          sentence: illiquidSentence(v.illiquid),
          state: "partial",
          receipt: ["each market's supply, borrow and rate at the read block (ui-jobs 540)"],
        }
      : {
          key: "exit",
          label: SIGNAL_LABELS.exit,
          word: "Yes, mostly",
          sentence:
            "Less than 10% of it is in markets borrowed to the rate ceiling. Rails does not yet state the share withdrawable now.",
          state: "partial",
          receipt: ["each market's supply, borrow and rate at the read block (ui-jobs 540)"],
        };
  } else if (v.family === "sgho" || v.family === "stata") {
    exit = {
      key: "exit",
      label: SIGNAL_LABELS.exit,
      word: null,
      sentence:
        v.family === "sgho"
          ? "Savings GHO pays out from its own balance; Rails does not read maxWithdraw yet."
          : "Limited by the Aave reserve's available liquidity, which Rails reads on the reserve page but not here yet.",
      state: "missing",
      receipt: [],
    };
  } else if (v.family === "umbrella-stake") {
    exit = {
      key: "exit",
      label: SIGNAL_LABELS.exit,
      word: "After a cooldown",
      sentence: "Umbrella stakes leave after a cooldown and a window; Rails does not read either yet.",
      state: "missing",
      receipt: [],
    };
  } else {
    exit = {
      key: "exit",
      label: SIGNAL_LABELS.exit,
      word: null,
      sentence:
        v.family === "yearn-v3"
          ? "The vault page reads its idle assets (totalIdle()); the index row does not carry them yet."
          : v.family === "maple-pool"
            ? "Maple's pool read holds its cash and withdrawal queue; the index row does not carry them yet."
            : `Not measured for ${fam} yet.`,
      state: "missing",
      receipt: [],
    };
  }

  // 4. Has it lost money: lost assets, and days the share price fell.
  const recent = d ? d.price.filter((r) => r.day > d.price[d.price.length - 1].day - 90) : [];
  let falls = 0;
  let worst = 0;
  let worstDay = 0;
  for (let i = 1; i < recent.length; i++) {
    const c = recent[i].value / recent[i - 1].value - 1;
    if (c < 0) {
      falls++;
      if (c < worst) {
        worst = c;
        worstDay = recent[i].day;
      }
    }
  }
  const lost = v.lostAssets && v.lostAssets.value > 0 ? v.lostAssets.value : 0;
  const lostPart =
    v.family === "metamorpho"
      ? lost > 0
        ? `It records ${formatCompact(lost)} ${sym} of lost assets.`
        : v.lostAssets
          ? "It records no lost assets."
          : "A V1.0 vault keeps no lost-assets ledger."
      : "";
  const losses: Signal =
    recent.length < 2
      ? {
          key: "losses",
          label: SIGNAL_LABELS.losses,
          word: null,
          sentence: lostPart || `No share-price series for ${fam} yet.`,
          state: lostPart ? "partial" : "missing",
          receipt: [],
        }
      : {
          key: "losses",
          label: SIGNAL_LABELS.losses,
          word: lost > 0 || worst < -0.001 ? "Yes" : falls > 0 ? "Small dips" : "No",
          sentence:
            (falls === 0
              ? "Its share price has not fallen on any day in 90 days."
              : `Its share price fell on ${falls} of the last 90 days, the most ${pct(worst, worst > -0.0001 ? 4 : 2)} on ${dayText(worstDay)}.`) +
            (lostPart ? ` ${lostPart}` : ""),
          state: "read",
          receipt: [
            `${recent.length} daily share-price reads`,
            ...(v.family === "metamorpho" ? ["lostAssets() at the read block"] : []),
          ],
          figure: worst,
        };

  // 5. Who runs it, and what changed lately.
  const steward: Signal = v.steward
    ? {
        key: "steward",
        label: SIGNAL_LABELS.steward,
        word: null,
        sentence: `Its ${STEWARD_ROLE[v.steward.role]} is ${shortAddress(v.steward.address)}. Names wait on attestation. Changes in the last 30 days are not counted yet.`,
        state: "partial",
        receipt: [`${v.steward.role === "roleManager" ? "role_manager()" : `${v.steward.role}()`} at the read block`],
      }
    : {
        key: "steward",
        label: SIGNAL_LABELS.steward,
        word: null,
        sentence:
          v.family === "sgho" || v.family === "stata"
            ? "Aave governance, through its address book."
            : v.family === "yearn-v3"
              ? "The vault page reads its role manager; the index row does not carry it yet."
              : v.family === "umbrella-stake"
                ? "The vault page reads its owner; the index row does not carry it yet."
                : `Rails does not read a steward for ${fam}.`,
        state: v.family === "sgho" || v.family === "stata" ? "partial" : "missing",
        receipt: [],
      };

  return { size, earning, exit, losses, steward };
}

export async function findVault(chainId: number, address: string) {
  const index = await loadVaultIndex();
  const v = index.vaults.find((x) => x.chainId === chainId && x.address === address.toLowerCase());
  return v ?? null;
}

export const nameOf = (v: VaultSummary) => vaultDisplayName(v) ?? shortAddress(v.address);

export const mockHref = (v: VaultSummary) => `/mock-553/vault/${v.chainId}/${v.address}`;
