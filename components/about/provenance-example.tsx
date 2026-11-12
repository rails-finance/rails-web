"use client";

import { ReceiptCard } from "@/components/shared/prov-inspector";
import type { Provenance, ProvSource } from "@/components/shared/provenance";
import { EXAMPLE } from "@/lib/about/provenance-example";

/**
 * /about/provenance's worked example (ui-jobs 603): the receipt the inspector
 * pinned on 12 Nov 2026 for one Liquity V2 event's "Collateral (WETH) held by
 * the trove after this event", fixed here as data and drawn by the inspector's
 * own ReceiptCard. The info is what `collAfterProv`
 * (components/protocol/liquity/liquity-cells.tsx) built for that event: WETH
 * trove 10224…0154, block 25,258,660, tx 0x2a44…58d4. No read happens on the
 * page; the page's text walks this receipt, so a change here changes the text.
 */

const INFO: Provenance = {
  kind: "chain",
  pclass: "emitted",
  verify: {
    kind: "etherscan",
    href: `https://etherscan.io/tx/${EXAMPLE.txHash}#eventlog`,
    text: "Confirm in the tx event logs",
  },
  summary:
    "Collateral (WETH) held by the trove after this event. Every time a trove changes, the TroveManager contract writes the trove's full WETH balance into its log. This is that balance as it stood after this event.",
  contract: { name: "TroveManager", address: EXAMPLE.troveManager },
  via: `rails-server index of decoded Liquity V2 logs · TroveUpdated log · _coll: ${EXAMPLE.raw} · ÷10^18`,
  scaling: { raw: EXAMPLE.raw, places: 18, why: "WETH amounts have 18 decimal places" },
  inputs: [
    { label: "asset", value: "WETH", kind: "chain" },
    { label: "block", value: String(EXAMPLE.block), kind: "chain", note: "event block" },
    { label: "tx", value: EXAMPLE.txHash, kind: "chain", note: "indexed log" },
  ],
};

const SOURCE: ProvSource = { block: EXAMPLE.block, txHash: EXAMPLE.txHash };

/** The example receipt, in the popover's frame, standing in the page's flow. */
export function ProvenanceExample() {
  return (
    <figure
      className="prov-inspect-pop prov-inspect-sample"
      aria-label="Example receipt: collateral held by a Liquity V2 trove after one event"
      data-about-receipt=""
    >
      <ReceiptCard
        entry={{ info: INFO, value: EXAMPLE.display, display: EXAMPLE.display, symbol: null, source: SOURCE }}
      />
    </figure>
  );
}
