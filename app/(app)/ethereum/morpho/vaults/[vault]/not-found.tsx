// The 404 body for an address the vault-exposure lookup does not serve
// (components/vaults/metamorpho-vault-not-found.tsx, on Ethereum).
import { MetaMorphoVaultNotFound } from "@/components/vaults/metamorpho-vault-not-found";

export default function EthereumMorphoVaultNotFound() {
  return <MetaMorphoVaultNotFound chainId={1} />;
}
