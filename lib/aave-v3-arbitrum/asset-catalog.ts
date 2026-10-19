// Aave V3 on Arbitrum One — the market's identity and its reserve roster.
// ----------------------------------------------------------------------------
// Like the Base catalog (lib/aave-v3-base/asset-catalog.ts), nothing here is a
// copied governance table: LTV, thresholds and bonuses decode from each
// reserve's configuration word, symbols and decimals come from the tokens, and
// USD from the oracle the Pool liquidates with. What is written down is which
// contracts are the market, read back from the protocol's own registry
// (rails-ops TO-DO-arbitrum-scoping.md §3):
//
//   PoolAddressesProvider 0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb
//     getPool()        → 0x794a61358D6845594F94dc1DB02A252b5b4814aD (the Pool)
//     getPriceOracle() → 0xb56c2F0B653B2e0b10C9b928C8580Ac5Df02C7C7, equal to
//                        the address book's; BASE_CURRENCY the zero address,
//                        BASE_CURRENCY_UNIT 1e8 (USD, 8 decimals).
//   Read through Tenderly's Arbitrum gateway at block 516,330,518 (2026-10-19).
//
// TWO RESERVES SHARE THE SYMBOL "USDC". Both tokens answer `symbol()` with
// "USDC" (read at the same block): the bridged one at 0xff97…5cc8 and Circle's
// native one at 0xaf88…5831. Every map below keys on the underlying address,
// and `AAVE_V3_ARBITRUM_SYMBOL_BY_ADDR` names the bridged one USDC.e wherever a
// symbol is printed.

import { ARBITRUM_CHAIN_ID } from "@/lib/shared/chains";

/** The Aave V3 Pool on Arbitrum One. */
export const AAVE_V3_ARBITRUM_POOL = "0x794a61358d6845594f94dc1db02a252b5b4814ad" as const;

/** The IAaveOracle this Pool prices collateral and debt with (USD, 8 decimals). */
export const AAVE_V3_ARBITRUM_ORACLE = "0xb56c2f0b653b2e0b10c9b928c8580ac5df02c7c7" as const;

/** The chain every address here lives on. */
export const AAVE_V3_ARBITRUM_CHAIN_ID = ARBITRUM_CHAIN_ID;

/** The Pool proxy's creation block (2022-03-11). The history rails-server
 *  serves runs from here, which is what lets it claim a whole life. */
export const AAVE_V3_ARBITRUM_DEPLOY_BLOCK = 7_742_429;

/** The block of this Pool's first DeficitCreated log (2025-02-27), read from
 *  Etherscan's log index from block 0 and confirmed on Tenderly as the only one
 *  in [309,500,000, 310,354,479]. A liquidation from here on can end with the
 *  Pool burning debt the timeline's rows do not carry. */
export const AAVE_V3_ARBITRUM_FIRST_WRITE_OFF_BLOCK = 310_354_479;

/** One reserve: the underlying and its two tokens. Stable debt tokens are left
 *  out: stable borrowing is retired on this version. */
interface AaveV3ArbitrumReserve {
  symbol: string;
  underlying: string;
  aToken: string;
  variableDebtToken: string;
}

/** The Pool's twenty reserves in `getReservesList` order, read back on
 *  2026-10-19 (TO-DO-arbitrum-scoping.md §3). Nine are frozen; a frozen reserve
 *  still shows on a position that holds it. */
