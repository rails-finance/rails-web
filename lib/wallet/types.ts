// One wallet's positions as the wallet view (/wallet/<address>) draws them,
// and the shape /api/chain/wallet/<address> answers: rails-ops
// decisions/0050-one-wallet-across-protocols-and-chains.md, step 3.
//
// Every position is one row of rails-server's wallet_positions (mig 395,
// GET /api/wallet/:address/positions): the figures the family's store states,
// and the family's listing row, which the family's listing builder turns into
// `card` here exactly as the family's listing proxy does. For an open
// position the route then reads the family's head state, one batched read per
// family: the risk figure, the buffer, dollars at the family's oracle now and
// the block. A field a family cannot fill stays undefined.

import type { ChainId } from "@/lib/shared/chains";
import type { ProvClass } from "@/components/shared/provenance";
import type { AaveV3PositionRow } from "@/lib/api/fetch-aave-v3-positions";
import type { AaveV4SpokePositionRow } from "@/lib/api/fetch-aave-v4-spoke-positions";
import type { ArcWalletRead } from "@/lib/aave-v4-arc/types";
import type { CompoundPositionSummary } from "@/lib/sources/api/compound-positions";
import type { CompoundV2PositionSummary } from "@/lib/sources/api/compound-v2-positions";
import type { MoonwellPositionSummary } from "@/lib/sources/api/moonwell-positions";
import type { LlamalendPositionSummary } from "@/lib/sources/api/llamalend-positions";
import type { SkyAsOf, SkyPosition } from "@/lib/sky-savings/types";
import type { EulerWalletCardRow } from "@/lib/euler/wallet-card";
import type { DolomitePositionSummary } from "@/lib/sources/api/dolomite-positions";
import type { MaplePositionSummary } from "@/lib/sources/api/maple-positions";
import type { FxPositionSummary } from "@/lib/sources/api/fx-positions";
import type { FrankencoinPositionSummary } from "@/lib/sources/api/frankencoin-positions";
import type { PwnPositionSummary } from "@/lib/sources/api/pwn-positions";
import type { PolarisPositionSummary } from "@/lib/sources/api/polaris-positions";
import type { PolarisDepositRow, PolarisLoanRow } from "@/lib/sources/api/polaris-sp-loans";
import type { PolarisMarketsChainResponse } from "@/lib/sources/chain/polaris-position";
import type { AlchemixStoredPositionSummary, AlchemixV2PositionSummary } from "@/types/api/alchemix";
import type { MorphoBaseVaultOwnerNote } from "@/lib/morpho-base/vault-owner-note";
import type { MorphoPositionSummary } from "@/lib/sources/api/morpho-positions";
import type { SparkPositionSummary } from "@/lib/sources/api/spark-positions";
import type { FluidPositionSummary } from "@/lib/sources/api/fluid-positions";
import type { MakerVaultSummary } from "@/lib/sources/api/makerdao-vaults";
import type { TroveSummary } from "@/types/api/trove";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import type { LiquityV1DepositRow } from "@/lib/sources/api/liquity-v1-sp";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import type { LiquityV1DepositChain } from "@/lib/api/fetch-liquity-v1-sp-chain";
import type { LiquityV2DepositChain } from "@/lib/api/fetch-liquity-v2-sp-chain";
import type { LiquityV1StakeChain } from "@/lib/api/fetch-liquity-v1-staking-chain";
import type { LiquityV1StakeRow } from "@/lib/sources/api/liquity-v1-staking";
import type { UsdPart } from "@/lib/wallet/deposit-claim";
import type { EbisuTroveSummary } from "@/lib/sources/api/ebisu-troves";
import type { AsymmetryTroveSummary } from "@/lib/sources/api/asymmetry-troves";
import type { BasedollarTroveSummary } from "@/lib/sources/api/basedollar-troves";
import type { OraclePricesData } from "@/types/api/oracle";
import type { ArbitrumReadRow } from "@/components/shared/arbitrum-positions-listing";
import type { CometCard } from "@/lib/compound-arbitrum/comet-cards";
import type { WalletKind } from "@/lib/wallet/wallet-filters";
import type { BranchShutdownState } from "@/lib/liquity-fork/shutdown";
import type { UniPositionRead } from "@/lib/uniswap/types";
import type { UniProtocol } from "@/lib/uniswap/deployments";
import type { AeroPositionRead } from "@/lib/aerodrome/types";
import type { BalPositionRead } from "@/lib/balancer/types";
import type { VaultPositionRow } from "@/lib/aave-vaults/vault-position";
import type { OpPositionRead } from "@/lib/aave-v3-optimism/types";
import type { OpcWalletRead } from "@/lib/compound-v3-optimism/types";
import type { MorphoAtBlockWalletRead } from "@/lib/morpho-at-block/types";

