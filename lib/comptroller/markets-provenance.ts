// The Comptroller family's market receipts (rails-ops ui-jobs 549 step 3):
// Compound V2 on Ethereum and Moonwell on Ethereum and Base, one vocabulary
// over a per-family config. Every figure on the markets page (R2) and a
// market's page (R3) is a read of the Comptroller, a cToken or mToken, the
// oracle the Comptroller names, or the rate model the market names, at one
// block; or arithmetic over those reads.
//
// Classes as the ladder grades them: `state` for a contract slot at the block,
// `oracle` for the Comptroller's price and anything multiplied through it,
// and chain-derived for a ratio or sum. The contract on each receipt is the
// one the value was read from. Each builder is stamped with the coordinates'
// `readBy` (lib/shared/server-head-read.ts): "@ head" becomes the block and the
// via line names rails-server's read, live or stored.

import type { Provenance } from "@/components/shared/provenance";
import { chainMeta, explorerUrl, type ChainId } from "@/lib/shared/chains";
import { stampHeadRead, type ServerRead } from "@/lib/shared/server-head-read";
import type { ComptrollerRateModel } from "@/lib/comptroller/rate-model";

/** What the receipts need to know about a deployment. */
export interface ComptrollerVocabFamily {
  /** "Compound V2", "Moonwell". */
  name: string;
  chainId: ChainId;
  comptroller: string;
  /** The market token's noun: "cToken", "mToken". */
  token: string;
  /** The period the rates accrue over: per block (Compound V2) or per second (Moonwell). */
  period: "block" | "second";
  /** The oracle's name in the protocol's words. */
  oracleName: string;
  /** The via line's lane: "Compound V2 markets". */
  lane: string;
}

/** Where a figure was read: the block, and the contracts behind one market. */
export interface ComptrollerCoords {
  readBy?: ServerRead | null;
  blockNumber: number;
  /** The cToken or mToken. */
  market?: string;
  /** Its symbol, as the page names it ("cUSDC", "mUSDC (USDbC)"). */
  marketSymbol?: string;
  /** The underlying's symbol. */
  symbol?: string;
  oracle?: string | null;
  irm?: string | null;
  priceFeed?: string | null;
}

type Side = "supplied" | "borrowed";

const node = (f: ComptrollerVocabFamily) => `any ${chainMeta(f.chainId).name} archive node`;

const check = (f: ComptrollerVocabFamily, what: string, c: ComptrollerCoords): Provenance["verify"] => ({
  kind: "recompute",
  text: `To check: ask ${node(f)} for ${what} at block ${c.blockNumber}.`,
});

const comptroller = (f: ComptrollerVocabFamily): Provenance["contract"] => ({
  name: "Comptroller",
  address: f.comptroller,
});
const marketContract = (f: ComptrollerVocabFamily, c: ComptrollerCoords): Provenance["contract"] => ({
  name: c.marketSymbol ?? f.token,
  address: c.market,
});
const oracleContract = (f: ComptrollerVocabFamily, c: ComptrollerCoords): Provenance["contract"] => ({
  name: f.oracleName,
  address: c.oracle ?? undefined,
});
const irmContract = (c: ComptrollerCoords): Provenance["contract"] => ({
  name: `${c.symbol ?? "Market"} rate model`,
  address: c.irm ?? undefined,
});

const sym = (c: ComptrollerCoords) => c.symbol ?? "The market";
const perPeriod = (f: ComptrollerVocabFamily) => (f.period === "block" ? "PerBlock" : "PerTimestamp");
const periodsPerYear = (f: ComptrollerVocabFamily) => (f.period === "block" ? "blocksPerYear" : "timestampsPerYear");
const via = (f: ComptrollerVocabFamily, what: string) => `${f.lane} · ${what} @ head`;
const supplyRead = (f: ComptrollerVocabFamily) => `${f.token}.totalSupply × ${f.token}.exchangeRateStored`;

/** Stamp a builder with the read its coordinates carry. */
const stamped =
  <A extends unknown[]>(build: (f: ComptrollerVocabFamily, c: ComptrollerCoords, ...a: A) => Provenance) =>
  (f: ComptrollerVocabFamily, c: ComptrollerCoords, ...a: A): Provenance =>
    stampHeadRead(build(f, c, ...a), c.readBy);

