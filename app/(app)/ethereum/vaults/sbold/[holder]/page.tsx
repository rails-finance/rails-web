// ONE sBOLD HOLDING — /ethereum/vaults/sbold/<holder> (rails-ops ui-jobs 765).
// ----------------------------------------------------------------------------
// The Yearn holder page's shell (app/(app)/ethereum/yearn/vaults/[vault]/[holder])
// for the sBOLD vault: the segment is an address or an ENS name, resolved on
// the server through mainnet's resolver (lib/yearn/vault-holder.ts), and every
// outcome of the input is stated. The card states balanceOf, convertToAssets
// (balance) and the pro-rata balance × totalAssets ÷ totalSupply at one block.
// No history and no PnL.

import type { Metadata } from "next";
import Link from "next/link";

import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { FocusSourceGate } from "@/components/shared/aim-gate";
import { SboldHoldingCard } from "@/components/vaults/sbold-holding-card";
import { sectionPositionMetadata } from "@/lib/shared/page-metadata";
import { FOOT_LINK } from "@/lib/shared/ui-grammar";
import { shortAddress } from "@/lib/shared/vault-amount-text";
import { resolveYearnVaultHolder } from "@/lib/yearn/vault-holder";
import { loadSboldHolding } from "@/lib/sources/chain/sbold-holder";
import { SBOLD_ASSET, SBOLD_PAGE_PATH, sboldHolderHref } from "@/lib/liquity-v2/sbold";

// Every figure is a call at the head with the holder in the path.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ holder: string }> };

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { holder } = await params;
  // No network call in metadata: the address as typed.
  const subject = ADDRESS.test(holder) ? shortAddress(holder.toLowerCase()) : decodeURIComponent(holder);
  return sectionPositionMetadata({
    section: { label: "Vaults", chainId: 1 },
    market: "sBOLD",
    subject,
    canonicalPath: sboldHolderHref(holder),
    description:
      "A Rails reading of this address's sBOLD: shares held, convertToAssets of them in BOLD and their part of total assets, read from chain at one block.",
  });
}

export default async function SboldHoldingRoute({ params }: Props) {
  const { holder } = await params;
  const typed = decodeURIComponent(holder);
  const lookup = await resolveYearnVaultHolder(typed);
  const data = lookup.address ? await loadSboldHolding(lookup.address) : null;
  const subject = lookup.address ? shortAddress(lookup.address) : typed;

  return (
    <FocusSourceGate source={{ asset: SBOLD_ASSET }} chain={1} what="This vault">
      <div className="min-h-screen">
        <div className="py-8">
          <header className="mb-5" data-skel-section="page-header">
            {/* The Yearn holder page's head (ui-jobs 765): Back, then the wallet
              heading with its address menu and bookmark; no explorer session,
              so the chain is stated and the label links to no listing. */}
            <DetailTopRow
              fallbackHref={SBOLD_PAGE_PATH}
              owner={{ wallet: lookup.address, chain: 1, filterProtocol: null }}
              tools={false}
            />
            <h2 className="text-2xl font-semibold text-foreground" data-vault-page="sbold">
              {!lookup.address && <span className="font-mono">{subject}</span>}
              <span className={`${lookup.address ? "" : "ml-2 "}text-base font-normal text-rb-500`}>in sBOLD</span>
            </h2>
            {lookup.kind === "ens" && lookup.address && (
              <p className="mt-1 text-[11px] text-rb-500" data-holder-ens={lookup.typed}>
                {lookup.typed} · resolved through mainnet ENS
              </p>
            )}
            {data?.chainStale ? (
              <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-rb-500">
                This vault could not be read from chain just now, so no figure is stated for this address in it.
              </p>
            ) : (
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-rb-500">
                <Link
                  href={SBOLD_PAGE_PATH}
                  className={`text-xs font-semibold ${FOOT_LINK}`}
                  prefetch={false}
                  data-link="vault-market"
                >
                  sBOLD
                </Link>
              </p>
            )}
          </header>

          {lookup.error === "invalid" && (
            <p className="mb-6 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-lookup-error="invalid">
              That is neither of the two accepted forms. A holding is opened with a 20-byte address starting{" "}
              <code>0x</code>, or an ENS name ending <code>.eth</code>.
            </p>
          )}
          {lookup.error === "unresolved" && (
            <p className="mb-6 max-w-3xl text-[13px] leading-relaxed text-rb-500" data-lookup-error="unresolved">
              No address is recorded for {lookup.typed} on Ethereum mainnet at the time of this read.
            </p>
          )}

          {data && !data.chainStale && <SboldHoldingCard data={data} vaultHref={SBOLD_PAGE_PATH} />}

          <ProvInspectorLayer />
        </div>
      </div>
    </FocusSourceGate>
  );
}