/** "redeemed" is in the type for the families that end a position by
 *  redemption; no store states it as an ending yet (a fully redeemed Liquity
 *  V2 Trove reads as closed or as a zombie). */
/** `moved`: a position the wallet held and passed to another wallet (a
 *  Liquity V2 Trove whose NFT it sent on; ui-jobs 705). */
export type WalletPositionStatus = "open" | "closed" | "liquidated" | "redeemed" | "moved";

/** The family's listing row, which its listing component turns into slots. */
export type WalletCard =
  | { kind: "aave-v3"; lane: "ethereum" | "base"; row: AaveV3PositionRow }
  | { kind: "aave-v3-arbitrum"; row: ArbitrumReadRow }
  | { kind: "aave-v4"; lane: "ethereum" | "base"; row: AaveV4SpokePositionRow; storedAtBlock?: number }
  /** One spoke of the Arc wallet read, as stored at its block. */
  | { kind: "aave-v4"; lane: "arc"; read: ArcWalletRead }
  | { kind: "compound-v3"; lane: "ethereum" | "base"; row: CompoundPositionSummary }
  /** One Comet of the wallet's stored read; no `comet` on a read that found
   *  nothing held. */
  | { kind: "compound-v3-arbitrum"; row: ArbitrumReadRow; comet?: CometCard }
  | { kind: "morpho"; row: MorphoPositionSummary }
  /** A Morpho Blue Base position. `read`: "listing" where the figures are the
   *  stored chain read at the row's block, "wallet" where the wallet page read
   *  the slots and the market at one head block. `vaultOwner`: the wallet is a
   *  catalogued MetaMorpho vault. */
  | {
      kind: "morpho-base";
      row: MorphoPositionSummary;
      read: "listing" | "wallet";
      vaultOwner: MorphoBaseVaultOwnerNote | null;
    }
  | { kind: "compound-v2"; row: CompoundV2PositionSummary }
  | { kind: "moonwell-base"; row: MoonwellPositionSummary }
  | { kind: "seamless"; row: AaveV3PositionRow }
  /** Moonwell on Ethereum: the Ethereum listing's row. */
  | { kind: "moonwell"; row: MoonwellPositionSummary }
  /** One Euler V2 Base (sub-account, vault) pair: the explorer's wallet read
   *  of it where the head read found it, the stored pair otherwise. */
  | { kind: "euler-v2"; row: EulerWalletCardRow }
  /** A Sky Savings holder: the listing's row and the sealed block its figures
   *  are at; `asOf` null on a closed holder, whose figures stand from its
   *  last event. */
  | { kind: "sky-savings"; row: SkyPosition; asOf: SkyAsOf | null }
  | { kind: "llamalend"; row: LlamalendPositionSummary }
  /** A Dolomite account: par from the store, in tokens at the market index
   *  where the head read answered. */
  | { kind: "dolomite"; row: DolomitePositionSummary }
  /** An Alchemix V3 position: the stored reading at its last band edge, or the
   *  listing's head reading. `lane` names the explorer it links to. */
  | { kind: "alchemix"; lane: "ethereum" | "base"; row: AlchemixStoredPositionSummary }
  /** An Alchemix V2 account: closed history, frozen at the wind-down. */
  | { kind: "alchemix-v2"; row: AlchemixV2PositionSummary }
  /** A Maple lender: pool shares from the store, with what they redeem for at
   *  the exit rate where the head read answered. */
  | { kind: "maple"; row: MaplePositionSummary }
  /** An f(x) position: getPosition at its last event, or the sweep's read
   *  where the head read answered. */
  | { kind: "fx"; row: FxPositionSummary }
  /** A Frankencoin position contract: the listing's row at its last
   *  MintingUpdate. A denied position keeps its status in the row. */
  | { kind: "frankencoin"; row: FrankencoinPositionSummary }
  /** One side of a PWN loan, the wallet its lender or its borrower: the
   *  listing's row. */
  | { kind: "pwn"; row: PwnPositionSummary }
  /** A Polaris CDP on Sepolia: the listing's row, with the market board where
   *  the head read answered, which gives the card its ratio. */
  | { kind: "polaris-cdp"; row: PolarisPositionSummary; markets: PolarisMarketsChainResponse | null }
  /** A Polaris reserve loan or Stability Pool deposit: the stored card holds
   *  the fields the listing card draws (mig 529), the head read the listing
   *  route's whole row (`via`). A loan's debt is at its last touch, or at the
   *  deployment's latest index on a listing row. */
  | {
      kind: "polaris-loan";
      row: PolarisLoanRow;
      via: "wallet" | "listing";
      /** The blocks its collateral, and its debt and cost, are at. */
      blocks: { coll?: number; debt?: number };
    }
  | { kind: "polaris-deposit"; row: PolarisDepositRow; via: "wallet" | "listing"; block?: number }
  | { kind: "morpho-arbitrum"; row: ArbitrumReadRow }
  | { kind: "spark"; row: SparkPositionSummary }
  | { kind: "fluid"; row: FluidPositionSummary }
  | { kind: "makerdao"; row: MakerVaultSummary }
  | { kind: "liquity-v2"; row: TroveSummary; prices: OraclePricesData | null }
  /** `head`: the deposit's head read on the wallet page, which its card
   *  shows in place of the last touch's figure. */
  | { kind: "liquity-v2-deposit"; row: LiquityV2DepositRow; head?: LiquityV2DepositChain }
  | { kind: "liquity-v1"; row: LiquityV1PositionSummary }
  | { kind: "liquity-v1-deposit"; row: LiquityV1DepositRow; head?: LiquityV1DepositChain }
  | { kind: "liquity-v1-stake"; row: LiquityV1StakeRow; head?: LiquityV1StakeChain }
  | { kind: "ebisu"; row: EbisuTroveSummary }
  | { kind: "asymmetry"; row: AsymmetryTroveSummary }
  | { kind: "basedollar"; row: BasedollarTroveSummary }
  /** A Liquity V2 fork's Stability Pool deposit: its deposit listing's row,
   *  as stored (no head read). */
  | { kind: "fork-deposit"; fork: "ebisu" | "asymmetry" | "basedollar"; row: LiquityV2DepositRow<string> }
  /** A liquidity position the wallet page reads at visit (W9, lib/wallet/liquidity/): its owner
   *  route's row at the head block as the read its explorer's card takes, drawn as a listing row. */
  | { kind: "uniswap"; protocol: UniProtocol; read: UniPositionRead }
  | { kind: "slipstream"; read: AeroPositionRead }
  | { kind: "balancer"; read: BalPositionRead }
  /** A vault-share holding (MetaMorpho, Yearn V3, Aave's vaults): the holder
   *  listing's row. `lane`: "census" where the visit read the holder's census
   *  answer (its figures at the census block), "stored" where the card holds
   *  the stored row alone (the balance since the last transfer). */
  | { kind: "vault"; row: VaultPositionRow; lane: "census" | "stored" }
  /** A family read at visit with no store (lib/wallet/families/visit.ts): its
   *  explorer's wallet read at the head block. An Aave V3 Optimism account; a
   *  Compound V3 Optimism answer holding one Comet; a Morpho Blue answer on
   *  Optimism or Arc holding one market. */
  | { kind: "aave-v3-optimism"; read: OpPositionRead }
  | { kind: "compound-v3-optimism"; read: OpcWalletRead }
  | { kind: "morpho-at-block"; dep: "optimism" | "arc"; read: MorphoAtBlockWalletRead };

