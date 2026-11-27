// A wallet position's protocol on the roster, for the positions menu. A row
// with a page resolves from its href; a row with none (href null) resolves
// from its chain and family, as lib/wallet/wallet-summary.ts does.

import { CHAINS } from "@/lib/shared/chains";
import { POSITION_NOUN, PROTOCOLS, listingHrefForWallet, protocolForPathname } from "@/lib/shared/protocols";
import { summaryPositionCrumb } from "@/lib/shared/position-name";
import {
  VAULT_SHARES_FAMILY,
  vaultProtocolOfHref,
  vaultRoot,
  type MenuProtocol,
  type WalletCountsPosition,
} from "@/lib/wallet/summary-counts";
import { walletProtocol, walletProtocolHref, walletVaultHref } from "@/lib/wallet/wallet-filters";

type Entry = (typeof PROTOCOLS)[number];

export function protocolEntryOf(p: Pick<WalletCountsPosition, "chain" | "family" | "href">): Entry | undefined {
  const byHref = p.href ? protocolForPathname(p.href.split("?")[0]) : undefined;
  if (byHref) return byHref;
  const chainId = Object.values(CHAINS).find((c) => c.slug === p.chain)?.id;
  return PROTOCOLS.find((e) => e.chainId === chainId && e.slug === p.family);
}

/** A position's explorer on the roster: its name, its place, and the page of
 *  the wallet's positions in it: the wallet view narrowed to the protocol
 *  where the view reads it (Miles, 25 Nov 2026), else its listing searched by
 *  the wallet. A vault-share row names its vault protocol and opens the
 *  wallet view narrowed to that protocol's shares (`?vault=`; ui-jobs 856). */
export function menuProtocolOf(p: WalletCountsPosition, address: string): MenuProtocol | undefined {
  const entry = protocolEntryOf(p);
  if (!entry) return undefined;
  const vault = vaultProtocolOfHref(p.href);
  const root = vaultRoot(p.href);
  return {
    name: vault ?? entry.label,
    order: PROTOCOLS.indexOf(entry),
    listing: root
      ? walletVaultHref(address, root)
      : walletProtocol(p.family)
        ? walletProtocolHref(address, p.family)
        : listingHrefForWallet(entry.session, address),
  };
}

/** A summary row's name in the positions menu (H13.5; ui-jobs 856):
 *  `summaryPositionCrumb` from the row's market and the family's noun. */
export function summaryCrumb(p: WalletCountsPosition, wallet: string): string {
  const entry = protocolEntryOf(p);
  // A vault share is a holding, whichever explorer its page sits under; a
  // Stability Pool deposit and a Liquity V1 stake take their cards' nouns
  // and pools (v1-sp-deposit-card, v1-staking-card).
  const path = p.href?.split("?")[0] ?? "";
  const pool = path.includes("/stability-pool/");
  const stake = path.includes("/staking/");
  const noun =
    p.family === VAULT_SHARES_FAMILY
      ? "Holding"
      : pool
        ? "Deposit"
        : stake
          ? "LQTY stake"
          : entry
            ? POSITION_NOUN[entry.session]
            : "Position";
  const market = p.market ?? (pool ? "Stability Pool" : stake ? "Staking" : undefined);
  const chainName = Object.values(CHAINS).find((c) => c.slug === p.chain)?.name;
  return summaryPositionCrumb({ positionId: p.positionId, market, noun, chainName }, wallet);
}
