// The layout mocks' index (Miles, 10 Nov 2026): three MetaMorpho vaults drawn
// by /mock-layout/[chainId]/[vault]. Localhost only; not linked from the app.

import Link from "next/link";
import type { Metadata } from "next";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const PROV_EXEMPT = "layout mock: an index of links, no figures";

export const metadata: Metadata = {
  title: "Vault page layout mock",
  robots: { index: false, follow: false },
};

const EXAMPLES = [
  {
    name: "Coinshift USDL",
    chain: "Ethereum",
    href: "/mock-layout/1/0xbeefc011e94f43b8b7b455ebab290c7ab4e216f1",
    note: "carries the decimals disagree pill and its sentence",
  },
  {
    name: "Steakhouse USDC",
    chain: "Ethereum",
    href: "/mock-layout/1/0xbeef01735c132ada46aa9aa4c54623caa92a64cb",
  },
  {
    name: "Gauntlet USDC Prime",
    chain: "Base",
    href: "/mock-layout/8453/0xee8f4ec5672f09119b96ab6fb59c27e1b7e44b61",
  },
];

export default function MockLayoutIndex() {
  return (
    <div className="min-h-screen py-8" data-prov-exempt={PROV_EXEMPT}>
      <h1 className="text-2xl font-semibold text-foreground">Vault page layout mock</h1>
      <p className="mt-2 max-w-2xl text-rb-500">
        MetaMorpho vault pages: the live vault card, then a grid of tiles after Coinbase&rsquo;s asset pages. Who holds
        it draws the census&rsquo;s holders as a ring; configuration and addresses follow Morpho&rsquo;s vault pages.
      </p>
      <ul className="mt-6 space-y-3">
        {EXAMPLES.map((e) => (
          <li key={e.href}>
            <Link href={e.href} prefetch={false} className={INLINE_LINK}>
              {e.name}
            </Link>{" "}
            <span className="text-rb-500">
              on {e.chain}
              {e.note ? `, ${e.note}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
