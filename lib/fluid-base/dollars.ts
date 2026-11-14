// Whether Fluid's Base pages state dollar values (rails-ops ui-jobs 574).
//
// Fluid runs no USD feed, and the Ethereum explorer states no dollars. The Base
// pages can value each side at Aave V3 Base's oracle price; that is a new
// precedent and waits on Miles's ruling. This one switch governs every dollar
// surface: the card's dollar lines and interest dollars, the foot line, their
// receipts, the info page's AaveOracle row and words, the oracle reason and the
// coverage note. Off, every figure is in the vault's tokens. rails-server reads
// the oracle in the same batch as the token details either way.

export const FLUID_BASE_DOLLARS = true;
