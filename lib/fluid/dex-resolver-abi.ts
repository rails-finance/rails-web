// Fluid DexResolver — the getDexEntireDatas ABI fragment, emitted verbatim from the
// deployed resolver's verified ABI (0x11D80CfF056Cef4F9E6d23da8672fE9873e5cC07 —
// the mainnet row of Instadapp/fluid-contracts-public deployments/deployments.md;
// its 4th constructor arg is the deployerContract each DEX pool names in its own
// constantsView, which is what identifies it as the right resolver).
//
// Why this and not the pool: FluidDexT1.getPricesAndExchangePrices() REVERTS by
// design and the node returns no revert payload, so a DEX pool cannot be read
// directly. The resolver is the only way in.
//
// Why the batch-by-address form and not getAllDexEntireDatas(): that enumeration
// is a FLOOR — it answers for 48 dexes and misses 3 of the 40 our vaults actually
// name, including vault 34's, which answers perfectly well when asked for by
// address. Every vault names its own pools in constantVariables.supply/borrow, so
// we ask for exactly those and never enumerate. (Same lesson as MakerDAO's
// IlkRegistry.list().)
//
// Deployed recently: NO bytecode at 19371412 / 21000000 / 23550009, present by
// 25243578. It can answer at HEAD only — never at a historical fire block.

