/** An asset as its icon resolves it (components/shared/token-chip-icon.tsx):
 *  the symbol it is named by and its token address. The address is what the
 *  chip finds a mark under when the symbol has none of its own (BAT, ZRX and
 *  most of a long-tail roster), so every surface that draws one asset hands
 *  the chip both, and the card, the flows and the timeline draw the same mark.
 *
 *  `address` is required: null is written out where no token stands behind the
 *  symbol (native ETH) or the caller's data names none, so a symbol-only icon
 *  is visible at its call site. */
export interface AssetMark {
  symbol: string;
  address: string | null;
}

/** The mark of an asset whose data names it by symbol alone. Each call is a
 *  surface the address has not reached yet; the chip resolves it through the
 *  house symbol table (lib/shared/token-addresses.ts) or draws the glyph. */
export const symbolOnly = (symbol: string): AssetMark => ({ symbol, address: null });
