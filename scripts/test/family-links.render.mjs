// Run by scripts/test/family-links.test.mjs through tsx (the components are
// .tsx and import through `@/`): renders the links each family builds for
// itself (ui-jobs 878 round 3) server-side and prints the markup as JSON. A
// case whose name starts with `plain` or `exempt` renders a form that
// LinkedValue leaves alone; the others render a linked value.
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OnChain, OnEventPage } from "./family-links.providers.tsx";
import { ProseSentenceText } from "@/components/protocol/liquity/event-prose-render";
import { LiquityV2RedemptionCard } from "@/components/protocol/liquity/redeemer-event-card";
import { TroveName } from "@/components/protocol/liquity/sp-tx-troves";
import { CooldownEventLink } from "@/components/protocol/liquity-family/rate-cooldown-row";
import { PendleEventCard } from "@/components/protocol/pendle/pendle-event-card";
import { CowSettlementPanel } from "@/components/protocol/cow/cow-settlement-panel";
import { CowAaveSwapCard } from "@/components/protocol/cow/cow-aave-swap-card";
import { CowTradeCard } from "@/components/protocol/cow/cow-trade-card";
import { PlaceLine } from "@/components/protocol/polaris/polaris-peth-event-card";
import { OtherAccount } from "@/lib/dolomite/explainer-clauses";
import { OtherAccountLink } from "@/components/protocol/dolomite/dolomite-event-detail";
import { ADDR, OWNER, TX, TROVE } from "./family-links.cases.mjs";

const html = (el) => renderToStaticMarkup(el);
const page = (el) => html(h(OnEventPage, null, el));
const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));

const out = {};

// ── Liquity V2: the prose words ─────────────────────────────────────────────
const coords = { txHash: TX, blockNumber: 21000000 };
const prose = (segs) => ({ sentence_id: "s", text: segs.map((s) => s.text).join(""), uses: [], segs });
const sentence = (segs, ctx = {}) =>
  html(h(ProseSentenceText, { s: prose(segs), ctx: { operation: "redeemCollateral", ...ctx }, coords, eventId: "e7" }));
out.plainLiquityProse = sentence([
  { text: "The Trove's debt fell by " },
  { text: "1,200 BOLD", emph: "bold" },
  { text: ", to " },
  { text: "", pair: { cr: "180%", ltv: "55.6%" } },
  { text: "." },
]);
// The redeemer not yet known: the plain words.
out.plainRedeemerWord = sentence([{ text: "A " }, { text: "redeemer", name: "redeemer" }, { text: " took debt." }]);
out.redeemerWord = sentence([{ text: "A " }, { text: "redeemer", name: "redeemer" }, { text: " took debt." }], {
  redeemer: ADDR,
});
out.managerWord = sentence([{ text: "Rate set by " }, { text: "Summerstone", address: ADDR, tone: "manager" }]);
out.walletWord = sentence([{ text: "Owned by " }, { text: "0x1234…5678", address: ADDR, tone: "wallet" }]);

// ── Liquity V2: a redeemer's row, closed (T1) and open (T2) ─────────────────
const REDEMPTION = {
  collateral_type: "WETH",
  trove_id: TROVE,
  bold_raw: "1200000000000000000000",
  coll_raw: "400000000000000000",
  rate_raw: "36000000000000000",
  block_number: "21000000",
  block_timestamp: "1730000000",
  transaction_hash: TX,
  transaction_index: 3,
  log_index: 7,
  contract_address: "0x7bcb64b2c9206a5b699ed43363f6f98d4776cf5a",
};
const redemption = h(LiquityV2RedemptionCard, { row: REDEMPTION, isLast: true, eventNumber: 1 });
out.redemptionRow = html(redemption);
out.redemptionPage = page(redemption);

// ── Liquity V2: a deposit's "In this transaction" Trove ─────────────────────
const txTrove = {
  collateralType: "wstETH",
  troveId: TROVE,
  ops: [{ operation: "redeemCollateral", operation_enum: 6, log_index: 693 }],
  verbs: "redeemed",
};
out.spTxTrove = html(h(TroveName, { t: txTrove, txHash: TX }));

// ── Liquity V2: the rate-change cooldown's event link ───────────────────────
const clock = (start, id) => ({
  row: { id, op: "x", timestamp: 1730000000, blockNumber: 21000000, txHash: TX },
  start,
  endsAt: 1730604800,
});
const POSITION = `/ethereum/liquity-v2/trove/WETH/${TROVE}`;
for (const start of ["open", "open-batch", "rate", "join", "leave", "batch-rate"])
  out[`cooldown-${start}`] = html(
    h(CooldownEventLink, { clock: clock(start, `${TX}_${start}`), positionPath: POSITION }),
  );

