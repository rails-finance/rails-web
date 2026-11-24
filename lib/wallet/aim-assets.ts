// The assets a wallet position names, for AIM (asset isolation mode, ui-jobs
// 557): the wallet view keeps a position only where one of these is in the AIM
// set. MOCK FIRST CUT, per card kind, from what each listing row already
// carries; the full form is a per-family extractor (item 560).
//
//   morpho, morpho-base    loan + collateral token addresses
//   moonwell-base, moonwell  each supplied and borrowed market's underlying address
//   euler-v2               the asset of the pair's vault, where the head read names it
//   sky-savings            USDS
//   llamalend              the market's collateral and borrowed symbols
//   compound-v2            each supplied, borrowed and peak market's symbol
//   dolomite               each supplied, borrowed and peak market's symbol
//   alchemix               the synthetic, and the vault's underlying where the card names it
//   alchemix-v2            the synthetic
//   maple                  each held or peak pool's asset symbol
//   fx                     the pool's collateral token symbol, and fxUSD
//   frankencoin            the collateral token's address, and ZCHF
//   pwn                    the collateral and credit addresses of the loan's ERC20 legs
//   vault                  the vault's asset: its address where the census header names it, else its symbol
//   polaris-*              nothing: AIM's universe has no Sepolia token
//   compound-v3            base token + each collateral line's address
//   spark                  each supplied and borrowed reserve's address (peaks for a closed one)
//   aave-v3, seamless      the dominant supply and debt addresses only (the row carries counts, not the list)
//   fluid                  supply and borrow symbols
//   makerdao               the ilk's collateral symbol, and DAI
//   liquity-v2             collateral symbol, and the row's debt symbol (BOLD)
//   liquity-v2-deposit     BOLD, and the branch's collateral symbol (its gains)
//   liquity-v1             ETH and LUSD
//   liquity-v1-deposit     LUSD, and ETH (its gains)
//   liquity-v1-stake       LQTY, and LUSD and ETH (its fees)
//   ebisu / asymmetry / basedollar   collateral symbol, and the fork's debt symbol
//   the three Arbitrum kinds         nothing: AIM's universe has no Arbitrum token
//   aave-v3-optimism       each reserve the account holds
//   compound-v3-optimism   the Comet's base token and each collateral held
//   morpho-at-block        the market's loan and collateral tokens
//   uniswap, slipstream    the pool's two tokens (the native coin as AIM's native key)
//   balancer               each of the pool's tokens
//
// A symbol resolves to the AIM chooser's tokens of that symbol on the
// position's chain (SCOPE_SYMBOLS).

import { assetKey } from "@/lib/shared/asset-family";
import { SCOPE_SYMBOLS } from "@/lib/shared/asset-scope";
import type { WalletPosition } from "@/lib/wallet/types";
import { poolTokenKeys } from "@/components/protocol/uniswap/pool-focus-keys";

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
    case "morpho-base":
      addresses.push(c.row.loanToken, c.row.collateralToken);
      break;
    case "moonwell-base":
    case "moonwell":
      for (const r of [...c.row.supplies, ...c.row.borrows]) addresses.push(r.address);
      break;
    case "compound-v2":
      for (const r of [...c.row.supplies, ...c.row.borrows, ...c.row.peakSupplies, ...c.row.peakBorrows])
        symbols.push(r.symbol);
      break;
    case "compound-v3":
      addresses.push(c.row.base.address, ...c.row.collateral.map((a) => a.address));
      break;
    case "spark":
      for (const r of [...c.row.supplies, ...c.row.borrows, ...c.row.peakSupplies, ...c.row.peakBorrows])
        addresses.push(r.address);
      break;
    case "aave-v3":
    case "seamless":
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
    case "liquity-v2-deposit":
      symbols.push("BOLD", c.row.collateral_type);
      break;
    case "fork-deposit":
      symbols.push(FORK_DEBT[c.fork], c.row.collateral_type);
      break;
    case "liquity-v1":
    case "liquity-v1-deposit":
      symbols.push("LUSD", "ETH");
      break;
    case "liquity-v1-stake":
      symbols.push("LQTY", "LUSD", "ETH");
      break;
    case "ebisu":
    case "asymmetry":
    case "basedollar":
      symbols.push(c.row.collateralType, FORK_DEBT[c.kind]);
      break;
    case "euler-v2": {
      const r = c.row.read;
      addresses.push((r?.deposit ?? r?.loan)?.asset.address);
      break;
    }
    case "sky-savings":
      symbols.push("USDS");
      break;
    case "llamalend":
      symbols.push(c.row.collateralSymbol, c.row.borrowedSymbol);
      break;
    case "uniswap":
    case "slipstream":
      return poolTokenKeys(chain, [c.read.token0, c.read.token1]);
    case "balancer":
      for (const t of c.read.tokens) addresses.push(t.address);
      break;
    case "dolomite":
      for (const r of [...c.row.supplies, ...c.row.borrows, ...c.row.peakSupplies, ...c.row.peakBorrows])
        symbols.push(r.symbol);
      break;
    case "alchemix":
      symbols.push(c.row.syntheticSymbol, c.row.figures.collateral?.underlying?.symbol);
      break;
    case "alchemix-v2":
      symbols.push(c.row.syntheticSymbol);
      break;
    case "maple":
      for (const r of [...c.row.pools, ...c.row.peakPools]) symbols.push(r.assetSymbol);
      break;
    case "fx":
      symbols.push(c.row.poolSymbol, "fxUSD");
      break;
    case "frankencoin":
      addresses.push(c.row.collateralToken);
      symbols.push("ZCHF");
      break;
    case "pwn":
      for (const a of [c.row.collateral, c.row.credit]) if (a?.category === "ERC20") addresses.push(a.address);
      break;
    case "vault":
      addresses.push(c.row.asset?.address ?? c.row.value.asset);
      symbols.push(c.row.asset?.symbol ?? c.row.value.assetSymbol);
      break;
    case "aave-v3-optimism":
      for (const r of c.read.reserves) if (r.scaledSupply !== "0" || r.scaledDebt !== "0") addresses.push(r.asset);
      break;
    case "compound-v3-optimism":
      for (const a of c.read.comets) addresses.push(a.baseToken, ...a.collateral.map((x) => x.asset));
      break;
    case "morpho-at-block":
      // An idle market's collateral is the zero address.
      for (const m of c.read.positions)
        addresses.push(m.loanToken, /^0x0+$/.test(m.collateralToken) ? null : m.collateralToken);
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