export const FLUID_DEX_RESOLVER_ABI = [
  {
    inputs: [
      {
        internalType: "address[]",
        name: "dexes_",
        type: "address[]",
      },
    ],
    name: "getDexEntireDatas",
    outputs: [
      {
        components: [
          {
            internalType: "address",
            name: "dex",
            type: "address",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "dexId",
                type: "uint256",
              },
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
                components: [
                  {
                    internalType: "address",
                    name: "shift",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "admin",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "colOperations",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "debtOperations",
                    type: "address",
                  },
                  {
                    internalType: "address",
                    name: "perfectOperationsAndOracle",
                    type: "address",
                  },
                ],
                internalType: "struct IFluidDexT1.Implementations",
                name: "implementations",
                type: "tuple",
              },
              {
                internalType: "address",
                name: "deployerContract",
                type: "address",
              },
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
              {
                internalType: "bytes32",
                name: "supplyToken0Slot",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "borrowToken0Slot",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "supplyToken1Slot",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "borrowToken1Slot",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "exchangePriceToken0Slot",
                type: "bytes32",
              },
              {
                internalType: "bytes32",
                name: "exchangePriceToken1Slot",
                type: "bytes32",
              },
              {
                internalType: "uint256",
                name: "oracleMapping",
                type: "uint256",
              },
            ],
            internalType: "struct IFluidDexT1.ConstantViews",
            name: "constantViews",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "token0NumeratorPrecision",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token0DenominatorPrecision",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token1NumeratorPrecision",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token1DenominatorPrecision",
                type: "uint256",
              },
            ],
            internalType: "struct IFluidDexT1.ConstantViews2",
            name: "constantViews2",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "bool",
                name: "isSmartCollateralEnabled",
                type: "bool",
              },
              {
                internalType: "bool",
                name: "isSmartDebtEnabled",
                type: "bool",
              },
              {
                internalType: "uint256",
                name: "fee",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "revenueCut",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "upperRange",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lowerRange",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "upperShiftThreshold",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lowerShiftThreshold",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "shiftingTime",
                type: "uint256",
              },
              {
                internalType: "address",
                name: "centerPriceAddress",
                type: "address",
              },
              {
                internalType: "address",
                name: "hookAddress",
                type: "address",
              },
              {
                internalType: "uint256",
                name: "maxCenterPrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "minCenterPrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "utilizationLimitToken0",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "utilizationLimitToken1",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxSupplyShares",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "maxBorrowShares",
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
                name: "lastStoredPrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "centerPrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "upperRange",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lowerRange",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "geometricMean",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "supplyToken0ExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowToken0ExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "supplyToken1ExchangePrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowToken1ExchangePrice",
                type: "uint256",
              },
            ],
            internalType: "struct IFluidDexT1.PricesAndExchangePrice",
            name: "pex",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "token0RealReserves",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token1RealReserves",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token0ImaginaryReserves",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token1ImaginaryReserves",
                type: "uint256",
              },
            ],
            internalType: "struct IFluidDexT1.CollateralReserves",
            name: "colReserves",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "token0Debt",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token1Debt",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token0RealReserves",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token1RealReserves",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token0ImaginaryReserves",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token1ImaginaryReserves",
                type: "uint256",
              },
            ],
            internalType: "struct IFluidDexT1.DebtReserves",
            name: "debtReserves",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "lastToLastStoredPrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastStoredPrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "centerPrice",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastUpdateTimestamp",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "lastPricesTimeDiff",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "oracleCheckPoint",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "oracleMapping",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalSupplyShares",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "totalBorrowShares",
                type: "uint256",
              },
              {
                internalType: "bool",
                name: "isSwapAndArbitragePaused",
                type: "bool",
              },
              {
                components: [
                  {
                    internalType: "bool",
                    name: "isRangeChangeActive",
                    type: "bool",
                  },
                  {
                    internalType: "bool",
                    name: "isThresholdChangeActive",
                    type: "bool",
                  },
                  {
                    internalType: "bool",
                    name: "isCenterPriceShiftActive",
                    type: "bool",
                  },
                  {
                    components: [
                      {
                        internalType: "uint256",
                        name: "oldUpper",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "oldLower",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "duration",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "startTimestamp",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "oldTime",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct Structs.ShiftData",
                    name: "rangeShift",
                    type: "tuple",
                  },
                  {
                    components: [
                      {
                        internalType: "uint256",
                        name: "oldUpper",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "oldLower",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "duration",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "startTimestamp",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "oldTime",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct Structs.ShiftData",
                    name: "thresholdShift",
                    type: "tuple",
                  },
                  {
                    components: [
                      {
                        internalType: "uint256",
                        name: "shiftPercentage",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "duration",
                        type: "uint256",
                      },
                      {
                        internalType: "uint256",
                        name: "startTimestamp",
                        type: "uint256",
                      },
                    ],
                    internalType: "struct Structs.CenterPriceShift",
                    name: "centerPriceShift",
                    type: "tuple",
                  },
                ],
                internalType: "struct Structs.ShiftChanges",
                name: "shifts",
                type: "tuple",
              },
              {
                internalType: "uint256",
                name: "token0PerSupplyShare",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token1PerSupplyShare",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token0PerBorrowShare",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "token1PerBorrowShare",
                type: "uint256",
              },
            ],
            internalType: "struct Structs.DexState",
            name: "dexState",
            type: "tuple",
          },
          {
            components: [
              {
                internalType: "uint256",
                name: "liquiditySupplyToken0",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "liquiditySupplyToken1",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "liquidityBorrowToken0",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "liquidityBorrowToken1",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "liquidityWithdrawableToken0",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "liquidityWithdrawableToken1",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "liquidityBorrowableToken0",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "liquidityBorrowableToken1",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "utilizationLimitToken0",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "utilizationLimitToken1",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "withdrawableUntilUtilizationLimitToken0",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "withdrawableUntilUtilizationLimitToken1",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowableUntilUtilizationLimitToken0",
                type: "uint256",
              },
              {
                internalType: "uint256",
                name: "borrowableUntilUtilizationLimitToken1",
                type: "uint256",
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
                name: "liquidityUserSupplyDataToken0",
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
                name: "liquidityUserSupplyDataToken1",
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
                name: "liquidityUserBorrowDataToken0",
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
                name: "liquidityUserBorrowDataToken1",
                type: "tuple",
              },
              {
                components: [
                  {
                    internalType: "uint256",
                    name: "borrowRate",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "supplyRate",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "fee",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "lastStoredUtilization",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "storageUpdateThreshold",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "lastUpdateTimestamp",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "supplyExchangePrice",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "borrowExchangePrice",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "supplyRawInterest",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "supplyInterestFree",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "borrowRawInterest",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "borrowInterestFree",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "totalSupply",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "totalBorrow",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "revenue",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "maxUtilization",
                    type: "uint256",
                  },
                  {
                    components: [
                      {
                        internalType: "uint256",
                        name: "version",
                        type: "uint256",
                      },
                      {
                        components: [
                          {
                            internalType: "address",
                            name: "token",
                            type: "address",
                          },
                          {
                            internalType: "uint256",
                            name: "kink",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationZero",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationKink",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationMax",
                            type: "uint256",
                          },
                        ],
                        internalType: "struct Structs.RateDataV1Params",
                        name: "rateDataV1",
                        type: "tuple",
                      },
                      {
                        components: [
                          {
                            internalType: "address",
                            name: "token",
                            type: "address",
                          },
                          {
                            internalType: "uint256",
                            name: "kink1",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "kink2",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationZero",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationKink1",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationKink2",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationMax",
                            type: "uint256",
                          },
                        ],
                        internalType: "struct Structs.RateDataV2Params",
                        name: "rateDataV2",
                        type: "tuple",
                      },
                    ],
                    internalType: "struct Structs.RateData",
                    name: "rateData",
                    type: "tuple",
                  },
                ],
                internalType: "struct Structs.OverallTokenData",
                name: "liquidityTokenData0",
                type: "tuple",
              },
              {
                components: [
                  {
                    internalType: "uint256",
                    name: "borrowRate",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "supplyRate",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "fee",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "lastStoredUtilization",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "storageUpdateThreshold",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "lastUpdateTimestamp",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "supplyExchangePrice",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "borrowExchangePrice",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "supplyRawInterest",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "supplyInterestFree",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "borrowRawInterest",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "borrowInterestFree",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "totalSupply",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "totalBorrow",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "revenue",
                    type: "uint256",
                  },
                  {
                    internalType: "uint256",
                    name: "maxUtilization",
                    type: "uint256",
                  },
                  {
                    components: [
                      {
                        internalType: "uint256",
                        name: "version",
                        type: "uint256",
                      },
                      {
                        components: [
                          {
                            internalType: "address",
                            name: "token",
                            type: "address",
                          },
                          {
                            internalType: "uint256",
                            name: "kink",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationZero",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationKink",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationMax",
                            type: "uint256",
                          },
                        ],
                        internalType: "struct Structs.RateDataV1Params",
                        name: "rateDataV1",
                        type: "tuple",
                      },
                      {
                        components: [
                          {
                            internalType: "address",
                            name: "token",
                            type: "address",
                          },
                          {
                            internalType: "uint256",
                            name: "kink1",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "kink2",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationZero",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationKink1",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationKink2",
                            type: "uint256",
                          },
                          {
                            internalType: "uint256",
                            name: "rateAtUtilizationMax",
                            type: "uint256",
                          },
                        ],
                        internalType: "struct Structs.RateDataV2Params",
                        name: "rateDataV2",
                        type: "tuple",
                      },
                    ],
                    internalType: "struct Structs.RateData",
                    name: "rateData",
                    type: "tuple",
                  },
                ],
                internalType: "struct Structs.OverallTokenData",
                name: "liquidityTokenData1",
                type: "tuple",
              },
            ],
            internalType: "struct Structs.SwapLimitsAndAvailability",
            name: "limitsAndAvailability",
            type: "tuple",
          },
        ],
        internalType: "struct Structs.DexEntireData[]",
        name: "datas_",
        type: "tuple[]",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
