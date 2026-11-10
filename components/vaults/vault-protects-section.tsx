// The vault pages' "What protects it" and "The protocol underneath" (V9, V10;
// rails-ops ui-jobs 554): the family's reads at one head block
// (lib/vaults/protects-read.ts), worked into words and receipts on the
// server. Each vault page streams it behind its own Suspense boundary, after
// where the assets are.
//
// SERVER-ONLY: the reads use the RPC keys.

import { VaultProtects, type ProtectsLook } from "@/components/vaults/vault-protects";
import { readVaultProtects, type ProtectsSubject } from "@/lib/vaults/protects-read";
import { protectsLine, underneathLine } from "@/lib/vaults/protects-words";
import { protectsProv, underneathProv } from "@/lib/vaults/protects-provenance";

export async function VaultProtectsSection({
  subject,
  vaultName,
  look,
}: {
  subject: ProtectsSubject;
  vaultName: string;
  /** How a line reads; the MetaMorpho page's grid passes "paragraph". */
  look?: ProtectsLook;
}) {
  const r = await readVaultProtects(subject);
  if (!r)
    return (
      <VaultProtects
        chainId={subject.chainId}
        block={0}
        vaultName={vaultName}
        protects={null}
        underneath={null}
        look={look}
      />
    );
  return (
    <VaultProtects
      chainId={r.chainId}
      block={r.block}
      vaultName={vaultName}
      look={look}
      protects={{
        line: protectsLine(r.protects),
        info: protectsProv(r.protects, r.chainId, r.block),
        contracts: r.protectsContracts,
      }}
      underneath={{
        line: underneathLine(r.underneath),
        info: underneathProv(r.underneath, r.chainId, r.block),
        contracts: r.underneathContracts,
      }}
    />
  );
}
