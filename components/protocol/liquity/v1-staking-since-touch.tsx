"use client";

// Liquity V1 — "Since its last touch" on an LQTY stake's timeline: the window
// from the stake's last touch to the head block, pinned in the timeline's head
// slot (decision 0022 §4), on the deposit's frame (v1-sp-since-touch.tsx).
// Token units only: the stake as the last touch left it, and the LUSD and ETH
// fees paid in since, which the next touch pays out.

import { NoteRowShell } from "@/components/shared/note-row-shell";
import type { Provenance } from "@/components/shared/provenance";
import { EventSheetView, SHEET_NO_USD, type EventSheet } from "@/components/shared/event-sheet";
import { BlockRef } from "@/components/shared/block-ref";
import { formatNumber } from "@/lib/utils/format";
import { formatDuration } from "@/lib/date";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { NATIVE } from "@/lib/shared/asset-roster";
import { exactUnits, units } from "@/lib/liquity-v1/staking-math";
import { stLiveProv } from "@/lib/liquity-v1/staking-provenance";

const ZERO = BigInt(0);
const NEXT = "Before the next touch";

const fmt = (raw: bigint) => formatNumber(units(raw < ZERO ? -raw : raw));

type Fig = { text: string; symbol: string; address: string; info: Provenance; value: string };
const fig = (raw: bigint, text: string, symbol: string, address: string, info: Provenance): Fig => ({
  text,
  symbol,
  address,
  info,
  value: exactUnits(raw),
});

export function LiquityV1StakeSinceTouchRow({
  stake,
  lusd,
  eth,
  fromBlock,
  fromAt,
  toAt,
  sinceOpen,
}: {
  /** stakes(staker). */
  stake: bigint;
  /** getPendingLUSDGain(staker). */
  lusd: bigint;
  /** getPendingETHGain(staker). */
  eth: bigint;
  fromBlock: number;
  fromAt: number;
  toAt: number;
  /** The stake's one touch is its open. */
  sinceOpen: boolean;
}) {
  const since = sinceOpen ? "Since its open" : "Since its last touch";
  const elapsed = formatDuration(fromAt, toAt);
  const sheet: EventSheet = {
    sides: [
      {
        side: "collateral",
        id: "stake",
        name: "Stake",
        tip: "A stake moves only at its touches, so it stands as the last touch left it.",
        icons: ["LQTY"],
        carry: [],
        rows: [],
        total: SHEET_NO_USD,
        after: NEXT,
        totalAmount: fig(stake, fmt(stake), "LQTY", TOKEN_ADDRESSES.LQTY, stLiveProv("stake")),
        totalTip: "The stake now: what the next touch starts from.",
      },
      {
        side: "debt",
        id: "fees",
        name: "Fees pending",
        tip: "What the next touch pays out: the stake's share of the borrowing fees in LUSD and the redemption fees in ETH paid in since its last touch.",
        icons: ["LUSD", "ETH"],
        carry: [],
        rows: [
          ...(lusd > ZERO
            ? [
                {
                  key: "lusd",
                  label: "LUSD paid in since last touch",
                  amount: fig(lusd, `+${fmt(lusd)}`, "LUSD", TOKEN_ADDRESSES.LUSD, stLiveProv("lusdGain")),
                  tip: "The stake's share of the borrowing fees paid in since its last touch.",
                },
              ]
            : []),
          ...(eth > ZERO
            ? [
                {
                  key: "eth",
                  label: "ETH paid in since last touch",
                  amount: fig(eth, `+${fmt(eth)}`, "ETH", NATIVE, stLiveProv("ethGain")),
                  tip: "The stake's share of the redemption fees paid in since its last touch.",
                },
              ]
            : []),
        ],
        total: SHEET_NO_USD,
        after: NEXT,
        untouched: "Nothing pending",
      },
    ],
    panels: [],
    note: "The next touch pays these fees out.",
  };

  return (
    <NoteRowShell
      icon="live-window"
      label={since}
      marker={{ attr: "data-live-window", value: "liquity-v1-st-since-touch" }}
      header={
        <>
          <span className="text-sm text-foreground">{since}</span>
          {/* The block is a link to the touch's block on the chain's explorer. */}
          <span className="ml-auto text-xs text-rb-500" data-prov-exempt="">
            from block <BlockRef block={fromBlock} chainId={MAINNET_CHAIN_ID} /> · {elapsed} ago
          </span>
        </>
      }
    >
      <EventSheetView sheet={sheet} breakdown data={{ "data-live-sheet": "" }} />
    </NoteRowShell>
  );
}
