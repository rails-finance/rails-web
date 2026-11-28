// Run by scripts/test/shared-links.test.mjs through tsx (the components are
// .tsx and import through `@/`): renders the shared timeline link sites
// server-side (ui-jobs 878 round 2) and prints the markup as JSON. The cases
// whose names start with `plain` render no link; the others render one, on
// chains 1, 8453 and 42161 where the chain sets the link.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OnChain, WithTxHashes } from "./shared-links.providers.tsx";
import { EventHeadContext, EventNumberPill, EventTxHashContext } from "@/components/shared/event-number-pill";
import { BlockRef } from "@/components/shared/block-ref";
import { LinkedAddress } from "@/components/shared/linked-address";
import { LinkedTx } from "@/components/shared/linked-tx";
import { ProseSentenceText } from "@/components/shared/prose-sentence-text";
import { TimelineBoundaryCard } from "@/components/shared/timeline-boundary-card";
import { TimelineCoverageFooter } from "@/components/shared/timeline-coverage-footer";
import { VaultCounterpartyLine } from "@/components/vaults/vault-timeline-row";
import { ProvReceipt } from "@/components/shared/provenance";
import { liquityV2RedeemerHref } from "@/lib/liquity-v2/redeemer-routes";
import { txCell } from "@/components/shared/event-tx-cell";
import { TX, ADDR, CHAINS } from "./shared-links.cases.mjs";

const TX_CELL_INFO = {
  kind: "chain",
  summary: "Block — the block this transaction landed in.",
  source: { block: 12345678, txHash: TX },
};
// Liquity V2's Stability Pool card on Ethereum and Polaris's on Sepolia
// (the cells captured before the shared cell, scripts/fixtures/shared-links),
// then the other chains, and CoW's Aave swap, whose block has no receipt.
const cell = (chainId, info = TX_CELL_INFO) => txCell({ txHash: TX, block: "12345678", info, chainId }).value.lines;
const txCellLines = () => ({
  txCellLiquity: cell(1),
  txCellPolaris: cell(11155111),
  "txCell-8453": cell(8453),
  "txCell-42161": cell(42161),
  txCellNoReceipt: cell(1, undefined),
});

const html = (el) => renderToStaticMarkup(el);
const on = (chainId, el) => h(OnChain, { chainId }, el);

const txHashLink = (chainId) =>
  html(
    on(
      chainId,
      h(
        WithTxHashes,
        null,
        h(
          EventHeadContext.Provider,
          { value: { chevron: null, numberColumn: () => {} } },
          h(EventTxHashContext.Provider, { value: TX }, h(EventNumberPill, { number: 7 })),
        ),
      ),
    ),
  );

const prose = (segs) => ({ sentence_id: "s", text: segs.map((s) => s.text).join(""), uses: [], segs });
const PROSE_PLAIN = prose([{ text: "The wallet repaid " }, { text: "1,200 BOLD", emph: "bold" }, { text: "." }]);
const PROSE_LINKED = prose([
  { text: "Sent by " },
  { text: "0x1234…5678", address: ADDR, tone: "wallet" },
  { text: " in " },
  { text: "0xab12…cdef", tx: TX },
  { text: ", " },
  { text: "the trade", href: "/wallet/0x1234/cow", title: "This trade on the wallet's CoW page" },
  { text: "." },
]);

const horizon = {
  arm: "base",
  omitted: null,
  total: 0,
  lowerBound: false,
  cutBlock: 12345678,
  cutAt: null,
  firstAt: null,
  byType: null,
  byAsset: null,
  state: null,
};
// A count: the small print names the block the list starts at, linked.
const counted = { ...horizon, omitted: 42, total: 100 };
const coverage = {
  fromBlock: 12000000,
  toBlock: 12345678,
  fromDeployment: false,
  deployBlock: 11000000,
  gaps: [],
  firstEventAt: null,
  source: "sweep",
  confirmation: {
    status: "disputed",
    confirmedThroughBlock: null,
    droppedCount: 1,
    dropped: [{ txHash: TX, logIndex: 4, blockNumber: 12345000 }],
  },
};
const receiptInfo = {
  kind: "chain",
  summary: "Debt — the Trove's debt after the operation.",
  contract: { name: "TroveManager", address: ADDR },
  inputs: [{ label: "Debt", value: "1200", contract: { name: "TroveManager", address: ADDR } }],
  source: { block: 12345678, txHash: TX },
};

const out = {
  plainBlockRef: html(h(BlockRef, { block: 12345678 })),
  plainBlockRefString: html(h(BlockRef, { block: "12,345,678", size: 15, numberClassName: "prov-src-block" })),
  plainProse: html(h(ProseSentenceText, { s: PROSE_PLAIN, echo: () => null })),
  plainBoundary: html(h(TimelineBoundaryCard, { boundary: horizon, protocolKey: "aave-v3", isLast: true })),
  plainReceipt: html(
    h(ProvReceipt, {
      info: { kind: "chain", summary: "Debt — the debt.", contract: { name: "Pool" } },
      value: "1",
      source: null,
    }),
  ),
};
for (const c of CHAINS) {
  out[`txHash-${c}`] = txHashLink(c);
  out[`blockRef-${c}`] = html(h(BlockRef, { block: 12345678, chainId: c, size: 12 }));
  out[`addressExplorer-${c}`] = html(on(c, h(LinkedAddress, { address: ADDR })));
  out[`tx-${c}`] = html(on(c, h(LinkedTx, { txHash: TX })));
  out[`boundary-${c}`] = html(
    on(c, h(TimelineBoundaryCard, { boundary: counted, protocolKey: "aave-v3", isLast: true })),
  );
  out[`coverage-${c}`] = html(on(c, h(TimelineCoverageFooter, { coverage, sourceLabel: "the Pool" })));
  out[`counterparty-${c}`] = html(h(VaultCounterpartyLine, { address: ADDR, chainId: c }));
  out[`receipt-${c}`] = html(on(c, h(ProvReceipt, { info: receiptInfo, value: "1200", source: null })));
}
out.addressWallet = html(h(LinkedAddress, { address: ADDR, holderOf: "liquity-v2" }));
out.addressListing = html(h(LinkedAddress, { address: ADDR, holderOf: "aave-v3" }));
out.addressRedeemer = html(h(LinkedAddress, { address: ADDR, href: liquityV2RedeemerHref(ADDR) }));
out.prose = html(h(ProseSentenceText, { s: PROSE_LINKED, echo: () => null, holderOf: "liquity-v2" }));
for (const [name, lines] of Object.entries(txCellLines())) out[name] = html(h("div", null, ...lines));
process.stdout.write(JSON.stringify(out));