// ── The roster ───────────────────────────────────────────────────────────────

export const cmRosterProv = stamped(
  (f, c): Provenance => ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: check(f, "the Comptroller's getAllMarkets()", c),
    summary: `Markets listed — the length of the Comptroller's \`getAllMarkets()\` at block ${c.blockNumber}. Governance lists a market on the Comptroller, so a new one is counted the block it is listed.`,
    contract: comptroller(f),
    via: via(f, "Comptroller.getAllMarkets()"),
  }),
);

export const cmSummaryValueProv = stamped(
  (f, c, side: Side): Provenance => ({
    kind: "chain-derived",
    pclass: "oracle",
    source: { block: c.blockNumber },
    summary: `Total ${side} — the sum over every priced market of its ${side} amount times the oracle's price, at block ${c.blockNumber}. A market the oracle prices at zero is left out of the sum.`,
    via: via(f, `Σ per-market ${side} × ${f.oracleName}.getUnderlyingPrice`),
    formula: `Σ ${side} × price`,
    inputs: [
      {
        label: `${side} amount`,
        kind: "chain",
        pclass: "state",
        note: side === "supplied" ? `${supplyRead(f)} per market` : `${f.token}.totalBorrows per market`,
      },
      { label: "price", kind: "chain-derived", pclass: "oracle", note: "getUnderlyingPrice per market" },
    ],
  }),
);

export const cmCloseFactorProv = stamped(
  (f, c): Provenance => ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: check(f, "the Comptroller's closeFactorMantissa()", c),
    summary: `Close factor — the Comptroller's \`closeFactorMantissa\` at block ${c.blockNumber}, scaled by 1e18: the share of one borrow a single liquidation may repay.`,
    contract: comptroller(f),
    via: via(f, "Comptroller.closeFactorMantissa()"),
  }),
);

export const cmLiquidationIncentiveProv = stamped(
  (f, c): Provenance => ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: check(f, "the Comptroller's liquidationIncentiveMantissa()", c),
    summary: `Liquidation incentive — the Comptroller's \`liquidationIncentiveMantissa\` at block ${c.blockNumber}, scaled by 1e18: a liquidator takes collateral worth this multiple of what it repays.`,
    contract: comptroller(f),
    via: via(f, "Comptroller.liquidationIncentiveMantissa()"),
  }),
);

// ── One market ───────────────────────────────────────────────────────────────

/** The asset cell's receipt: which cToken or mToken the row is, and its token. */
export const cmIdentityProv = stamped((f, c, underlying: string | null, note: string | null): Provenance => {
  const explorer = chainMeta(f.chainId).explorerName;
  return {
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: c.market
      ? {
          kind: "etherscan",
          href: explorerUrl(f.chainId, "address", c.market),
          text: `${c.marketSymbol ?? f.token} on ${explorer}`,
        }
      : undefined,
    summary: `${sym(c)} market — the ${f.token} ${c.marketSymbol ?? ""} at ${c.market ?? "its address"}, listed by the Comptroller's \`getAllMarkets()\`. ${underlying ? `Its \`underlying()\` is ${underlying}.` : "It holds the chain's native coin, so it has no underlying token."}${note ? ` ${note}.` : ""}`,
    contract: marketContract(f, c),
    via: via(f, `Comptroller.getAllMarkets() · ${f.token}.underlying()`),
    inputs: [
      {
        label: f.token,
        value: c.market,
        kind: "chain",
        pclass: "state",
        contract: marketContract(f, c),
      },
      ...(underlying
        ? [
            {
              label: "underlying",
              value: underlying,
              kind: "chain" as const,
              pclass: "state" as const,
              contract: { name: sym(c), address: underlying },
              verify: {
                kind: "etherscan" as const,
                href: explorerUrl(f.chainId, "address", underlying),
                text: `${sym(c)} on ${explorer}`,
              },
            },
          ]
        : []),
    ],
  };
});

/** Supplied or borrowed in the underlying token. */
export const cmAmountProv = stamped((f, c, side: Side): Provenance => {
  if (side === "borrowed")
    return {
      kind: "chain",
      pclass: "state",
      source: { block: c.blockNumber },
      verify: check(f, `the ${f.token}'s totalBorrows()`, c),
      summary: `${sym(c)} borrowed — the ${f.token}'s \`totalBorrows\` at block ${c.blockNumber}, scaled by the token's decimals. Interest accrues into this slot each time the market is touched.`,
      contract: marketContract(f, c),
      via: via(f, `${f.token}.totalBorrows`),
    };
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: `${sym(c)} supplied — the ${f.token}'s \`totalSupply\` times \`exchangeRateStored\` at block ${c.blockNumber}, divided by 1e18 and scaled by the token's decimals. The exchange rate grows as borrowers pay interest, so this is what the suppliers' ${f.token}s redeem for.`,
    contract: marketContract(f, c),
    via: via(f, supplyRead(f)),
    formula: `${f.token} supply × exchange rate`,
    inputs: [
      { label: `${f.token} supply`, kind: "chain", pclass: "state", note: `${f.token}.totalSupply` },
      { label: "exchange rate", kind: "chain", pclass: "state", note: `${f.token}.exchangeRateStored` },
    ],
  };
});

