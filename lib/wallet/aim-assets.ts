// The assets a wallet position names, for AIM (asset isolation mode, ui-jobs
// 557): the wallet view keeps a position only where one of these is in the AIM
// set. MOCK FIRST CUT, per card kind, from what each listing row already
// carries; the full form is a per-family extractor (item 560).
//
//   morpho                 loan + collateral token addresses
//   compound-v3            base token + each collateral line's address
//   spark                  each supplied and borrowed reserve's address (peaks for a closed one)
//   aave-v3                the dominant supply and debt addresses only (the row carries counts, not the list)
//   fluid                  supply and borrow symbols
//   makerdao               the ilk's collateral symbol, and DAI
//   liquity-v2             collateral symbol, and the row's debt symbol (BOLD)
//   ebisu / asymmetry / basedollar   collateral symbol, and the fork's debt symbol
//   the three Arbitrum kinds         nothing: AIM's universe has no Arbitrum token
//
// A symbol resolves to the AIM chooser's tokens of that symbol on the
// position's chain (SCOPE_SYMBOLS).

import { assetKey } from "@/lib/shared/asset-family";
import { SCOPE_SYMBOLS } from "@/lib/shared/asset-scope";
import type { WalletPosition } from "@/lib/wallet/types";

// The forks' debt symbols (lib/<fork>/asset-catalog.ts DEBT_SYMBOL), written
// out so this module does not pull the catalogs into the wallet's bundle.
const FORK_DEBT: Record<string, string> = { ebisu: "ebUSD", asymmetry: "USDaf", basedollar: "BD" };

/** The `chain:address` keys a position names; [] where it names none AIM knows. */
export function walletPositionAssetKeys(p: WalletPosition): string[] {
  const chain = p.chain as number;
  const addresses: (string | null | undefined)[] = [];
  const symbols: (string | null | undefined)[] = [];
  const c = p.card;
  switch (c.kind) {
    case "morpho":
      addresses.push(c.row.loanToken, c.row.collateralToken);
      break;
    case "compound-v3":
      addresses.push(c.row.base.address, ...c.row.collateral.map((a) => a.address));
      break;
    case "spark":
      for (const r of [...c.row.supplies, ...c.row.borrows, ...c.row.peakSupplies, ...c.row.peakBorrows])
        addresses.push(r.address);
      break;
    case "aave-v3":
      addresses.push(c.row.dominantSupplyAddress, c.row.dominantDebtAddress);
      break;
    case "fluid":
      symbols.push(c.row.supplySymbol, c.row.borrowSymbol);
      break;
    case "makerdao":
      symbols.push(c.row.collateralSymbol, "DAI");
      break;
    case "liquity-v2":
      symbols.push(c.row.collateralType, c.row.assetType || "BOLD");
      break;
    case "ebisu":
    case "asymmetry":
    case "basedollar":
      symbols.push(c.row.collateralType, FORK_DEBT[c.kind]);
      break;
    default:
      break;
  }
  const keys = new Set<string>();
  for (const a of addresses) if (a) keys.add(assetKey(chain, a));
  for (const s of symbols) {
    if (!s) continue;
    for (const t of SCOPE_SYMBOLS.get(s.toLowerCase()) ?? [])
      if (t.chain === chain) keys.add(assetKey(t.chain, t.token));
  }
  return [...keys];
}
