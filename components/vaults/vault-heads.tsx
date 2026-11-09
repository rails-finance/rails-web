"use client";

// The pieces the vault row (V1) and the vault card (V2) share (rails-ops
// ui-jobs 407; survey 2026-10-20 §6): the asset icon with the venue mark, the
// neutral pills, and the four headlines in their order, Total assets · Share
// price · Yield · Holders (decision 0047 point 5). The row prints the first
// two in the compact form; the card through the print rules
// (lib/shared/vault-amount-text.ts), with each label's read-more (decision 0038).

import Link from "next/link";
import type { ReactNode } from "react";
import type { PositionCardHead } from "@/components/shared/position-card";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { VaultVenueMark, type VaultVenue } from "@/components/vaults/vault-venue-mark";
import { formatCompact } from "@/lib/shared/format-compact";
import { formatUnitsExact } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import { assetText, sharePriceText } from "@/lib/shared/vault-amount-text";
import type { VaultStanding, VaultSummary } from "@/lib/vaults/summary";
import type { VaultFamily } from "@/lib/vaults/families";
import { changeText, jumpTail, measuredYield, yieldText, type VaultYield } from "@/lib/vaults/yield";
import { vaultHoldersProv, vaultWithdrawableProv, vaultYieldProv } from "@/lib/vaults/row-provenance";
import { illiquidSentence, type VaultIlliquid } from "@/lib/vaults/illiquid";
import { heldAssetsRaw } from "@/lib/vaults/lost-assets";

const n = (v: number) => v.toLocaleString("en-US");

/** The family's own receipts for the headline figures and the pills. */
export interface VaultRowReceipts {
  name?: Provenance;
  totalAssets?: Provenance;
  sharePrice?: Provenance;
  /** The Total assets caution's two figures (ui-jobs 543): `lostAssets()` and
   *  what the vault holds. */
  lostAssets?: Provenance;
  heldAssets?: Provenance;
  standing?: Partial<Record<VaultStanding, Provenance>>;
}

export const STANDING_WORD: Record<VaultStanding, string> = {
  endorsed: "endorsed",
  "shut-down": "shut down",
  paused: "paused",
  "address-book": "in Aave’s address book",
  illiquid: "illiquid",
  "lost-assets": "lost assets",
};

const VENUE: Record<VaultFamily, VaultVenue> = {
  metamorpho: "morpho",
  sgho: "sgho",
  stata: "stata",
  "umbrella-stake": "umbrella-stake",
  "yearn-v3": "yearn",
  "maple-pool": "maple",
};

export const VAULT_PILL =
  "rounded-sm bg-rb-300 px-1.5 py-0.5 text-[11px] text-foreground/80 dark:bg-rb-700 dark:text-foreground/60";

export const YIELD_LABEL_TIP =
  "Rails's figure: the share price's growth over 30 days from the daily store, annualised simply. Net of the fees the vault takes inside the share; rewards paid outside the share are not in it.";

/** The card's read-mores for the four headlines (decision 0038). */
export const VAULT_HEAD_TIPS = {
  totalAssets: "Everything the vault's shares are a claim on, in its asset.",
  sharePrice: "What one whole share of the vault converts to in its asset.",
  yield:
    "Rails's interpretation of two reads of the share price from the daily store, 30 days apart, annualised simply. Net of the fees the vault takes inside the share; rewards paid outside the share are not counted. No forecast.",
  holders:
    "Every address the census has seen hold a share of this vault, live and closed, at its own block. A floor: an address is often a wrapper or a contract holding for others.",
};

/** The asset's icon with the venue mark at its corner. */
export function VaultLead({ vault: v, size = 28 }: { vault: VaultSummary; size?: number }) {
  // Yearn's mark is earned by the Registry's endorsement (decision 0027 call 1).
  const marked = v.family !== "yearn-v3" || v.standing.includes("endorsed");
  return (
    // The icon is decoration (the name beside it says which vault): a fallback
    // glyph's letters and digits are no figure, so the tripwire skips it.
    <span className="relative inline-flex shrink-0 items-center" data-vault-asset={v.asset.address} data-prov-exempt>
      <TokenChipIcon symbol={v.asset.symbol} address={v.asset.address} size={size} filterable={false} untitled />
      {marked && (
        <span className="absolute -bottom-0.5 -right-1.5 inline-flex rounded-full bg-raised p-px" data-venue-mark>
          <VaultVenueMark family={VENUE[v.family]} />
        </span>
      )}
    </span>
  );
}