/** Supplied or borrowed in USD at the oracle's price. */
export const cmValueProv = stamped(
  (f, c, side: Side): Provenance => ({
    kind: "chain-derived",
    pclass: "oracle",
    source: { block: c.blockNumber },
    summary: `${sym(c)} ${side} in USD — the ${side} amount times the price the Comptroller's oracle gives at block ${c.blockNumber}, the price its liquidations use.`,
    contract: oracleContract(f, c),
    via: via(f, `${side === "supplied" ? supplyRead(f) : `${f.token}.totalBorrows`} × getUnderlyingPrice`),
    formula: `${side} × price`,
    inputs: [
      {
        label: `${side} amount`,
        kind: "chain",
        pclass: "state",
        note: side === "supplied" ? supplyRead(f) : `${f.token}.totalBorrows`,
        contract: marketContract(f, c),
      },
      {
        label: "price",
        kind: "chain-derived",
        pclass: "oracle",
        note: `${f.oracleName}.getUnderlyingPrice(${f.token})`,
        contract: oracleContract(f, c),
      },
    ],
  }),
);

/** Available: the cash the market holds, which suppliers can withdraw and borrowers draw. */
export const cmAvailableProv = stamped(
  (f, c, priced: boolean): Provenance => ({
    kind: priced ? "chain-derived" : "chain",
    pclass: priced ? "oracle" : "state",
    source: { block: c.blockNumber },
    verify: priced ? undefined : check(f, `the ${f.token}'s getCash()`, c),
    summary: `${sym(c)} available — the ${f.token}'s \`getCash()\` at block ${c.blockNumber}: the underlying it holds now, which is what can be withdrawn or borrowed.${priced ? " In USD at the oracle's price." : ""}`,
    contract: marketContract(f, c),
    via: via(f, `${f.token}.getCash()${priced ? " × getUnderlyingPrice" : ""}`),
    ...(priced
      ? {
          formula: "cash × price",
          inputs: [
            { label: "cash", kind: "chain" as const, pclass: "state" as const, note: `${f.token}.getCash()` },
            {
              label: "price",
              kind: "chain-derived" as const,
              pclass: "oracle" as const,
              note: `${f.oracleName}.getUnderlyingPrice(${f.token})`,
            },
          ],
        }
      : {}),
  }),
);

/** Utilisation as the rate model computes it. */
export const cmUtilisationProv = stamped(
  (f, c, model: Pick<ComptrollerRateModel, "reservesInUtil">): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: `${sym(c)} utilisation — ${model.reservesInUtil ? "borrows ÷ (cash + borrows − reserves)" : "borrows ÷ (cash + borrows)"} at block ${c.blockNumber}, the quotient the market's rate model prices the borrow rate from.`,
    contract: marketContract(f, c),
    via: via(f, `${f.token}.totalBorrows, getCash${model.reservesInUtil ? ", totalReserves" : ""}`),
    formula: model.reservesInUtil ? "borrows ÷ (cash + borrows − reserves)" : "borrows ÷ (cash + borrows)",
    inputs: [
      { label: "borrows", kind: "chain", pclass: "state", note: `${f.token}.totalBorrows` },
      { label: "cash", kind: "chain", pclass: "state", note: `${f.token}.getCash()` },
      ...(model.reservesInUtil
        ? [{ label: "reserves", kind: "chain" as const, pclass: "state" as const, note: `${f.token}.totalReserves` }]
        : []),
    ],
  }),
);

