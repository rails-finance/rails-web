// Every word of the vault readout (V7) and the /start asset step (G9), in one
// place (rails-ops ui-jobs 553). Each line states a measured figure with its
// window and the reads' facts; nothing here rates, forecasts or recommends,
// and no word stands in for a verdict.
//
// Pure, with type imports only: scripts/test/vault-health.test.mjs reads it.

import type { VaultFamily } from "./families";
import type {
  ExitInput,
  Health,
  HealthKey,
  LostAssetsRead,
  NoneReason,
  StewardRole,
  WithdrawalsFigure,
} from "./health";

/** Said once in each section's explanation slot. */
export const HEALTH_DISCLAIMER =
  "Readings of the past at the blocks shown. Rails does not forecast, rate or recommend.";

export const HEALTH_TITLE = "How the vault is doing";

export const HEALTH_LABELS: Record<HealthKey, string> = {
  size: "Size",
  yield: "Yield",
  withdrawals: "Withdrawals",
  losses: "Losses",
  steward: "Steward",
};

/** The readout's explanation bullets, after the disclaimer. */
export const HEALTH_EXPLAINER = {
  readsTitle: "What it reads",
  reads: [
    "Size, yield and losses come from the vault's total assets and share price, read once a day.",
    "Withdrawals and the steward are read at this page's block.",
    "A yield is the share price's growth over the window, as a yearly rate.",
  ],
  greyed: "A grey line is one Rails does not read for this vault yet.",
  label: "explanation of these lines",
};

/** The formatters the words use, so the page's own (en-US amounts, en-GB days) print them. */
export interface HealthFormat {
  /** An amount of the asset, compact: "12.3M". */
  amount: (value: number) => string;
  /** A stored UTC day: "9 Oct 2026". */
  day: (day: number) => string;
}

export interface HealthContext {
  family: VaultFamily;
  assetSymbol: string;
  decimals: number;
  /** The page says once that stewards are shown by address (the comparison);
   *  each line then leaves it out. */
  attestationSaid?: boolean;
}

export const STEWARD_ATTESTATION = "Rails shows the address until a name for it is attested.";

/** One line as the section draws it: the label, the measured figure with its
 *  window, then one sentence. `read` false draws it muted. */
export interface HealthLine {
  key: HealthKey;
  label: string;
  /** Null where nothing is measured. */
  headline: string | null;
  /** Empty where the headline says it all. */
  sentence: string;
  read: boolean;
}

// ── Numbers ────────────────────────────────────────────────────────────────

const MINUS = "−";

