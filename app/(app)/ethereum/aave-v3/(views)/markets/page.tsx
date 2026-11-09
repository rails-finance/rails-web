// Aave V3 market overview on Ethereum; the client half is market-page.tsx
// beside this file. `?market=prime|etherfi` reads that Pool.

import { AaveV3MarketPage } from "./market-page";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const market = (await searchParams).market;
  return <AaveV3MarketPage market={Array.isArray(market) ? market[0] : market} />;
}