const RESERVES: readonly AaveV3ArbitrumReserve[] = [
  {
    symbol: "DAI",
    underlying: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
    aToken: "0x82e64f49ed5ec1bc6e43dad4fc8af9bb3a2312ee",
    variableDebtToken: "0x8619d80fb0141ba7f184cbf22fd724116d9f7ffc",
  },
  {
    symbol: "LINK",
    underlying: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4",
    aToken: "0x191c10aa4af7c30e871e70c95db0e4eb77237530",
    variableDebtToken: "0x953a573793604af8d41f306feb8274190db4ae0e",
  },
  {
    symbol: "USDC.e",
    underlying: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
    aToken: "0x625e7708f30ca75bfd92586e17077590c60eb4cd",
    variableDebtToken: "0xfccf3cabbe80101232d343252614b6a3ee81c989",
  },
  {
    symbol: "WBTC",
    underlying: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
    aToken: "0x078f358208685046a11c85e8ad32895ded33a249",
    variableDebtToken: "0x92b42c66840c7ad907b4bf74879ff3ef7c529473",
  },
  {
    symbol: "WETH",
    underlying: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    aToken: "0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8",
    variableDebtToken: "0x0c84331e39d6658cd6e6b9ba04736cc4c4734351",
  },
  {
    symbol: "USD₮0",
    underlying: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
    aToken: "0x6ab707aca953edaefbc4fd23ba73294241490620",
    variableDebtToken: "0xfb00ac187a8eb5afae4eace434f493eb62672df7",
  },
  {
    symbol: "AAVE",
    underlying: "0xba5ddd1f9d7f570dc94a51479a000e3bce967196",
    aToken: "0xf329e36c7bf6e5e86ce2150875a84ce77f477375",
    variableDebtToken: "0xe80761ea617f66f96274ea5e8c37f03960ecc679",
  },
  {
    symbol: "EURS",
    underlying: "0xd22a58f79e9481d1a88e00c343885a588b34b68b",
    aToken: "0x6d80113e533a2c0fe82eabd35f1875dcea89ea97",
    variableDebtToken: "0x4a1c3ad6ed28a636ee1751c69071f6be75deb8b8",
  },
  {
    symbol: "wstETH",
    underlying: "0x5979d7b546e38e414f7e9822514be443a4800529",
    aToken: "0x513c7e3a9c69ca3e22550ef58ac1c0088e918fff",
    variableDebtToken: "0x77ca01483f379e58174739308945f044e1a764dc",
  },
  {
    symbol: "MAI",
    underlying: "0x3f56e0c36d275367b8c502090edf38289b3dea0d",
    aToken: "0xc45a479877e1e9dfe9fcd4056c699575a1045daa",
    variableDebtToken: "0x34e2ed44ef7466d5f9e0b782b5c08b57475e7907",
  },
  {
    symbol: "rETH",
    underlying: "0xec70dcb4a1efa46b8f2d97c310c9c4790ba5ffa8",
    aToken: "0x8eb270e296023e9d92081fdf967ddd7878724424",
    variableDebtToken: "0xce186f6cccb0c955445bb9d10c59cae488fea559",
  },
  {
    symbol: "LUSD",
    underlying: "0x93b346b6bc2548da6a1e7d98e9a421b42541425b",
    aToken: "0x8ffdf2de812095b1d19cb146e4c004587c0a0692",
    variableDebtToken: "0xa8669021776bc142dfca87c21b4a52595bcbb40a",
  },
  {
    symbol: "USDC",
    underlying: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    aToken: "0x724dc807b04555b71ed48a6896b6f41593b8c637",
    variableDebtToken: "0xf611aeb5013fd2c0511c9cd55c7dc5c1140741a6",
  },
  {
    symbol: "FRAX",
    underlying: "0x17fc002b466eec40dae837fc4be5c67993ddbd6f",
    aToken: "0x38d693ce1df5aadf7bc62595a37d667ad57922e5",
    variableDebtToken: "0x5d557b07776d12967914379c71a1310e917c7555",
  },
  {
    symbol: "ARB",
    underlying: "0x912ce59144191c1204e64559fe8253a0e49e6548",
    aToken: "0x6533afac2e7bccb20dca161449a13a32d391fb00",
    variableDebtToken: "0x44705f578135cc5d703b4c9c122528c73eb87145",
  },
  {
    symbol: "weETH",
    underlying: "0x35751007a407ca6feffe80b3cb397736d2cf4dbe",
    aToken: "0x8437d7c167dfb82ed4cb79cd44b7a32a1dd95c77",
    variableDebtToken: "0x3ca5fa07689f266e907439afd1fbb59c44fe12f6",
  },
  {
    symbol: "GHO",
    underlying: "0x7dff72693f6a4149b17e7c6314655f6a9f7c8b33",
    aToken: "0xebe517846d0f36eced99c735cbf6131e1feb775d",
    variableDebtToken: "0x18248226c16bf76c032817854e7c83a2113b4f06",
  },
  {
    symbol: "ezETH",
    underlying: "0x2416092f143378750bb29b79ed961ab195cceea5",
    aToken: "0xea1132120ddcdda2f119e99fa7a27a0d036f7ac9",
    variableDebtToken: "0x1ffd28689da7d0148ff0fcb669e9f9f0fc13a219",
  },
  {
    symbol: "rsETH",
    underlying: "0x4186bfc76e2e237523cbc30fd220fe055156b41f",
    aToken: "0x6b030ff3fb9956b1b69f475b77ae0d3cf2cc5afa",
    variableDebtToken: "0x80ca0d8c38d2e2bcbab66aa1648bd1c7160500fe",
  },
  {
    symbol: "tBTC",
    underlying: "0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40",
    aToken: "0x62fc96b27a510cf4977b59ff952dc32378cc221d",
    variableDebtToken: "0xb5b46f918c2923fc7f26db76e8a6a6e9c4347cf9",
  },
];

/** The symbol each reserve prints, keyed on the lowercase underlying. Equal to
 *  the token's own `symbol()` on all but the bridged USDC, which prints USDC.e
 *  so the two USDC reserves read apart. */
export const AAVE_V3_ARBITRUM_SYMBOL_BY_ADDR: Record<string, string> = Object.fromEntries(
  RESERVES.map((r) => [r.underlying, r.symbol]),
);