/** A closed position's row in the History table: what the store states, each
 *  field absent where it states nothing. */
export interface WalletHistoryRow {
  /** Unix seconds: the last event, or the liquidation where the store dates it. */
  closedAt?: number;
  openedAt?: number;
  /** The position's size as the store gives it for a closed position. No
   *  family states the size at the close; this is the highest recorded. */
  size?: string;
  sizeNote?: string;
  /** The ending's result in the family's terms, where the store states one. */
  result?: string;
  resultNote?: string;
  txCount?: number;
  /** A moved position: the wallet it went to. */
  movedTo?: string;
}

/** How the route came by an open position's head figures. */
export type HeadRead =
  /** Read at head for this visit. */
  | "read"
  /** The family's read did not answer inside the budget: store figures only. */
  | "failed"
  /** The family's figures are its last stored read (the Arbitrum visit lane). */
  | "stored"
  /** Nothing to read: a closed position, or an open one with no debt where
   *  the family states no risk. */
  | "none";

export interface WalletPosition {
  chain: ChainId;
  /** The explorer slug (`aave-v3`, `liquity-v2`). */
  family: string;
  familyName: string;
  /** The market or branch the position sits in, for the risk tile and the
   *  History table ("Core", "WETH"). */
  market?: string;
  positionId: string;
  /** Null on a position with no page. */
  href: string | null;
  status: WalletPositionStatus;
  /** Trove, deposit, loan or vault, for the Kind pill (ui-jobs 738). */
  kind?: WalletKind;
  card: WalletCard;
  collateralUsd?: number;
  debtUsd?: number;
  /** Whose oracle the dollars are at (decision 0046). */
  usdSource?: string;
  /** The dollars are the family's own oracle's, so the tiles sum them
   *  (open point 7). Morpho Arbitrum's, at Aave's oracle, are shown on the
   *  card and kept out of the tiles. */
  usdOwnOracle?: boolean;
  /** The collateral price move, as a fraction, that starts liquidation;
   *  negative past it; undefined where the family cannot state it. A sort
   *  key: it ranks the cards and is never displayed (decision 0041). */
  buffer?: number;
  /** The class of the dollars' source on the receipts: the oracle unless set
   *  (a deposit's compounded amount, read from the pool at $1 face, is
   *  "state"). */
  usdClass?: ProvClass;
  /** The dollars' legs where they come from more than one source (a
   *  deposit's $1 face and its gain at a price feed): each a receipt row. */
  usdParts?: UsdPart[];
  /** The family's own risk figure, for the tile. */
  riskFigure?: { value: string; label: string };
  /** The family's own verdict that the position can be liquidated now
   *  (Compound's isLiquidatable, a health factor under 1). */
  liquidatable?: boolean;
  /** The debt's simple yearly rate as a fraction, where the family has one, so
   *  the Debt tile weights one form by `debtUsd`. A yearly rate the protocol
   *  stores is handed as stored; a per-second rate is handed times the seconds
   *  in a year (MakerDAO: (base + duty − 1) × seconds per year). Never
   *  compounded. */
  debtRate?: number;
  /** Collateral in dollars for the dust floor of the risk sort (open point
   *  5), where only a rank can be had: Morpho's collateral valued in a dollar
   *  stablecoin loan token. Ranks, never displayed. */
  dustUsd?: number;
  /** An Aave V3 Base account the chain has not been read for yet (open
   *  point 8), or an f(x) position with no boundary read stored that the head
   *  read could not fill: shown with a "not read" mark, outside the tiles and
   *  the sort. */
  notRead?: boolean;
  /** A Liquity-family Trove's or Stability Pool deposit's branch shutdown
   *  (ui-jobs 802): the catalog's record with the live read, from a Trove's
   *  head read or a deposit's shaping (lib/wallet/families/branch-shutdown.ts).
   *  Null where the branch reads live or unknown; absent where that read did
   *  not run (a Trove head that failed or timed out), and the card takes the
   *  catalog's record alone (`walletBranchState`). */
  shutdown?: BranchShutdownState | null;
  /** A stored open position the head read finds holding nothing (a Morpho
   *  Base pair repaid and withdrawn since the sweep, an Euler V2 Base pair
   *  the wallet read no longer finds): the head read's block.
   *  The card keeps the sweep's figures and its stamp says so. */
  closedSince?: { block: number };
  headRead: HeadRead;
  readAtBlock?: number;
  /** Unix seconds. */
  readAt?: number;
  history?: WalletHistoryRow;
}

