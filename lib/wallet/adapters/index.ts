// The wallet view's fan-out (decision 0050, step 2; SERVER-ONLY): every
// family adapter in parallel, each under its own timeout. A family that does
// not answer in time, or fails, is reported as unread and the page renders
// without it. Step 3 replaces this with one route over `wallet_positions`.

import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import type { WalletFamilyResult, WalletPosition } from "@/lib/wallet/types";
import { walletReadContext, type WalletReadContext } from "@/lib/wallet/read-context";
import * as aaveV3 from "./aave-v3";
import * as compoundV3 from "./compound-v3";
import * as morpho from "./morpho";
import * as liquityV2 from "./liquity-v2";
import * as makerdao from "./makerdao";
import * as spark from "./spark";
import * as fluid from "./fluid";
import { readAaveV3Arbitrum, readCompoundV3Arbitrum, readMorphoArbitrum } from "./arbitrum";

/** How long one family may take before the page renders without it. */
export const FAMILY_TIMEOUT_MS = 8000;

interface FamilyAdapter {
  id: string;
  name: string;
  chain: ChainId;
  read: (address: string, ctx: WalletReadContext) => Promise<WalletPosition[]>;
}

/** In the decision's order of priority. */
export const WALLET_FAMILIES: FamilyAdapter[] = [
  { id: "aave-v3", name: "Aave V3", chain: MAINNET_CHAIN_ID, read: aaveV3.readWalletPositions },
  { id: "aave-v3-base", name: "Aave V3", chain: BASE_CHAIN_ID, read: aaveV3.readWalletPositionsBase },
  { id: "aave-v3-arbitrum", name: "Aave V3", chain: ARBITRUM_CHAIN_ID, read: readAaveV3Arbitrum },
  { id: "compound-v3", name: "Compound V3", chain: MAINNET_CHAIN_ID, read: compoundV3.readWalletPositions },
  { id: "compound-v3-base", name: "Compound V3", chain: BASE_CHAIN_ID, read: compoundV3.readWalletPositionsBase },
  { id: "compound-v3-arbitrum", name: "Compound V3", chain: ARBITRUM_CHAIN_ID, read: readCompoundV3Arbitrum },
  { id: "morpho", name: "Morpho Blue", chain: MAINNET_CHAIN_ID, read: morpho.readWalletPositions },
  { id: "morpho-arbitrum", name: "Morpho Blue", chain: ARBITRUM_CHAIN_ID, read: readMorphoArbitrum },
  { id: "liquity-v2", name: "Liquity V2", chain: MAINNET_CHAIN_ID, read: liquityV2.readWalletPositions },
  { id: "makerdao", name: "MakerDAO", chain: MAINNET_CHAIN_ID, read: makerdao.readWalletPositions },
  { id: "spark", name: "SparkLend", chain: MAINNET_CHAIN_ID, read: spark.readWalletPositions },
  { id: "fluid", name: "Fluid", chain: MAINNET_CHAIN_ID, read: fluid.readWalletPositions },
];

/** Every family's answer for one address, in registry order. */
export async function readWallet(address: string): Promise<WalletFamilyResult[]> {
  const settled = await Promise.allSettled(
    WALLET_FAMILIES.map(async (f): Promise<WalletFamilyResult> => {
      const t0 = Date.now();
      const abort = new AbortController();
      const ctx = await walletReadContext(abort.signal);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new Error(`no answer within ${FAMILY_TIMEOUT_MS / 1000} s`));
        }, FAMILY_TIMEOUT_MS);
      });
      try {
        const positions = await Promise.race([f.read(address, ctx), timeout]);
        return { id: f.id, name: f.name, chain: f.chain, ok: true, ms: Date.now() - t0, positions };
      } catch (err) {
        return {
          id: f.id,
          name: f.name,
          chain: f.chain,
          ok: false,
          ms: Date.now() - t0,
          positions: [],
          error: err instanceof Error ? err.message : String(err),
        };
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          id: WALLET_FAMILIES[i].id,
          name: WALLET_FAMILIES[i].name,
          chain: WALLET_FAMILIES[i].chain,
          ok: false,
          ms: 0,
          positions: [],
          error: String(s.reason),
        },
  );
}
