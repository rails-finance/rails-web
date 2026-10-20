// A vault row's T2 as a balance sheet (rails-ops TO-DO-ui-jobs 330): the
// card's `sheet` slot, from the figures vault-timeline-row.tsx states, for every
// vault family (Yearn, the Aave vaults, MetaMorpho on Base).
//
// A holder's position in a vault has no collateral and no debt, so the one side
// is the vault shares and carries that name; there is no Risk or Limits panel.
// The page prices nothing in dollars (the row header's rule 2), so no row has a
// dollar column: the claim reads in the vault's asset, the shares valued at the
// share price the vault stated at the row's block.
//
// The side: "Last event" (the claim the previous row left, at the share price
// of that row's block), the interest since it (the shares held between the two
// rows times the share price's growth), "Before this event" (the shares held
// just before, at this row's price), the shares the row moved and the asset
// leg the vault stated, and the claim after. The breakdown adds the shares held
// after, the share price, and any row a family contributes (MetaMorpho's share
// of the vault). A row with no previous event in the list, or a price that was
// not read, leaves out the rows that need it.

import { SHEET_NO_USD, SHEET_WORDS, type EventSheet, type SheetRow } from "@/components/shared/event-sheet";
import type { Provenance } from "@/components/shared/provenance";
import { assetText, sharePriceText, shareText } from "@/lib/shared/vault-amount-text";
import type { VaultHolderEvent, VaultTimelineCoords } from "@/lib/shared/vault-holder-timeline";
import type { VaultTimelineProvKit } from "@/components/vaults/vault-timeline-row";

const WORDS = {
  side: "Vault shares",
  unread: "Not read on this page",
  reverted: "Reverted",
  received: "Shares received",
  redeemed: "Shares redeemed",
  sent: "Shares sent",
  deposited: "Deposited",
  withdrawn: "Withdrawn",
  held: "Shares held after this event",
  heldThen: "Shares held then",
  price: "Share price at this block",
};

/** Each row's read-more: what the figure is and where it is read. */
const TIPS = {
  last: "What the shares held after the previous event were worth in the vault's asset at the share price of that event's block.",
  lastShares: "The shares held once the previous event had run, replayed from this address's transfers.",
  interest:
    "What the share price's rise between the previous event's block and this one added to the shares held in between, in the vault's asset.",
  interestUnread:
    "The share price was not read at one of the two blocks, so the interest between them cannot be stated.",
  before:
    "The shares held just before this event, valued in the vault's asset at the share price of this event's block.",
  beforeShares: "The shares held just before this event, replayed from this address's transfers.",
  received: "The shares this event added to the balance, from the Transfer log.",
  redeemed: "The shares this event took out of the balance, from the Transfer log.",
  sent: "The shares this transfer sent to another address, from the Transfer log.",
  deposited: "The asset the vault stated for this deposit, from the ERC-4626 Deposit event of the same transaction.",
  withdrawn:
    "The asset the vault stated for this withdrawal, from the ERC-4626 Withdraw event of the same transaction.",
  held: "The shares held once this event had run, replayed from this address's transfers.",
  price: "What the vault's convertToAssets answers for one whole share at this event's block.",
  total: "The shares held after this event, valued in the vault's asset at the share price of this event's block.",
  totalShares:
    "The shares held after this event. The share price was not read at this block, so no asset value is stated.",
};

export interface VaultSheetArgs {
  event: VaultHolderEvent;
  /** The row before this one in time, where the list holds it. */
  earlier?: VaultHolderEvent | null;
  /** This row's coordinates (its block and transaction). */
  coords: VaultTimelineCoords;
  shareUnit: string;
  assetSymbol: string;
  vaultAddress: string;
  prov: VaultTimelineProvKit;
  /** Rows a family adds to the breakdown. */
  extraRows?: SheetRow[];
}

const pow10 = (n: number): bigint => BigInt(10) ** BigInt(n);
const ZERO = BigInt(0);
const num = (r: bigint, decimals: number): { raw: string; value: number } => ({
  raw: r.toString(),
  value: Number(r) / Math.pow(10, decimals),
});
const withSign = (r: bigint, text: (abs: bigint) => string, plus = false): string =>
  r < ZERO ? `−${text(-r)}` : plus && r > ZERO ? `+${text(r)}` : text(r);