/** One family's part of the answer. */
export interface WalletFamilyRead {
  id: string;
  name: string;
  chain: ChainId;
  positions: number;
  open: number;
  /** The head read over its open positions; "none" when it had none to read. */
  headRead: HeadRead;
  /** How long the family's shaping and head read took. */
  ms: number;
  /** Chain reads made for its open positions (multicalls or reader calls). */
  reads: number;
  error?: string;
  /** A listing read that did not answer (read-wallet.ts, readListingRows):
   *  the protocol's slug and what it would have read ("Liquity V1 Troves"). */
  /** `total: false` where the read cannot hold a position the wallet total
   *  needs: a fork's deposit read for a wallet holding nothing on that fork. */
  unanswered?: { family: string; what: string; total?: false };
  /** Positions the family read and the page does not draw (a module's
   *  `drawLimit`): the protocol's slug and how many open and closed. */
  undrawn?: { family: string; open: number; closed: number };
}

/** The answer of /api/chain/wallet/<address>. */
export interface WalletRead {
  address: string;
  positions: WalletPosition[];
  families: WalletFamilyRead[];
  /** Rows the summary table holds for the address, and the positions read
   *  at visit. */
  total: number;
  /** Unix seconds the answer was assembled. */
  readAt: number;
  /** The server route's time and the whole route's, for the report. */
  serverMs: number;
  ms: number;
  /** Set when the summary route did not answer: the page says so. */
  error?: string;
  /** The protocol the read was narrowed to (`?protocol=`); unset for every
   *  protocol. */
  protocol?: string;
  /** Every protocol the summary rows and the positions read at visit name, with its count, for the
   *  Protocol pill: a narrowed read still offers the others. */
  held: { slug: string; name: string; positions: number }[];
  /** The listing reads that did not answer, by what they read: the answer
   *  is part of the wallet, states no wallet total and is not kept. */
  partial?: string[];
}

