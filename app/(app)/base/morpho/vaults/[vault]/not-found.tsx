// The 404 body for an address the vault-exposure lookup does not serve
// (components/vaults/metamorpho-vault-not-found.tsx, on Base).
import { MetaMorphoVaultNotFound } from "@/components/vaults/metamorpho-vault-not-found";

export default function MorphoBaseVaultNotFound() {
  return <MetaMorphoVaultNotFound chainId={8453} />;
}