// ── Pendle: a market page's router event ────────────────────────────────────
const tok = (address, symbol, decimals = 18) => ({ address, symbol, decimals });
const MARKET = "0x6d98a2b6cdbf44939362a3e99793339ba2016af4";
const tokens = {
  market: tok(MARKET, "PENDLE-LPT"),
  sy: tok("0x1111111111111111111111111111111111111111", "SY-sUSDe"),
  pt: tok("0x2222222222222222222222222222222222222222", "PT-sUSDe"),
  yt: tok("0x3333333333333333333333333333333333333333", "YT-sUSDe"),
  yieldToken: tok("0x4444444444444444444444444444444444444444", "sUSDe"),
  asset: { ...tok("0x5555555555555555555555555555555555555555", "USDe"), type: 0, syDecimals: 18 },
  expiry: 1767225600,
};
const pendleRow = {
  block: 21000000,
  timestamp: 1730000000,
  txHash: TX,
  txIndex: 3,
  logIndex: 7,
  router: "v4",
  event: "SwapPtAndToken",
  kind: "buy_pt",
  role: "receiver",
  market: MARKET,
  legs: [
    { leg: "pt", token: tokens.pt.address, amount: "1000000000000000000000" },
    { leg: "token", token: tokens.asset.address, amount: "-990000000000000000000" },
  ],
  syEquivalent: null,
  syToAsset: null,
  asset: null,
  impliedApy: null,
  partial: false,
};
const pendle = (side) =>
  h(PendleEventCard, {
    row: pendleRow,
    tokens,
    meta: {},
    side,
    isLast: true,
    eventNumber: 1,
    parties: side === "market" ? { caller: ADDR, receiver: OWNER } : undefined,
  });
out.pendleMarketRow = html(pendle("market"));
out.pendlePage = page(pendle("wallet"));
// A wallet page's row names no wallet.
out.plainPendleWalletRow = html(pendle("wallet"));

// ── CoW: the settlement panel's other owners ────────────────────────────────
const settlement = json(
  "../fixtures/cow-settlement/0x1fc438bb77a22c1d9200f55d52730975812364127ace1e9906af02553c8ac793.json",
);
const self = settlement.trades.find((t) => t.owner.startsWith("0x854dea"));
const label = (address) => ({
  address,
  symbol: settlement.tokens?.[address]?.symbol ?? null,
  decimals: settlement.tokens?.[address]?.decimals ?? null,
});
const cowTrade = (over = {}) => ({
  id: `${settlement.txHash}:${self.logIndex}`,
  blockNumber: settlement.blockNumber,
  timestamp: settlement.timestamp ?? 0,
  txHash: settlement.txHash,
  logIndex: self.logIndex,
  txFrom: settlement.txFrom ?? "0x",
  owner: self.owner,
  sellToken: self.sellToken,
  buyToken: self.buyToken,
  sellAmount: self.sellAmount,
  buyAmount: self.buyAmount,
  feeAmount: self.feeAmount,
  orderUid: self.orderUid,
  validTo: null,
  settlementTrades: settlement.trades.length,
  ...over,
});
out.cowSettlement = html(
  h(CowSettlementPanel, {
    settlement,
    trade: cowTrade(),
    sell: label(self.sellToken),
    buy: label(self.buyToken),
  }),
);

// ── CoW: an Aave position swap, and a trade that was one ────────────────────
const SWAP = {
  swapKey: `${TX}:7`,
  txHash: TX,
  logIndex: 7,
  block: 21000000,
  timestamp: 1730000000,
  wallet: OWNER,
  market: "core",
  kind: "collateral_swap",
  route: "cow",
  given: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  received: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
  trade: null,
};
const LABELS = {
  [SWAP.given]: { symbol: "WETH", decimals: 18 },
  [SWAP.received]: { symbol: "wstETH", decimals: 18 },
};
for (const family of ["aave-v3", "aave-v4"])
  out[`cowAaveSwap-${family}`] = page(
    h(CowAaveSwapCard, {
      family,
      swap: { ...SWAP, market: family === "aave-v3" ? "core" : "main" },
      labels: LABELS,
      isLast: true,
    }),
  );
const aave = { family: "aave-v3", kind: "collateral_swap", wallet: OWNER, market: "core", swapKey: SWAP.swapKey };
out.cowTradeAave = page(
  h(CowTradeCard, {
    trade: cowTrade({ aave }),
    sell: label(self.sellToken),
    buy: label(self.buyToken),
    isLast: true,
  }),
);

// ── Polaris: the pETH row's place line ──────────────────────────────────────
const pethRows = (file) => {
  const rows = [];
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      if (o.place && o.kind && o.lines) rows.push(o);
      Object.values(o).forEach(walk);
    }
  };
  walk(json(`../fixtures/polaris-peth/${file}`));
  return rows;
};
const pethRow = (file, kind) => pethRows(file).find((r) => r.place.kind === kind);
const sepolia = (el) => html(h(OnChain, { chainId: 11155111 }, el));
out.placeSvpeth = sepolia(h(PlaceLine, { row: pethRow("map-c513.json", "svpeth") }));
out.placeVenue = sepolia(h(PlaceLine, { row: pethRow("map-c513.json", "venue") }));
out.exemptPlaceCdp = sepolia(h(PlaceLine, { row: pethRow("map-38d7.json", "cdp") }));
out.exemptPlaceLoan = sepolia(h(PlaceLine, { row: pethRow("map-38d7.json", "loan") }));

// ── Dolomite: a transfer's other account ────────────────────────────────────
out.plainDolomiteSameWallet = html(
  h(OtherAccount, { ctx: { counterparty: OWNER, counterpartyAccountNumber: "1" }, owner: OWNER }),
);
out.plainDolomiteNoAddress = html(h(OtherAccount, { ctx: { counterparty: null, counterpartyAccountNumber: null } }));
out.dolomiteOtherWallet = html(
  h(OtherAccount, { ctx: { counterparty: ADDR, counterpartyAccountNumber: "1" }, owner: OWNER }),
);
out.dolomiteOtherUnnumbered = html(h(OtherAccount, { ctx: { counterparty: ADDR, counterpartyAccountNumber: null } }));
out.dolomiteAccountLink = html(h(OtherAccountLink, { other: { owner: ADDR, number: "0" } }));

process.stdout.write(JSON.stringify(out, null, 1));