/** "4.2%", to one decimal, a real minus. */
export const pctText = (x: number, digits = 1): string => {
  const t = `${Math.abs(x * 100).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
  return x < 0 && Number(t.replace("%", "")) !== 0 ? `${MINUS}${t}` : t;
};

/** "+4.2%" or "−3.2%". */
export const signedPct = (x: number, digits = 1): string => (x > 0 ? `+${pctText(x, digits)}` : pctText(x, digits));

/** A share floored to one decimal, so a part under the whole never prints as 100%. */
export const flooredPct = (x: number): string =>
  `${(Math.floor(x * 1000) / 10).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;

const rawValue = (raw: string, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;

/** "7 days", "2 days 12 hours", "6 hours". */
export function durationText(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const unit = (n: number, w: string) => `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`;
  if (days > 0 && hours > 0) return `${unit(days, "day")} ${unit(hours, "hour")}`;
  if (days > 0) return unit(days, "day");
  if (hours > 0) return unit(hours, "hour");
  return unit(Math.round(seconds / 60), "minute");
}

/** "0x1234…abcd". */
export const shortHex = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ── The steward ────────────────────────────────────────────────────────────

const ROLE_NOUN: Record<StewardRole, string> = {
  curator: "Curator",
  owner: "Owner",
  roleManager: "Role manager",
  umbrellaOwner: "Owner",
  poolDelegate: "Pool delegate",
};

const ROLE_SENTENCE: Record<StewardRole, string> = {
  curator: "The address that picks the markets the vault lends to and their caps.",
  owner: "The address that sets the vault's curator, fees and markets.",
  roleManager: "The address that hands out every role in the vault.",
  umbrellaOwner: "The one address that can slash the stake.",
  poolDelegate: "The address that runs the pool's lending: it funds and calls loans, and marks a loan as impaired.",
};

/** "Curator". */
export const stewardRole = (role: StewardRole): string => ROLE_NOUN[role];

/** "Curator 0x9e33…0585". */
export const stewardText = (role: StewardRole, address: string): string => `${ROLE_NOUN[role]} ${shortHex(address)}`;

// ── Lines nothing is read for ──────────────────────────────────────────────

const SERIES_NONE: Record<NoneReason, (f: VaultFamily) => string> = {
  family: () => "Rails keeps no daily series for Maple pools yet.",
  unanswered: () => "The daily store did not answer.",
  "no-series": () => "Rails keeps no daily series for this vault yet.",
};

const WITHDRAWALS_UNREAD: Partial<Record<VaultFamily, string>> = {
  sgho: "Rails does not read how much can be withdrawn from Savings GHO yet.",
  stata: "A withdrawal takes cash from its Aave reserve, and Rails does not read the reserve's free cash here yet.",
  "maple-pool": "Maple pools pay withdrawals through a queue, which Rails reads on the pools page only.",
};

const STEWARD_UNREAD: Partial<Record<VaultFamily, string>> = {
  sgho: "Aave's governance holds its roles, and Rails does not read them here.",
  stata: "Aave's governance holds its roles, and Rails does not read them here.",
  "maple-pool": "Rails does not read who runs a Maple pool yet.",
};

const none = (key: HealthKey, sentence: string): HealthLine => ({
  key,
  label: HEALTH_LABELS[key],
  headline: null,
  sentence,
  read: false,
});

const line = (key: HealthKey, headline: string, sentence = ""): HealthLine => ({
  key,
  label: HEALTH_LABELS[key],
  headline,
  sentence,
  read: true,
});

// ── The lines ──────────────────────────────────────────────────────────────

function lostWords(lost: LostAssetsRead | null | undefined, c: HealthContext, f: HealthFormat): string {
  if (lost === undefined) return "";
  if (lost === null) return "A V1.0 vault keeps no record of lost assets.";
  const v = rawValue(lost.raw, c.decimals);
  return v > 0 ? `Lost assets on record: ${f.amount(v)} ${c.assetSymbol}.` : "No lost assets on record.";
}

/** The vault's own exit figure: a headline, and the clause that explains it. */
function exitWords(
  e: ExitInput,
  share: number | null,
  caught: string | null,
  holder: boolean,
): { head: string; rest: string } {
  if (e.kind === "cooldown")
    return {
      head: `A cooldown of ${durationText(e.cooldownSeconds)}`,
      rest: `A withdrawal starts the cooldown, then must be made within the ${durationText(e.windowSeconds)} after it.`,
    };
  const s = share ?? 0;
  if (e.kind === "idle")
    return {
      head: `${flooredPct(s)} of the vault's assets idle at the last read`,
      rest:
        s >= 0.999
          ? "Idle assets sit in the vault, ready for a withdrawal."
          : [
              s === 0
                ? "All of them were lent to its strategies, which pay a withdrawal as far as they can free the asset."
                : "The rest was lent to its strategies, which pay a withdrawal as far as they can free the asset.",
              // The holder figure is maxWithdraw(holder), which draws on the
              // strategies through the default queue, so it can exceed idle.
              holder
                ? "This position's figure is the vault's maxWithdraw, which counts what its strategies can free through the withdrawal queue."
                : "",
            ]
              .filter(Boolean)
              .join(" "),
    };
  return {
    head: `${flooredPct(s)} of the vault's assets withdrawable at the last read`,
    rest: [caught, "The markets it lends to held that much unborrowed."].filter(Boolean).join(" "),
  };
}

function holderWords(h: { claim: string; maxWithdraw: string }, c: HealthContext, f: HealthFormat): string {
  if (BigInt(h.maxWithdraw) >= BigInt(h.claim)) return "All of this position could be withdrawn at the last read";
  if (BigInt(h.maxWithdraw) === BigInt(0)) return "None of this position could be withdrawn at the last read";
  return `${f.amount(rawValue(h.maxWithdraw, c.decimals))} of this position's ${f.amount(rawValue(h.claim, c.decimals))} ${c.assetSymbol} could be withdrawn at the last read`;
}

function withdrawalsLine(w: WithdrawalsFigure, c: HealthContext, f: HealthFormat): HealthLine {
  if (w.kind === "none")
    return none(
      "withdrawals",
      w.reason === "family" ? (WITHDRAWALS_UNREAD[c.family] ?? "The read did not answer.") : "The read did not answer.",
    );
  const holder = w.holder && BigInt(w.holder.claim) > BigInt(0) ? holderWords(w.holder, c, f) : null;
  const exit = w.exit ? exitWords(w.exit, w.share, w.caught, holder != null) : null;
  const head = w.paused ? "Withdrawals are paused" : (holder ?? exit?.head ?? "The vault is shut down");
  const rest = [
    w.shutdown && head !== "The vault is shut down" ? "The vault is shut down." : "",
    w.paused && holder ? `${holder}.` : "",
    exit && head !== exit.head ? `${exit.head[0].toUpperCase()}${exit.head.slice(1)}.` : "",
    exit?.rest ?? "",
  ];
  return line("withdrawals", head, rest.filter(Boolean).join(" "));
}

/** The five lines in drawing order. */
export function healthLines(h: Health, c: HealthContext, f: HealthFormat): HealthLine[] {
  const s = h.size;
  const size =
    s.kind === "none"
      ? none("size", SERIES_NONE[s.reason](c.family))
      : s.kind === "young"
        ? line(
            "size",
            `Series from ${f.day(s.firstDay)}`,
            "The daily total is younger than the 30 days a change needs.",
          )
        : s.change == null
          ? line(
              "size",
              `From nothing in ${s.span.to.day - s.span.from.day} days`,
              `Held ${f.amount(rawValue(s.span.to.raw, c.decimals))} ${c.assetSymbol} at the last read, nothing on ${f.day(s.span.from.day)}.`,
            )
          : line(
              "size",
              `${signedPct(s.change)} in ${s.span.to.day - s.span.from.day} days`,
              `Held ${f.amount(rawValue(s.span.to.raw, c.decimals))} ${c.assetSymbol} at the last read, ${f.amount(rawValue(s.span.from.raw, c.decimals))} on ${f.day(s.span.from.day)}.`,
            );

  const y = h.yield;
  const umbrella = c.family === "umbrella-stake" ? " Umbrella pays its rewards outside the share." : "";
  const yieldLine =
    y.kind === "none"
      ? none("yield", SERIES_NONE[y.reason](c.family))
      : y.kind === "too-small"
        ? line("yield", "Too small to measure", "Rounding moves its share price more than its earnings do.")
        : y.kind === "young"
          ? line(
              "yield",
              `Series from ${f.day(y.firstDay)}`,
              "The daily share price is younger than the 30 days a yield needs.",
            )
          : y.unmoved
            ? line(
                "yield",
                `0.0% over ${(y.y90 ?? y.y30).to.day - (y.y90 ?? y.y30).from.day} days`,
                `The share price has not moved in ${(y.y90 ?? y.y30).to.day - (y.y90 ?? y.y30).from.day} days.${umbrella}`,
              )
            : line(
                "yield",
                `${pctText(y.yearly30)} a year over the last ${y.y30.to.day - y.y30.from.day} days`,
                (y.yearly90 != null && y.y90
                  ? `${pctText(y.yearly90)} over ${y.y90.to.day - y.y90.from.day} days.`
                  : "The series is too young for a 90-day figure.") +
                  (y.low != null && y.high != null
                    ? ` Each 30 days of the last 90 earned between ${pctText(y.low)} and ${pctText(y.high)}.`
                    : "") +
                  umbrella,
              );

  const l = h.losses;
  const losses =
    l.kind === "none"
      ? none("losses", SERIES_NONE[l.reason](c.family))
      : l.kind === "lost-only"
        ? line("losses", lostWords(l.lostAssets, c, f).replace(/\.$/, ""))
        : line(
            "losses",
            l.worst == null
              ? `No share-price falls in ${l.last.day - l.first.day} days`
              : `The share price fell on ${l.falls.toLocaleString("en-US")} of the last ${l.last.day - l.first.day} days, the most ${pctText(l.worst.change, l.worst.change > -0.0001 ? 4 : 2)} on ${f.day(l.worst.to.day)}`,
            lostWords(l.lostAssets, c, f),
          );

  const st = h.steward;
  const steward =
    st.kind === "none"
      ? none(
          "steward",
          st.reason === "family"
            ? (STEWARD_UNREAD[c.family] ?? "Its controlling role did not answer.")
            : "Its controlling role did not answer.",
        )
      : line(
          "steward",
          stewardText(st.role, st.address),
          c.attestationSaid ? ROLE_SENTENCE[st.role] : `${ROLE_SENTENCE[st.role]} ${STEWARD_ATTESTATION}`,
        );

  return [size, yieldLine, withdrawalsLine(h.withdrawals, c, f), losses, steward];
}

// ── The /start asset step (G9) ─────────────────────────────────────────────

export type AssetOrder = "size" | "yield" | "range";

export const ASSET_DOOR = {
  heading: (sym: string) => `Vaults that take ${sym}`,
  orderLabel: "Order by",
  orders: {
    size: "Largest",
    yield: "Highest 30-day yield",
    range: "Narrowest 90-day yield range",
  } as Record<AssetOrder, string>,
  intro: (order: AssetOrder, shown: number, pool: number): string =>
    order === "size"
      ? `The ${shown} largest, by what each held at the last read.`
      : order === "yield"
        ? `The ${shown} with the highest 30-day yield among the ${pool} largest.`
        : `The ${shown} with the narrowest range of 30-day yields over 90 days among the ${pool} largest, counting vaults whose share price grew.`,
  hidden: (n: number) =>
    `Hiding ${n.toLocaleString("en-US")} ${n === 1 ? "vault" : "vaults"} the chain shows as illiquid or with lost assets.`,
  showing: (n: number) =>
    `Showing ${n.toLocaleString("en-US")} ${n === 1 ? "vault" : "vaults"} the chain shows as illiquid or with lost assets.`,
  showAll: "Show all",
  hide: "Hide them",
  all: (sym: string) => `Every ${sym} vault`,
  allTail: " in the full index, with every column and filter.",
  none: (sym: string) => `No vault in the index holds ${sym} at the last read.`,
  card: {
    yield: "Yield, 30 days",
    range: (low: number, high: number) => `${pctText(low)} to ${pctText(high)} over 90 days`,
    noRange: "No 90-day range",
    size: "Size",
    sizeChange: (change: number, days: number) => `${signedPct(change)} in ${days} days`,
    noChange: "No 30-day series",
    steward: "Steward",
    withdrawals: "Withdrawals",
    paused: "Paused",
    cooldown: "Cooldown",
    cooldownSub: "before a withdrawal",
    withdrawable: (share: number) => flooredPct(share),
    withdrawableSub: "withdrawable",
    notRead: "Not read here",
  },
};