/** The claim the shares are worth at a share price, in the asset's raw units. */
const valueOf = (shares: bigint, price: bigint, shareDecimals: number): bigint =>
  (shares * price) / pow10(shareDecimals);

export function vaultSheet({
  event,
  earlier,
  coords,
  shareUnit,
  assetSymbol,
  vaultAddress,
  prov,
  extraRows = [],
}: VaultSheetArgs): EventSheet | undefined {
  const sd = event.shareDecimals;
  const ad = event.assetDecimals;
  const sharesText = (r: bigint, plus = false) => withSign(r, (a) => shareText(num(a, sd), sd), plus);
  const assetsText = (r: bigint, plus = false) => withSign(r, (a) => assetText(num(a, ad), ad), plus);
  const shares = (text: string, info: Provenance, raw: string): NonNullable<SheetRow["amount"]> => ({
    text,
    symbol: shareUnit,
    address: vaultAddress,
    info,
    value: raw,
  });
  const asset = (text: string, info?: Provenance): NonNullable<SheetRow["amount"]> => ({
    text,
    symbol: assetSymbol,
    info,
  });

  const after = BigInt(event.balanceAfter);
  const moved = BigInt(event.sharesDelta);
  const beforeBal = after - moved;
  const priceNow = event.sharePriceAtBlock != null ? BigInt(event.sharePriceAtBlock) : null;
  const priceThen = earlier?.sharePriceAtBlock != null ? BigInt(earlier.sharePriceAtBlock) : null;
  const earlierCoords: VaultTimelineCoords | undefined = earlier
    ? { ...coords, blockNumber: earlier.blockNumber, txHash: earlier.txHash }
    : undefined;

  const derived = (summary: string, formula: string, inputs: Provenance["inputs"]): Provenance => ({
    kind: "chain-derived",
    pclass: "state",
    source: { block: event.blockNumber, txHash: event.txHash },
    summary,
    via: `${formula}, each input read on chain`,
    formula,
    inputs,
  });
  const priceInput = (e: VaultHolderEvent, label: string) => ({
    label,
    value: e.sharePriceAtBlock ?? undefined,
    kind: "chain" as const,
    pclass: "state" as const,
  });
  const heldInput = (label: string, v: bigint) => ({
    label,
    value: v.toString(),
    kind: "chain-derived" as const,
    pclass: "emitted" as const,
  });

  // ---- the event's rows
  const rows: SheetRow[] = [];
  if (event.kind !== "cooldown" && event.kind !== "transfer-self" && moved !== ZERO) {
    const label = event.kind === "transfer-out" ? WORDS.sent : moved < ZERO ? WORDS.redeemed : WORDS.received;
    rows.push({
      key: "shares",
      label,
      amount: shares(sharesText(moved, true), prov.shares(coords, event.kind), event.sharesDelta),
      tip: event.kind === "transfer-out" ? TIPS.sent : moved < ZERO ? TIPS.redeemed : TIPS.received,
    });
  }
  if (event.assets && (event.kind === "deposit" || event.kind === "withdrawal")) {
    const isDeposit = event.kind === "deposit";
    const a = BigInt(event.assets);
    rows.push({
      key: "assets",
      label: isDeposit ? WORDS.deposited : WORDS.withdrawn,
      amount: {
        ...asset(assetsText(isDeposit ? a : -a, true), prov.assets(coords, isDeposit ? "deposit" : "withdrawal")),
        value: event.assets,
      },
      tip: isDeposit ? TIPS.deposited : TIPS.withdrawn,
    });
  }

  // ---- the carry layer: a row worth zero (nothing held before a first
  // deposit, no rise across a self-transfer) is left out.
  const carry: (SheetRow & { sub?: SheetRow[] })[] = [];
  let before: SheetRow | undefined;
  if (earlier && priceThen != null && beforeBal !== ZERO) {
    const lastValue = valueOf(beforeBal, priceThen, sd);
    carry.push({
      key: "last",
      label: SHEET_WORDS.last,
      amount: asset(
        assetsText(lastValue),
        derived(
          "The shares held once the previous event had run, valued in the vault's asset at the share price of that event's block.",
          "shares held × share price at the previous event's block ÷ 10^share decimals",
          [heldInput("Shares held", beforeBal), priceInput(earlier, "Share price then")],
        ),
      ),
      tip: TIPS.last,
    });
    if (earlierCoords && beforeBal !== ZERO) {
      // The shares held then stand under "Last event".
      carry[0].sub = [
        {
          key: "last-shares",
          label: WORDS.heldThen,
          amount: shares(sharesText(beforeBal), prov.balanceAfter(earlierCoords), beforeBal.toString()),
          tip: TIPS.lastShares,
        },
      ];
    }
    const interest = priceNow != null ? valueOf(beforeBal, priceNow - priceThen, sd) : null;
    if (interest != null && !/[1-9]/.test(assetsText(interest))) {
      // No rise between the two blocks, at the precision drawn: no interest row.
    } else if (interest != null) {
      carry.push({
        key: "interest",
        label: SHEET_WORDS.interest,
        amount: asset(
          assetsText(interest, true),
          derived(
            "The shares held between the previous event and this one times the share price's rise between their blocks, in the vault's asset.",
            "shares held × (share price now − share price then) ÷ 10^share decimals",
            [
              heldInput("Shares held", beforeBal),
              priceInput(earlier, "Share price then"),
              priceInput(event, "Share price now"),
            ],
          ),
        ),
        tip: TIPS.interest,
      });
    } else {
      carry.push({
        key: "interest",
        label: SHEET_WORDS.interest,
        amount: { text: WORDS.unread },
        tip: TIPS.interestUnread,
      });
    }
  }
  if (beforeBal === ZERO) {
    // A first deposit: nothing before it.
  } else if (priceNow != null) {
    before = {
      key: "before",
      label: SHEET_WORDS.before,
      amount: asset(
        assetsText(valueOf(beforeBal, priceNow, sd)),
        derived(
          "The shares held just before this event, valued in the vault's asset at the share price of this event's block.",
          "shares held before × share price now ÷ 10^share decimals",
          [heldInput("Shares held", beforeBal), priceInput(event, "Share price now")],
        ),
      ),
      tip: TIPS.before,
    };
  } else {
    before = {
      key: "before",
      label: SHEET_WORDS.before,
      amount: shares(
        sharesText(beforeBal),
        prov.balanceBefore ? prov.balanceBefore(coords) : prov.balanceAfter(coords),
        beforeBal.toString(),
      ),
      tip: TIPS.beforeShares,
    };
  }

  // ---- the breakdown layer
  const assets: SheetRow[] = [
    {
      key: "held",
      label: WORDS.held,
      amount: shares(sharesText(after), prov.balanceAfter(coords), event.balanceAfter),
      tip: TIPS.held,
    },
    {
      key: "price",
      label: WORDS.price,
      amount:
        priceNow != null
          ? {
              text: sharePriceText(num(priceNow, ad), ad),
              symbol: assetSymbol,
              info: prov.sharePrice(coords, sd),
              value: event.sharePriceAtBlock ?? undefined,
            }
          : { text: event.sharePriceReverted ? WORDS.reverted : WORDS.unread },
      tip: TIPS.price,
    },
    ...extraRows,
  ];

  // The total states its amount in the asset column: the claim in the vault's
  // asset, or the shares where the price was not read.
  const totalAmount: SheetRow["amount"] =
    priceNow != null
      ? asset(
          assetsText(valueOf(after, priceNow, sd)),
          derived(
            "The shares held after this event, valued in the vault's asset at the share price of this event's block.",
            "shares held after × share price now ÷ 10^share decimals",
            [heldInput("Shares held", after), priceInput(event, "Share price now")],
          ),
        )
      : shares(sharesText(after), prov.balanceAfter(coords), event.balanceAfter);

  return {
    sides: [
      {
        side: "collateral",
        name: WORDS.side,
        icons: [assetSymbol],
        carry,
        before,
        rows,
        assets,
        total: SHEET_NO_USD,
        totalAmount,
        totalTip: priceNow != null ? TIPS.total : TIPS.totalShares,
      },
    ],
    panels: [],
  };
}
