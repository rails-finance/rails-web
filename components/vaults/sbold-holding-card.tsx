"use client";

// One address's sBOLD at one block (rails-ops ui-jobs 765), on the shared
// card's detail surface as the Yearn holder page's card is
// (components/vaults/vault-holding-plain-card.tsx): Shares held
// (balanceOf), convertToAssets(balance) in BOLD, and the pro-rata balance ×
// totalAssets ÷ totalSupply. The (i) states convertToAssets(balance), the
// pro-rata and their difference, each with its receipt, and no cause. The read
// stamp names the block. Getter answers only: no history, no PnL.

import Link from "next/link";
import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardHead } from "@/components/shared/position-card";
import { NotLoaded } from "@/components/shared/not-loaded";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { formatUnitsExact } from "@/lib/utils/format";
import { proRata, scientificText } from "@/lib/liquity-v2/sbold-per-share";
import {
  sboldHolderClaimProv,
  sboldHolderDiffProv,
  sboldHolderProRataProv,
  sboldHolderSharesProv,
  type SboldCoords,
} from "@/lib/liquity-v2/sbold-provenance";
import { SBOLD_ASSET, SBOLD_VAULT } from "@/lib/liquity-v2/sbold";
import { readStampProv, SectionReadStamp } from "@/components/shared/read-stamp";
import type { SboldHolding } from "@/lib/sources/chain/sbold-holder";
import { serverReadOf } from "@/lib/shared/server-head-read";

const UNREAD = <NotLoaded className="text-base font-normal text-rb-500" />;

/** A raw amount at full precision, the unit small beside it. */
function Amount({ raw, decimals, unit }: { raw: string; decimals: number; unit: string }) {
  const exact = formatUnitsExact(raw, decimals);
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <span className="break-all" data-figure-value="">
        {exact}
      </span>
      <span className="text-[0.5em] font-medium text-rb-500">{unit}</span>
    </span>
  );
}

