// Fluid VaultResolver — the positionByNftId ABI fragment, verbatim from the
// canonical deployment artifact (Instadapp/fluid-contracts-public,
// deployments/mainnet/VaultResolver.json — the artifact's address field matches
// the deployed resolver in FLUID_ADDRESSES.VAULT_RESOLVER). One call returns
// the position's SETTLED state (the resolver runs fetchLatestPosition — the
// vault's own liquidation-settlement math — and applies live exchange prices)
// plus the whole VaultEntireData block: constants, Configs (collateralFactor /
// liquidationThreshold / liquidationMaxLimit / liquidationPenalty, the vault's
// oracle and its debt-per-col prices), exchange prices and rates, totals.
// Decode verified live against nft 980 (weETH/USDC vault #9) — see
// scripts/verify-fluid-chain.mjs.

export const FLUID_VAULT_RESOLVER_ABI = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "nftId_",
        type: "uint256",
      },
    ],
    name: "positionByNftId",
    outputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "nftId",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "owner",
            type: "address",
          },
          {
            internalType: "bool",
            name: "isLiquidated",
            type: "bool",
          },
          {
            internalType: "bool",
            name: "isSupplyPosition",
            type: "bool",
          },
          {
            internalType: "int256",
            name: "tick",
            type: "int256",
          },
          {
            internalType: "uint256",
            name: "tickId",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "beforeSupply",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "beforeBorrow",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "beforeDustBorrow",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "supply",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "borrow",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "dustBorrow",
            type: "uint256",
          },
        ],
        internalType: "struct Structs.UserPosition",
        name: "userPosition_",
        type: "tuple",
      },
      {
        components: [
          {
            internalType: "address",
            name: "vault",
            type: "address",
          },
          {
            internalType: "bool",
            name: "isSmartCol",
            type: "bool",
          },
          {
            internalType: "bool",
            name: "isSmartDebt",
            type: "bool",
          },
          {
            components: [
              {
                internalType: "address",
                name: "liquidity",
                type: "address",
              },
              {
                internalType: "address",
                name: "factory",
                type: "address",
              },
              {
                internalType: "address",
                name: "operateImplementation",
                type: "address",
              },
              {
                internalType: "address",
                name: "adminImplementation",
                type: "address",
              },
              {
                internalType: "address",
                name: "secondaryImplementation",
                type: "address",
              },
              {
                internalType: "address",
                name: "deployer",
                type: "address",
              },
              {
                internalType: "address",
                name: "supply",
                type: "address",
              },
              {
                internalType: "address",
                name: "borrow",
                type: "address",
              },
              {
                components: [
                  {
                    internalType: "address",
                    name: "token0",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "token1",
                    type: "address",
                  },
                ],
                internalType: "struct IFluidVault.Tokens",
                name: "supplyToken",
                type: "tuple",
              },
              {
                components: [
                  {
                    internalType: "address",
                    name: "token0",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "token1",
                    type: "address",
                  },
                ],
                internalType: "struct IFluidVault.Tokens",
                name: "borrowToken",
                type: "tuple",
              },
              {
                internalType: "uint256",
                name: "vaultId",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "vaultType",
                type: "uint256",
              },
              {
                internalType: "bytes32",
                name: "supplyExchangePriceSlot",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "borrowExchangePriceSlot",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "userSupplySlot",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "userBorrowSlot",
                type: "bytes32",
              },
            ],
            internalType: "struct IFluidVault.ConstantViews",
            name: "constantVariables",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint16",
                name: "supplyRateMagnifier",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "borrowRateMagnifier",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "collateralFactor",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "liquidationThreshold",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "liquidationMaxLimit",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "withdrawalGap",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "liquidationPenalty",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "borrowFee",
                type: "uint16",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "oraclePriceOperate",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "oraclePriceLiquidate",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "rebalancer",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lastUpdateTimestamp",
                type: "uint256",
              },
            ],
            internalType: "struct Structs.Configs",
            name: "configs",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "lastStoredLiquiditySupplyExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastStoredLiquidityBorrowExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastStoredVaultSupplyExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastStoredVaultBorrowExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "liquiditySupplyExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "liquidityBorrowExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "vaultSupplyExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "vaultBorrowExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "supplyRateLiquidity",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowRateLiquidity",
                type: "uint256",
              },
              {
                internalType: "int256",
                name: "supplyRateVault",
                type: "int256",
              },
              {
                internalType: "int256",
                name: "borrowRateVault",
                type: "int256",
              },
              {
                internalType: "int256",
                name: "rewardsOrFeeRateSupply",
                type: "int256",
              },
              {
                internalType: "int256",
                name: "rewardsOrFeeRateBorrow",
                type: "int256",
              },
            ],
            internalType: "struct Structs.ExchangePricesAndRates",
            name: "exchangePricesAndRates",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "totalSupplyVault",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalBorrowVault",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalSupplyLiquidityOrDex",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalBorrowLiquidityOrDex",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "absorbedSupply",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "absorbedBorrow",
                type: "uint256",
              },
            ],
            internalType: "struct Structs.TotalSupplyAndBorrow",
            name: "totalSupplyAndBorrow",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "withdrawLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "withdrawableUntilLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "withdrawable",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowableUntilLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowable",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowLimitUtilization",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "minimumBorrowing",
                type: "uint256",
              },
            ],
            internalType: "struct Structs.LimitsAndAvailability",
            name: "limitsAndAvailability",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "totalPositions",
                type: "uint256",
              },
              {
                internalType: "int256",
                name: "topTick",
                type: "int256",
              },
              {
                internalType: "uint256",
                name: "currentBranch",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalBranch",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalBorrow",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalSupply",
                type: "uint256",
              },
              {
                components: [
                  {
                    internalType: "uint256",
                    name: "status",
                    type: "uint256",
                  },
                  {
                    internalType: "int256",
                    name: "minimaTick",
                    type: "int256",
                  },
                  {
                    internalType: "uint256",
                    name: "debtFactor",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "partials",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "debtLiquidity",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "baseBranchId",
                    type: "uint256",
                  },
                  {
                    internalType: "int256",
                    name: "baseBranchMinima",
                    type: "int256",
                  },
                ],
                internalType: "struct Structs.CurrentBranchState",
                name: "currentBranchState",
                type: "tuple",
              },
            ],
            internalType: "struct Structs.VaultState",
            name: "vaultState",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "bool",
                name: "modeWithInterest",
                type: "bool",
              },
              {
                internalType: "uint256",
                name: "supply",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "withdrawalLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastUpdateTimestamp",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expandPercent",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expandDuration",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "baseWithdrawalLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "withdrawableUntilLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "withdrawable",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "decayEndTimestamp",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "decayAmount",
                type: "uint256",
              },
            ],
            internalType: "struct Structs.UserSupplyData",
            name: "liquidityUserSupplyData",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "bool",
                name: "modeWithInterest",
                type: "bool",
              },
              {
                internalType: "uint256",
                name: "borrow",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastUpdateTimestamp",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expandPercent",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expandDuration",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "baseBorrowLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxBorrowLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowableUntilLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowable",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowLimitUtilization",
                type: "uint256",
              },
            ],
            internalType: "struct Structs.UserBorrowData",
            name: "liquidityUserBorrowData",
            type: "tuple",
          },
        ],
        internalType: "struct Structs.VaultEntireData",
        name: "vaultData_",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "nftId_",
        type: "uint256",
      },
    ],
    name: "vaultByNftId",
    outputs: [
      {
        internalType: "address",
        name: "vault_",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  // getVaultsEntireData() — the whole vault roster in ONE eth_call (181 at
  // build time). Same VaultEntireData block positionByNftId returns as its
  // second output, arrayed over every vault the factory has minted. Backs the
  // protocol view (/fluid/vaults). Fragment emitted verbatim from the deployed
  // resolver's verified ABI, not hand-written.
  {
    inputs: [],
    name: "getVaultsEntireData",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "vault",
            type: "address",
          },
          {
            internalType: "bool",
            name: "isSmartCol",
            type: "bool",
          },
          {
            internalType: "bool",
            name: "isSmartDebt",
            type: "bool",
          },
          {
            components: [
              {
                internalType: "address",
                name: "liquidity",
                type: "address",
              },
              {
                internalType: "address",
                name: "factory",
                type: "address",
              },
              {
                internalType: "address",
                name: "operateImplementation",
                type: "address",
              },
              {
                internalType: "address",
                name: "adminImplementation",
                type: "address",
              },
              {
                internalType: "address",
                name: "secondaryImplementation",
                type: "address",
              },
              {
                internalType: "address",
                name: "deployer",
                type: "address",
              },
              {
                internalType: "address",
                name: "supply",
                type: "address",
              },
              {
                internalType: "address",
                name: "borrow",
                type: "address",
              },
              {
                components: [
                  {
                    internalType: "address",
                    name: "token0",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "token1",
                    type: "address",
                  },
                ],
                internalType: "struct IFluidVault.Tokens",
                name: "supplyToken",
                type: "tuple",
              },
              {
                components: [
                  {
                    internalType: "address",
                    name: "token0",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "token1",
                    type: "address",
                  },
                ],
                internalType: "struct IFluidVault.Tokens",
                name: "borrowToken",
                type: "tuple",
              },
              {
                internalType: "uint256",
                name: "vaultId",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "vaultType",
                type: "uint256",
              },
              {
                internalType: "bytes32",
                name: "supplyExchangePriceSlot",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "borrowExchangePriceSlot",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "userSupplySlot",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "userBorrowSlot",
                type: "bytes32",
              },
            ],
            internalType: "struct IFluidVault.ConstantViews",
            name: "constantVariables",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint16",
                name: "supplyRateMagnifier",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "borrowRateMagnifier",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "collateralFactor",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "liquidationThreshold",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "liquidationMaxLimit",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "withdrawalGap",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "liquidationPenalty",
                type: "uint16",
              },
              {
                internalType: "uint16",
                name: "borrowFee",
                type: "uint16",
              },
              {
                internalType: "address",
                name: "oracle",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "oraclePriceOperate",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "oraclePriceLiquidate",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "rebalancer",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "lastUpdateTimestamp",
                type: "uint256",
              },
            ],
            internalType: "struct Structs.Configs",
            name: "configs",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "lastStoredLiquiditySupplyExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastStoredLiquidityBorrowExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastStoredVaultSupplyExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastStoredVaultBorrowExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "liquiditySupplyExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "liquidityBorrowExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "vaultSupplyExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "vaultBorrowExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "supplyRateLiquidity",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowRateLiquidity",
                type: "uint256",
              },
              {
                internalType: "int256",
                name: "supplyRateVault",
                type: "int256",
              },
              {
                internalType: "int256",
                name: "borrowRateVault",
                type: "int256",
              },
              {
                internalType: "int256",
                name: "rewardsOrFeeRateSupply",
                type: "int256",
              },
              {
                internalType: "int256",
                name: "rewardsOrFeeRateBorrow",
                type: "int256",
              },
            ],
            internalType: "struct Structs.ExchangePricesAndRates",
            name: "exchangePricesAndRates",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "totalSupplyVault",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalBorrowVault",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalSupplyLiquidityOrDex",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalBorrowLiquidityOrDex",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "absorbedSupply",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "absorbedBorrow",
                type: "uint256",
              },
            ],
            internalType: "struct Structs.TotalSupplyAndBorrow",
            name: "totalSupplyAndBorrow",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "withdrawLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "withdrawableUntilLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "withdrawable",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowableUntilLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowable",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowLimitUtilization",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "minimumBorrowing",
                type: "uint256",
              },
            ],
            internalType: "struct Structs.LimitsAndAvailability",
            name: "limitsAndAvailability",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "totalPositions",
                type: "uint256",
              },
              {
                internalType: "int256",
                name: "topTick",
                type: "int256",
              },
              {
                internalType: "uint256",
                name: "currentBranch",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalBranch",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalBorrow",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalSupply",
                type: "uint256",
              },
              {
                components: [
                  {
                    internalType: "uint256",
                    name: "status",
                    type: "uint256",
                  },
                  {
                    internalType: "int256",
                    name: "minimaTick",
                    type: "int256",
                  },
                  {
                    internalType: "uint256",
                    name: "debtFactor",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "partials",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "debtLiquidity",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "baseBranchId",
                    type: "uint256",
                  },
                  {
                    internalType: "int256",
                    name: "baseBranchMinima",
                    type: "int256",
                  },
                ],
                internalType: "struct Structs.CurrentBranchState",
                name: "currentBranchState",
                type: "tuple",
              },
            ],
            internalType: "struct Structs.VaultState",
            name: "vaultState",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "bool",
                name: "modeWithInterest",
                type: "bool",
              },
              {
                internalType: "uint256",
                name: "supply",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "withdrawalLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastUpdateTimestamp",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expandPercent",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expandDuration",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "baseWithdrawalLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "withdrawableUntilLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "withdrawable",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "decayEndTimestamp",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "decayAmount",
                type: "uint256",
              },
            ],
            internalType: "struct Structs.UserSupplyData",
            name: "liquidityUserSupplyData",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "bool",
                name: "modeWithInterest",
                type: "bool",
              },
              {
                internalType: "uint256",
                name: "borrow",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastUpdateTimestamp",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expandPercent",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "expandDuration",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "baseBorrowLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxBorrowLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowableUntilLimit",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowable",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowLimitUtilization",
                type: "uint256",
              },
            ],
            internalType: "struct Structs.UserBorrowData",
            name: "liquidityUserBorrowData",
            type: "tuple",
          },
        ],
        internalType: "struct Structs.VaultEntireData[]",
        name: "vaultsData_",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