/** A rate a year: the market's per-period rate times the model's periods a year. */
export const cmRateProv = stamped((f, c, side: "supply" | "borrow"): Provenance => {
  const method = `${side}Rate${perPeriod(f)}`;
  return {
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: `${sym(c)} ${side} rate — the ${f.token}'s \`${method}\` times the rate model's \`${periodsPerYear(f)}\` at block ${c.blockNumber}, as a simple APR. ${f.name} accrues interest per ${f.period}.`,
    contract: marketContract(f, c),
    via: via(f, `${f.token}.${method} × model.${periodsPerYear(f)}`),
    formula: `rate per ${f.period} × ${f.period}s a year`,
    inputs: [
      {
        label: `rate per ${f.period}`,
        kind: "chain",
        pclass: "state",
        note: `${f.token}.${method}`,
        contract: marketContract(f, c),
      },
      {
        label: `${f.period}s a year`,
        kind: "chain",
        pclass: "state",
        note: `model.${periodsPerYear(f)}`,
        contract: irmContract(c),
      },
    ],
  };
});

/** The oracle's price for one whole underlying token. */
export const cmPriceProv = stamped(
  (f, c, hasFeed: boolean): Provenance => ({
    kind: "chain-derived",
    pclass: "oracle",
    source: { block: c.blockNumber },
    verify: check(f, `the oracle's getUnderlyingPrice(${c.market ?? f.token})`, c),
    summary: hasFeed
      ? `${sym(c)} price — the oracle's \`getUnderlyingPrice\` at block ${c.blockNumber}, scaled by 1e(36 − decimals): the price the Comptroller values and liquidates this market at.${c.priceFeed ? ` The oracle reads it from the feed at ${c.priceFeed}.` : ""}`
      : `${sym(c)} fixed price — the oracle's \`getUnderlyingPrice\` at block ${c.blockNumber}. The oracle's \`getConfig\` names no feed for this market, so the price is a number governance stored, and it changes only when governance sets another.`,
    contract: oracleContract(f, c),
    via: via(f, `${f.oracleName}.getUnderlyingPrice${hasFeed ? "" : " · getConfig"}`),
    ...(c.priceFeed
      ? {
          inputs: [
            {
              label: "price feed",
              value: c.priceFeed,
              kind: "chain" as const,
              pclass: "oracle" as const,
              note: "the feed the oracle reads for this market",
            },
          ],
        }
      : {}),
  }),
);

export const cmCollateralFactorProv = stamped(
  (f, c): Provenance => ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: check(f, `the Comptroller's markets(${c.market ?? f.token})`, c),
    summary: `${sym(c)} collateral factor — the \`collateralFactorMantissa\` in the Comptroller's \`markets(${f.token})\` record at block ${c.blockNumber}, scaled by 1e18: the share of a supply's value that counts toward borrowing. At zero the market backs no borrowing.`,
    contract: comptroller(f),
    via: via(f, `Comptroller.markets(${f.token}).collateralFactorMantissa`),
  }),
);

export const cmReserveFactorProv = stamped(
  (f, c): Provenance => ({
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: check(f, `the ${f.token}'s reserveFactorMantissa()`, c),
    summary: `${sym(c)} reserve factor — the ${f.token}'s \`reserveFactorMantissa\` at block ${c.blockNumber}, scaled by 1e18: the share of borrowers' interest the market keeps as reserves. Suppliers earn the rest.`,
    contract: marketContract(f, c),
    via: via(f, `${f.token}.reserveFactorMantissa`),
  }),
);

