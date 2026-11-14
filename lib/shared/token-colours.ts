// A token's colour: its icon's dominant saturated colour, extracted from
// public/icons/tokens by scripts/token-colours.mjs (regenerate after adding
// or replacing an icon). Keyed as lib/shared/local-token-icons.ts keys the
// icons: a lowercased address, or a lowercased symbol. Null where the icon is
// a black, white or grey mark, or there is no local icon.

import COLOURS from "./token-colours.json";

const TABLE = COLOURS as Record<string, string | null>;

export function tokenColour(addressOrKey: string | null | undefined): string | null {
  if (!addressOrKey) return null;
  return TABLE[addressOrKey.toLowerCase()] ?? null;
}
