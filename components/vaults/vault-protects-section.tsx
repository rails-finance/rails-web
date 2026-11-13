// The vault pages' "What protects it" and "The protocol underneath" (V9, V10;
// rails-ops ui-jobs 554): the family's reads at one head block
// (lib/vaults/protects-read.ts), worked into words and receipts on the
// server. Each vault page streams it behind its own Suspense boundary, after
// where the assets are. On MetaMorpho it also reads the vault's configuration
// changes of the last 30 days (V9.1, lib/vaults/config-changes-read.ts) from
// rails-server, in parallel with the chain reads.
//
// SERVER-ONLY: the reads use the RPC keys.

import { VaultProtects, type ProtectsLook } from "@/components/vaults/vault-protects";
import { readVaultProtects, type ProtectsSubject } from "@/lib/vaults/protects-read";
import { protectsLine, underneathLine } from "@/lib/vaults/protects-words";
import { protectsProv, underneathProv } from "@/lib/vaults/protects-provenance";
import { readConfigChanges, type ConfigChangesSubject } from "@/lib/vaults/config-changes-read";

export async function VaultProtectsSection({
  subject,
  vaultName,
  look,
  changes,
}: {
  subject: ProtectsSubject;
  vaultName: string;
  /** How a line reads; the MetaMorpho page's grid passes "paragraph". */
  look?: ProtectsLook;
  /** MetaMorpho: the vault the recent configuration changes are read for. */
  changes?: ConfigChangesSubject;
}) {
  const protectsRead = readVaultProtects(subject);
  const [r, changesView] = await Promise.all([
    protectsRead,
    changes
      ? readConfigChanges(
          changes,
          protectsRead.then((x) => (x?.protects.kind === "metamorpho" ? x.protects.timelock : null)),
        )
      : Promise.resolve(undefined),
  ]);
  if (!r)
    return (
      <VaultProtects
        chainId={subject.chainId}
        block={0}
        vaultName={vaultName}
        protects={null}
        underneath={null}
        look={look}
        changes={changesView}
      />
    );
  return (
    <VaultProtects
      chainId={r.chainId}
      block={r.block}
      vaultName={vaultName}
      look={look}
      changes={changesView}
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