/** One owner route's part of the Liquidity section (W9): how it answered, how many positions
 *  holding liquidity it named, and how many of those the section draws. */
export interface LiquiditySourceRead {
  /** `uniswap:8453`, `balancer:1` (lib/wallet/liquidity/sources.ts). */
  key: string;
  /** "Uniswap V3 and V4 on Ethereum". */
  what: string;
  chainId: ChainId;
  /** "ok", or why it did not answer: the read ceiling's 503, a Balancer index refusal, a failure. */
  state: "ok" | "ceiling" | "refused" | "failed";
  /** The route answered part of the wallet's positions (`truncated`). */
  truncated: boolean;
  /** Positions holding liquidity the route named. */
  held: number;
  /** Their cards drawn; `held - drawn - failed` are past the answer's `headRows`, which carry no
   *  head fields by design. */
  drawn: number;
  /** Rows before `headRows` without their head fields: a row read that failed. */
  failed: number;
  /** The rows the answer reads at the head (its `headRows`, 25). */
  headRows: number;
  /** The explorer's wallet page, which lists every position. */
  href: string;
  /** The explorer's name on that chain, for the lines under the section. */
  name: string;
  chainName: string;
  ms: number;
}

/** The Liquidity section's read: every owner route, then each position's card read. */
export interface WalletLiquidity {
  positions: WalletPosition[];
  sources: LiquiditySourceRead[];
  ms: number;
}
