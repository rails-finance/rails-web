// One address's pETH account: /sepolia/polaris/peth/<address> (ui-jobs 865).
// The server reads the address's figures, the places its pETH sits and its
// newest ledger rows from rails-server (GET /api/polaris/peth/:address);
// where that read does not answer, the client view reads them. An ENS name or
// a mixed-case address redirects to the lower-cased address, as the wallet
// page does.

import type { Metadata } from "next";
import { positionMetadata } from "@/lib/shared/page-metadata";
import { AimGate } from "@/components/shared/aim-gate";
import { assetKey } from "@/lib/shared/asset-family";
import { PETH_ACCOUNT_DESCRIPTION, pethAddressForMetadata, pethAddressOf } from "@/lib/polaris/peth-address";
import { FPETH, PETH, POLARIS_CHAIN_ID, POLARIS_WETH } from "@/lib/polaris/asset-catalog";
import { polarisPethAccountHref } from "@/lib/polaris/routes";
import { isPethRefusal, loadPethDevCache, loadPolarisPeth } from "@/lib/polaris/peth-page-data";
import { buildPethMapFill } from "@/lib/polaris/peth-map-fill";
import { pethMapContext } from "@/lib/polaris/peth-map-context";
import PethView from "./peth-view";

interface Props {
  params: Promise<{ address: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address: raw } = await params;
  const address = pethAddressForMetadata(raw);
  return positionMetadata({
    session: "polaris",
    subject: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : decodeURIComponent(raw),
    noun: "pETH account",
    canonicalPath: polarisPethAccountHref(address ?? decodeURIComponent(raw)),
    description: () => PETH_ACCOUNT_DESCRIPTION,
  });
}

const KEYS = [
  assetKey(POLARIS_CHAIN_ID, PETH.address),
  assetKey(POLARIS_CHAIN_ID, FPETH.address),
  assetKey(POLARIS_CHAIN_ID, POLARIS_WETH.address),
];

export default async function PolarisPethPage({ params }: Props) {
  const { address: raw } = await params;
  const address = await pethAddressOf(raw);
  const initial = await loadPolarisPeth(address);
  // The map's fill is summed here, so the browser receives a few dozen
  // figures for it (ui-jobs 873).
  const mapFill = initial && !isPethRefusal(initial) ? buildPethMapFill(initial, pethMapContext(address)) : null;
  const handAdded = (await loadPethDevCache(address))?.handAddedPlaces ?? null;
  return (
    <AimGate keys={KEYS} chain={POLARIS_CHAIN_ID} what="This pETH account">
      <PethView
        key={address}
        address={address}
        initial={initial}
        mapFill={mapFill}
        handAddedPlaces={handAdded && handAdded.length > 0 ? handAdded : null}
      />
    </AimGate>
  );
}
