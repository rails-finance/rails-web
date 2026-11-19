"use client";

// One address's sBOLD at one block (rails-ops ui-jobs 765), on the shared
// card's detail surface as the Yearn holder page's card is
// (components/vaults/vault-holding-plain-card.tsx): Shares held
// (balanceOf), convertToAssets(balance) in BOLD, and the pro-rata balance ×
// totalAssets ÷ totalSupply. Getter answers only: no history, no PnL.

import Link from "next/link";
import { Prov } from "@/components/shared/provenance";
import { PositionCard, type PositionCardHead } from "@/components/shared/position-card";
import { NotLoaded } from "@/components/shared/not-loaded";
import { ExplainBullet, ExplainGroup, Fig } from "@/components/shared/explain-groups";
import { formatUnitsExact } from "@/lib/utils/format";
import { proRata, scientificText } from "@/lib/liquity-v2/sbold-per-share";
import {
  sboldHolderClaimProv,
  sboldHolderProRataProv,
  sboldHolderSharesProv,
  type SboldCoords,
} from "@/lib/liquity-v2/sbold-provenance";
import { SBOLD_ASSET } from "@/lib/liquity-v2/sbold";
import type { SboldHolding } from "@/lib/sources/chain/sbold-holder";
import { serverReadOf } from "@/lib/shared/server-head-read";

const n = (v: number) => v.toLocaleString("en-US");
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
            <Prov
              value={pr.text}
              info={sboldHolderProRataProv(coords, {
                holder: data.holder,
                sharesRaw: data.sharesRaw,
                assetsRaw: data.totalAssetsRaw,
                supplyRaw: data.totalSupplyRaw,
                text: pr.text,
              })}
            >
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
                <ExplainBullet>
                  At block <Fig>{n(data.blockNumber)}</Fig> the vault&rsquo;s balanceOf answers{" "}
                  <Fig>{data.sharesRaw ?? "an unread amount"}</Fig> share units for this address.
                </ExplainBullet>
                <ExplainBullet>
                  convertToAssets rounds down, so a small balance can convert to 0 BOLD; the pro-rata figure is the same
                  shares&rsquo; part of total assets before that rounding.
                </ExplainBullet>
              </ExplainGroup>
            ),
          },
          learnMore: null,
          panel: [[], []],
        }}
      />
    </div>
  );
}