export function SboldHoldingCard({ data, vaultHref }: { data: SboldHolding; vaultHref: string }) {
  const coords: SboldCoords = { readBy: serverReadOf(data), blockNumber: data.blockNumber };
  const sd = data.shareDecimals;
  const ad = SBOLD_ASSET.decimals;
  const unit = SBOLD_ASSET.symbol;
  const share = data.symbol ?? "sBOLD";
  const pr =
    data.sharesRaw && data.totalAssetsRaw && data.totalSupplyRaw && sd != null
      ? proRata(data.sharesRaw, data.totalAssetsRaw, data.totalSupplyRaw, ad, sd)
      : null;

  const proRataProv =
    pr && data.sharesRaw && data.totalAssetsRaw && data.totalSupplyRaw
      ? sboldHolderProRataProv(coords, {
          holder: data.holder,
          sharesRaw: data.sharesRaw,
          assetsRaw: data.totalAssetsRaw,
          supplyRaw: data.totalSupplyRaw,
          text: pr.text,
        })
      : null;
  // The two answers and their difference, stated where all of them answered (ui-jobs 765).
  const diff =
    proRataProv && data.claimRaw != null && data.sharesRaw && data.totalAssetsRaw && data.totalSupplyRaw
      ? (() => {
          const proRataRaw = (
            (BigInt(data.sharesRaw) * BigInt(data.totalAssetsRaw)) /
            BigInt(data.totalSupplyRaw)
          ).toString();
          return {
            proRataRaw,
            claimRaw: data.claimRaw,
            diffRaw: (BigInt(proRataRaw) - BigInt(data.claimRaw)).toString(),
          };
        })()
      : null;

  const heads: PositionCardHead[] = [
    {
      id: "shares",
      label: "Shares held",
      labelTip: "The vault's balanceOf for this address.",
      tier: "amount",
      value: (
        <span data-figure="holder-shares" data-raw={data.sharesRaw ?? ""}>
          {data.sharesRaw != null && sd != null ? (
            <Prov info={sboldHolderSharesProv(coords, { holder: data.holder, raw: data.sharesRaw, decimals: sd })}>
              <Amount raw={data.sharesRaw} decimals={sd} unit={share} />
            </Prov>
          ) : (
            UNREAD
          )}
        </span>
      ),
      sub: data.sharesRaw != null ? <span>raw {data.sharesRaw}</span> : undefined,
    },
    {
      id: "claim",
      label: "convertToAssets(balance)",
      labelTip: "The BOLD the vault's convertToAssets answers for this address's shares.",
      tier: "amount",
      value: (
        <span data-figure="holder-claim" data-raw={data.claimRaw ?? ""}>
          {data.claimRaw != null && data.sharesRaw != null ? (
            <Prov
              value={formatUnitsExact(data.claimRaw, ad)}
              info={sboldHolderClaimProv(coords, {
                holder: data.holder,
                sharesRaw: data.sharesRaw,
                raw: data.claimRaw,
              })}
            >
              <Amount raw={data.claimRaw} decimals={ad} unit={unit} />
            </Prov>
          ) : (
            UNREAD
          )}
        </span>
      ),
    },
    {
      id: "pro-rata",
      label: "Balance × total assets ÷ shares issued",
      labelTip: "This address's shares times the vault's totalAssets(), over its totalSupply().",
      tier: "measure",
      value: (
        <span data-figure="holder-pro-rata">
          {pr && data.sharesRaw && data.totalAssetsRaw && data.totalSupplyRaw ? (
            <Prov value={pr.text} info={proRataProv!}>
              {pr.sci ? scientificText(pr.sci.mantissa, pr.sci.exponent) : pr.text}
            </Prov>
          ) : (
            UNREAD
          )}
        </span>
      ),
      sub: pr ? <span>{unit}</span> : undefined,
    },
  ];

  return (
    <div
      className="mb-6"
      data-anatomy="V8"
      data-position-card={`sbold:${data.holder}`}
      data-holder={data.holder}
      data-vault-family="sbold"
      data-shares-raw={data.sharesRaw ?? ""}
      data-claim-raw={data.claimRaw ?? ""}
      data-live-block={data.blockNumber}
    >
      <PositionCard
        slots={{
          surface: "detail",
          heading: "Holding summary",
          status: null,
          identity: (
            <span className="text-sm font-semibold text-foreground" data-card-vault-symbol={share}>
              <Link href={vaultHref} className="hover:underline" prefetch={false}>
                {share}
              </Link>
            </span>
          ),
          heads,
          counters: null,
          menu: null,
          explainer: {
            body: (
              <ExplainGroup title="At this block">
                {data.sharesRaw != null && sd != null && (
                  <ExplainBullet>
                    The vault&rsquo;s balanceOf answers{" "}
                    <Prov
                      info={sboldHolderSharesProv(coords, { holder: data.holder, raw: data.sharesRaw, decimals: sd })}
                    >
                      <Fig>{data.sharesRaw}</Fig>
                    </Prov>{" "}
                    share units for this address.
                  </ExplainBullet>
                )}
                {diff && (
                  <ExplainBullet data-holder-diff={diff.diffRaw}>
                    convertToAssets(balance) answers{" "}
                    <Prov
                      info={sboldHolderClaimProv(coords, {
                        holder: data.holder,
                        sharesRaw: data.sharesRaw!,
                        raw: data.claimRaw!,
                      })}
                    >
                      <Fig>{formatUnitsExact(data.claimRaw!, ad)}</Fig>
                    </Prov>{" "}
                    {unit}; balance × total assets ÷ shares issued is{" "}
                    <Prov info={proRataProv!}>
                      <Fig>{pr!.sci ? scientificText(pr!.sci.mantissa, pr!.sci.exponent) : pr!.text}</Fig>
                    </Prov>{" "}
                    {unit}; the difference is{" "}
                    <Prov info={sboldHolderDiffProv(coords, { holder: data.holder, ...diff })}>
                      <Fig>{formatUnitsExact(diff.diffRaw, ad)}</Fig>
                    </Prov>{" "}
                    {unit}.
                  </ExplainBullet>
                )}
              </ExplainGroup>
            ),
          },
          learnMore: null,
          panel: [[], []],
          // The block every figure was read at, as the vault card states it (ui-jobs 765).
          stamp: (
            <SectionReadStamp
              chainId={1}
              block={data.blockNumber}
              readBy={coords.readBy}
              info={(at) =>
                readStampProv({
                  chainId: 1,
                  block: data.blockNumber,
                  at,
                  readBy: coords.readBy,
                  what: "Every figure on this card",
                  contracts: [
                    {
                      name: "sBOLD vault",
                      address: SBOLD_VAULT,
                      reads:
                        "balanceOf(holder), totalAssets(), totalSupply(), decimals(), asset(), symbol(), convertToAssets(balance)",
                    },
                  ],
                })
              }
            />
          ),
        }}
      />
    </div>
  );
}