/** The family and release pill, then one pill per standing the chain or the
 *  venue states. Neutral: no pill carries a valence. */
export function VaultPills({
  vault: v,
  receipts,
  hooks,
}: {
  vault: VaultSummary;
  receipts: VaultRowReceipts;
  /** `data-*` hooks per standing pill, which a verifier reads. */
  hooks?: Partial<Record<VaultStanding, Record<string, string>>>;
}) {
  return (
    <>
      <span className={VAULT_PILL} data-pill="family">
        {v.releaseLabel}
      </span>
      {v.standing.map((s) => (
        <span
          key={s}
          className={VAULT_PILL}
          data-pill={s}
          {...(s === "endorsed"
            ? { "data-endorsed-badge": "" }
            : s === "shut-down"
              ? { "data-shutdown-badge": "" }
              : {})}
          {...hooks?.[s]}
        >
          {receipts.standing?.[s] ? <Prov info={receipts.standing[s]}>{STANDING_WORD[s]}</Prov> : STANDING_WORD[s]}
        </span>
      ))}
    </>
  );
}

/** A figure in the vault's asset, the ticker small beside it. */
function InAsset({ v, children, exact }: { v: VaultSummary; children: ReactNode; exact: string }) {
  return (
    // Wraps inside its column: a share price can run to twenty digits (a BRZ
    // vault on Base answers 2,008,056,384,921,425,400.00) and must not push the
    // page sideways at 390.
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <span className="break-all" data-prov-exact={exact} data-prov-symbol={v.asset.symbol}>
        {children}
      </span>
      <span className={`text-[0.5em] font-medium text-rb-500 ${v.asset.named ? "" : "font-mono"}`}>
        {v.asset.symbol}
      </span>
    </span>
  );
}

const withProv = (info: Provenance | undefined, text: string) => (info ? <Prov info={info}>{text}</Prov> : text);

/** The Yield slot's caution on an illiquid vault (ui-jobs 540): which markets
 *  hold it, and what can be withdrawn at the read block. `detail` prints the
 *  full figures; the row, the compact form. Both carry the receipt (ui-jobs 551). */
export function IlliquidCaution({ vault: v, il, detail }: { vault: VaultSummary; il: VaultIlliquid; detail: boolean }) {
  const raw = BigInt(il.withdrawable);
  const amount = { raw: il.withdrawable, value: Number(raw) / 10 ** v.asset.decimals };
  const out = detail ? assetText(amount, v.asset.decimals) : formatCompact(amount.value);
  const total = v.totalAssets
    ? detail
      ? assetText(v.totalAssets, v.asset.decimals)
      : formatCompact(v.totalAssets.value)
    : null;
  return (
    <span className="mt-1 block" data-yield-illiquid={il.markets.map((m) => m.id).join(" ")}>
      {illiquidSentence(il)}{" "}
      <span data-illiquid-withdrawable={il.withdrawable}>
        <Prov info={vaultWithdrawableProv(v, il)}>{out}</Prov>
      </span>
      {total != null ? ` of ${total}` : ""} {v.asset.symbol} can be withdrawn.
    </span>
  );
}

/** The Total assets slot's caution on a vault whose total includes lost assets
 *  (ui-jobs 543): what was lost and what the vault holds, at the read block.
 *  `detail` prints the full figures; the row, the compact form. Both carry the
 *  receipts (ui-jobs 551). The words are lib/vaults/lost-assets.ts `lostAssetsSentence`. */
