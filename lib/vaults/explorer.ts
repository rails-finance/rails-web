// The vault rows' explorer adapter (rails-ops TO-DO-ui-jobs 307): the contracts
// the shared units read, for the Aave, Yearn and MetaMorpho vault positions. For
// now the event page's (ui-jobs 236): the vault and the holder, then the shared
// rows.

import type { EventPageSlot, ExplorerAdapter } from "@/lib/shared/explorer-adapter";
import { listingHrefForWallet } from "@/lib/shared/protocols";
import { formatDateLong } from "@/lib/date";

/** The three vault families, as the session key each one's listing sits under. */
export type VaultFamilyKey = "aave-vaults" | "yearn" | "morpho-base";

const FAMILY_NOUN: Record<VaultFamilyKey, string> = {
  "aave-vaults": "Aave vault",
  yearn: "Yearn V3 vault",
  "morpho-base": "MetaMorpho vault",
};

const DEPLOYMENT_NAME = { ethereum: "Ethereum", base: "Base" } as const;

const WORDS = {
  paragraph: "This page is one transaction from this address's history in this vault.",
  timeline_link: "See the whole history in the timeline.",
  timeline_hint: "Open this event in the address's timeline",
  vault: "Vault",
  copy_vault: "Copy the vault's address",
  holder: "Holder",
  description: (vault: string, holder: string, deployment: string, day: string | null) =>
    `One transaction from ${holder} in ${vault} on ${deployment}${day ? `, on ${day}` : ""}.`,
};

const short = (a: string) => (/^0x[0-9a-fA-F]{40}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export interface VaultEventPageInput extends EventPageSlot {
  family: VaultFamilyKey;
  deployment: keyof typeof DEPLOYMENT_NAME;
  /** Null where the catalogue has no name for the vault. */
  vaultName: string | null;
  vault: string;
  holder: string;
}

/** The page's metadata description, also read on the server. */
export function vaultEventPageDescription(
  family: VaultFamilyKey,
  deployment: keyof typeof DEPLOYMENT_NAME,
  vaultName: string | null,
  vault: string,
  holder: string,
  /** Null where the route cannot find the event (Yearn keeps no stored history). */
  timestamp: number | null,
): string {
  const which = `the ${FAMILY_NOUN[family]} ${vaultName ?? short(vault)}`;
  const day = timestamp != null ? formatDateLong(timestamp) : null;
  return `${WORDS.description(which, short(holder), DEPLOYMENT_NAME[deployment], day)} ${WORDS.timeline_link}`;
}

export const vaultExplorer: ExplorerAdapter<VaultEventPageInput> = {
  eventPage: ({ family, deployment, vaultName, vault, holder, event, ...slot }) => ({
    heading: event.actionLabel,
    words: {
      paragraph: WORDS.paragraph,
      timelineLink: WORDS.timeline_link,
      timelineHint: WORDS.timeline_hint,
    },
    facts: [
      {
        key: "vault",
        label: WORDS.vault,
        value: vaultName ?? short(vault),
        full: vault,
        copy: WORDS.copy_vault,
      },
      {
        key: "holder",
        label: WORDS.holder,
        value: short(holder),
        full: holder,
        mono: true,
        href: listingHrefForWallet(family, holder, family === "morpho-base" ? "vaults" : undefined) ?? undefined,
      },
    ],
    ...slot,
    blockNumber: event.blockNumber,
    txHash: event.txHash,
    eventId: event.id,
    description: vaultEventPageDescription(family, deployment, vaultName, vault, holder, event.timestamp),
  }),
  eventMarkdown: { missing: "no Markdown route serves this family's events yet (ui-jobs 236)" },
};