/** A cap's state: its amount, closed at one base unit, uncapped at zero. */
export const cmCapProv = stamped(
  (
    f,
    c,
    side: "supply" | "borrow",
    state: "used" | "closed" | "none",
    detail?: { amount: number; cap: number },
  ): Provenance => {
    const method = side === "supply" ? "supplyCaps" : "borrowCaps";
    const head =
      state === "closed"
        ? `${sym(c)} ${side} cap closed — the Comptroller's \`${method}(${f.token})\` at block ${c.blockNumber} is one base unit of the token. A cap of zero means no cap, so governance closes a market by setting the smallest amount above it.`
        : state === "none"
          ? `${sym(c)} has no ${side} cap — the Comptroller's \`${method}(${f.token})\` at block ${c.blockNumber} is zero, which ${f.name} reads as no cap.`
          : `${sym(c)} ${side} cap used — the market's ${side === "supply" ? "supplied" : "borrowed"} amount, ${detail?.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}, divided by the Comptroller's \`${method}(${f.token})\`, ${detail?.cap.toLocaleString("en-US", { maximumFractionDigits: 2 })}, at block ${c.blockNumber}. At the cap a new ${side} is refused.`;
    return {
      kind: state === "used" ? "chain-derived" : "chain",
      pclass: "state",
      source: { block: c.blockNumber },
      verify: check(f, `the Comptroller's ${method}(${c.market ?? f.token})`, c),
      summary: head,
      contract: comptroller(f),
      via: via(f, `Comptroller.${method}(${f.token})`),
    };
  },
);

/** The pause guardian's flag on supplying or borrowing. */
export const cmPauseProv = stamped((f, c, side: "supply" | "borrow", paused: boolean): Provenance => {
  const method = side === "supply" ? "mintGuardianPaused" : "borrowGuardianPaused";
  const verb = side === "supply" ? "supplying" : "borrowing";
  return {
    kind: "chain",
    pclass: "state",
    source: { block: c.blockNumber },
    verify: check(f, `the Comptroller's ${method}(${c.market ?? f.token})`, c),
    summary: paused
      ? `${sym(c)} ${verb} paused — the Comptroller's \`${method}(${f.token})\` is true at block ${c.blockNumber}. New ${verb} is refused; repaying, withdrawing and liquidating still run.`
      : `${sym(c)} ${verb} open — the Comptroller's \`${method}(${f.token})\` is false at block ${c.blockNumber}.`,
    contract: comptroller(f),
    via: via(f, `Comptroller.${method}(${f.token})`),
  };
});

/** One term of the market's rate model, as a year. */
export const cmRateTermProv = stamped(
  (f, c, term: "base" | "multiplier" | "kink" | "jump", whitePaper: boolean): Provenance => {
    const method =
      term === "kink"
        ? "kink"
        : whitePaper
          ? term === "base"
            ? "baseRate"
            : "multiplier"
          : `${term === "jump" ? "jumpMultiplier" : term === "base" ? "baseRate" : "multiplier"}${perPeriod(f)}`;
    const name = { base: "base rate", multiplier: "multiplier", kink: "kink", jump: "jump multiplier" }[term];
    const meaning = {
      base: "the borrow rate at zero utilisation",
      multiplier: "how fast the borrow rate climbs with utilisation below the kink",
      kink: "the utilisation where the borrow rate turns steeper",
      jump: "how fast the borrow rate climbs with utilisation above the kink",
    }[term];
    const scale =
      term === "kink" || whitePaper
        ? "scaled by 1e18"
        : `scaled by 1e18 and multiplied by the model's \`${periodsPerYear(f)}\``;
    return {
      kind: term === "kink" || whitePaper ? "chain" : "chain-derived",
      pclass: "state",
      source: { block: c.blockNumber },
      verify: check(f, `the rate model's ${method}()`, c),
      summary: `${sym(c)} ${name} — the rate model's \`${method}\` at block ${c.blockNumber}, ${scale}: ${meaning}.`,
      contract: irmContract(c),
      via: via(f, `${f.token}.interestRateModel → model.${method}`),
    };
  },
);

/** The curve's receipt: the model's terms and the formula. */
export const cmCurveProv = stamped(
  (f, c, model: ComptrollerRateModel): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    source: { block: c.blockNumber },
    summary: `${sym(c)} rate curve — the borrow rate the market's rate model gives at each utilisation, from its terms at block ${c.blockNumber}. ${model.shape === "jump" ? "Below the kink the rate is base + multiplier × utilisation; above it the jump multiplier adds to it for the utilisation past the kink." : "The rate is base + multiplier × utilisation, climbing evenly."} The supply rate is the borrow rate times utilisation, less the reserve factor.`,
    contract: irmContract(c),
    via: via(f, `${f.token}.interestRateModel → model terms`),
    formula:
      model.shape === "jump" ? "base + multiplier × min(U, kink) + jump × max(0, U − kink)" : "base + multiplier × U",
  }),
);
