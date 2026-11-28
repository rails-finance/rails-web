// The Polaris cases' chain: imported by kind-rings.render.mjs from a .tsx file
// so the provider is the same module instance the token chip reads (an .mjs
// import of chain-context loads a second copy under tsx).
import type { ReactNode } from "react";
import { ChainProvider } from "@/lib/shared/chain-context";
import { SEPOLIA_CHAIN_ID } from "@/lib/shared/chains";

export const OnSepolia = ({ children }: { children: ReactNode }) => (
  <ChainProvider chainId={SEPOLIA_CHAIN_ID}>{children}</ChainProvider>
);