export function LostAssetsCaution({
  vault: v,
  receipts,
  detail,
}: {
  vault: VaultSummary;
  receipts: VaultRowReceipts;
  detail: boolean;
}) {
  if (!v.totalAssets || !v.lostAssets) return null;
  const d = v.asset.decimals;
  const heldRaw = heldAssetsRaw(v.totalAssets.raw, v.lostAssets.raw).toString();
  const held = { raw: heldRaw, value: Number(heldRaw) / 10 ** d };
  const text = (a: { raw: string; value: number }) => (detail ? assetText(a, d) : formatCompact(a.value));
  return (
    <span className="block" data-total-assets-lost="">
      Includes <span data-lost-assets={v.lostAssets.raw}>{withProv(receipts.lostAssets, text(v.lostAssets))}</span>{" "}
      {v.asset.symbol} of lost assets. The vault holds{" "}
      <span data-held-assets={heldRaw}>{withProv(receipts.heldAssets, text(held))}</span> {v.asset.symbol}; the share
      price has not been lowered for the loss, so the holders who withdraw last carry it.
    </span>
  );
}

/** The four headlines. `detail`: the card, which prints the print rules' full
 *  figures and gives every label its read-more; else the row's compact form. */
type MeasuredYield = Extract<VaultYield, { yearly: number }>;

/** The Yield subline's words: "share price +0.42% over the last 30 days",
 *  and the one-off move where there is one. The two reads' blocks are the
 *  figure's receipt. */
export const yieldSublineText = (y: MeasuredYield): string =>
  `share price ${changeText(y.change)} over the last ${y.days} days${
    y.jump ? jumpTail(y.jump, (d) => formatDate(new Date(d * 86_400_000))) : ""
  }`;

/** "The vault holds 0.000002 USDC.": the too-small subline. */
export const tooSmallSentence = (v: VaultSummary): string =>
  v.totalAssets ? `The vault holds ${assetText(v.totalAssets, v.asset.decimals)} ${v.asset.symbol}.` : "";

export function vaultHeads({
  vault: v,
  yieldFigure: storeYield,
  holdersHref,
  receipts,
  detail = false,
}: {
  vault: VaultSummary;
  /** The store's measure; absent means the store was not read. */
  yieldFigure?: VaultYield;
  holdersHref: string | null;
  receipts: VaultRowReceipts;
  detail?: boolean;
}): PositionCardHead[] {
  const heads: PositionCardHead[] = [
    {
      id: "total-assets",
      label: "Total assets",
      labelTip: detail ? VAULT_HEAD_TIPS.totalAssets : undefined,
      value: v.totalAssets ? (
        <span
          data-cell="total-assets"
          {...(detail ? { "data-figure": "total-assets", "data-raw": v.totalAssets.raw } : {})}
        >
          <InAsset v={v} exact={formatUnitsExact(v.totalAssets.raw, v.asset.decimals)}>
            {detail ? (
              // A phone's half-width column cannot hold nine digits and cents
              // at headline size: it reads the compact form, the full figure
              // from sm up, which carries the receipt.
              <>
                <span className="sm:hidden" data-prov-exempt="">
                  {formatCompact(v.totalAssets.value)}
                </span>
                <span className="hidden sm:inline" data-figure-value="">
                  {withProv(receipts.totalAssets, assetText(v.totalAssets, v.asset.decimals))}
                </span>
              </>
            ) : (
              withProv(receipts.totalAssets, formatCompact(v.totalAssets.value))
            )}
          </InAsset>
        </span>
      ) : null,
      ...(v.standing.includes("lost-assets")
        ? { sub: <LostAssetsCaution vault={v} receipts={receipts} detail={detail} /> }
        : {}),
    },
    {
      id: "share-price",
      label: "Share price",
      labelTip: detail ? VAULT_HEAD_TIPS.sharePrice : undefined,
      value: v.sharePrice ? (
        <span
          data-cell="share-price"
          {...(detail ? { "data-figure": "share-price", "data-raw": v.sharePrice.raw } : {})}
        >
          <InAsset v={v} exact={formatUnitsExact(v.sharePrice.raw, v.asset.decimals)}>
            <span data-figure-value="">
              {withProv(receipts.sharePrice, sharePriceText(v.sharePrice, v.asset.decimals))}
            </span>
          </InAsset>
        </span>
      ) : null,
    },
  ];

  // The slot draws whatever the store answers, so the four headlines align
  // (decision 0047 point 4): a figure where the store measures 30 days, else
  // no figure and a subline saying why; a vault under the dust floor is too
  // small to measure (ui-jobs 542). The interpretation tip goes with the label.
  const yieldFigure = measuredYield(storeYield, v.totalAssets?.raw);
  if (yieldFigure && "yearly" in yieldFigure) {
    heads.push({
      id: "yield",
      label: "Yield",
      labelTip: detail ? VAULT_HEAD_TIPS.yield : YIELD_LABEL_TIP,
      labelTipOnListing: true,
      value: (
        <span
          data-cell="yield"
          data-yield-from-block={yieldFigure.from.block}
          data-yield-to-block={yieldFigure.to.block}
          data-yield-days={yieldFigure.days}
        >
          <Prov info={vaultYieldProv(v, yieldFigure)}>{yieldText(yieldFigure.yearly)}</Prov>
        </span>
      ),
      sub: (
        <span
          {...(yieldFigure.jump
            ? {
                "data-yield-jump-day": String(yieldFigure.jump.day),
                ...(yieldFigure.jump.fromDay != null
                  ? { "data-yield-jump-from": String(yieldFigure.jump.fromDay) }
                  : {}),
              }
            : {})}
        >
          {yieldSublineText(yieldFigure)}
          {v.illiquid && <IlliquidCaution vault={v} il={v.illiquid} detail={detail} />}
        </span>
      ),
    });
  } else if (yieldFigure?.none === "too-small" && v.totalAssets) {
    heads.push({
      id: "yield",
      label: "Yield",
      labelTip: detail ? VAULT_HEAD_TIPS.yield : undefined,
      value: (
        <span className="text-[15px] font-normal text-rb-500" data-cell="yield" data-yield-none="too-small">
          too small to measure
        </span>
      ),
      sub: (
        <span data-yield-too-small={v.totalAssets.raw}>
          {tooSmallSentence(v)}
          {v.illiquid && <IlliquidCaution vault={v} il={v.illiquid} detail={detail} />}
        </span>
      ),
    });
  } else {
    const none = yieldFigure == null ? "unread" : yieldFigure.none;
    heads.push({
      id: "yield",
      label: "Yield",
      labelTip: detail ? VAULT_HEAD_TIPS.yield : undefined,
      value: null,
      sub: (
        <span data-yield-none={none}>
          {yieldFigure != null && "firstDay" in yieldFigure
            ? `series from ${formatDate(new Date(yieldFigure.firstDay * 86_400_000))}`
            : yieldFigure == null
              ? "daily series not read"
              : "no daily series yet"}
          {v.illiquid && <IlliquidCaution vault={v} il={v.illiquid} detail={detail} />}
        </span>
      ),
    });
  }

  const c = v.census;
  heads.push({
    id: "holders",
    label: "Holders",
    labelTip: detail ? VAULT_HEAD_TIPS.holders : undefined,
    value:
      c == null ? null : c.holders > 0 && holdersHref ? (
        <Link
          href={holdersHref}
          prefetch={false}
          className="pointer-events-auto hover:text-blue-600 dark:hover:text-[var(--text-link)]"
          data-cell="holders"
          data-positions-link={v.address}
          data-link="vault-positions"
          data-positions-vault={v.address}
        >
          <Prov info={vaultHoldersProv(v, c)}>{n(c.holders)}</Prov>
        </Link>
      ) : (
        <span data-cell="holders" data-positions-none="">
          <Prov info={vaultHoldersProv(v, c)}>{n(c.holders)}</Prov>
        </span>
      ),
    sub:
      c == null ? (
        "no census"
      ) : c.holders === 0 ? (
        "no holder yet"
      ) : (
        <Prov info={vaultHoldersProv(v, c)}>{`${n(c.live)} open`}</Prov>
      ),
  });
  return heads;
}
