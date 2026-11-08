// The protocol behind a Pendle market's yield token: a Rails label.
// ----------------------------------------------------------------------------
// The chain does not say which protocol issues a yield token: a market's SY
// names its yield token (SY.yieldToken()) and nothing names the protocol
// behind that token. Rails groups markets by it all the same, keyed by the
// yield token's address, so PT-USD3 sits under 3Jane. Each entry is Rails'
// reading of the token's issuer; the page says so wherever it draws one
// (rails-ops TO-DO-next-protocols, Pendle, Miles 8 Nov 2026). A yield token not
// listed here is drawn without a group.

const LABELS: Record<string, string> = {
  // 3Jane: USD3 and its staked form.
  "0x056b269eb1f75477a8666ae8c7fe01b64dd55ecc": "3Jane",
  "0xf689555121e529ff0463e191f9bd9d1e496164a7": "3Jane",
  // Ethena: USDe, sUSDe, sENA.
  "0x4c9edd5852cd905f086c759e8383e09bff1e68b3": "Ethena",
  "0x9d39a5de30e57443bff2a8307a4256c8797a3497": "Ethena",
  "0x8be3460a480c80728a8c4d7a5d5303c85ba7b3b9": "Ethena",
  // Sky: USDS and sUSDS.
  "0xdc035d45d973e3ec169d2276ddab16f1e407384f": "Sky",
  "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd": "Sky",
  // Lido: wstETH.
  "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": "Lido",
  // f(x) Protocol: fxSAVE.
  "0x7743e50f534a7f9f1791dde7dcd89f7783eefc39": "f(x) Protocol",
  // Falcon: sUSDf.
  "0xc8cf6d7991f15525488b2a83df53468d682ba4b0": "Falcon",
  // ether.fi: weETHs.
  "0x917cee801a67f933f2e6b33fc0cd1ed2d5909d88": "ether.fi",
  // Kelp: rsETH.
  "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7": "Kelp",
  // Swell: rswETH.
  "0xfae103dc9cf190ed75350761e95403b7b8afa6c0": "Swell",
  // Puffer: pufETH.
  "0xd9a442856c234a39a81a089c06451ebaa4306a72": "Puffer",
  // Solv: xSolvBTC.
  "0xd9d920aa40f578ab794426f5c90f6c731d159def": "Solv",
  // Treehouse: tETH.
  "0xd11c452fc99cf405034ee446803b6f6c1f6d5ed8": "Treehouse",
  // Origin: wrapped OUSD.
  "0xd2af830e8cbdfed6cc11bab697bb25496ed6fa62": "Origin",
  // Aave: the aToken of RLUSD.
  "0xfa82580c16a31d0c1bc632a36f82e83efef3eec0": "Aave",
  // Cap: cUSD.
  "0xcccc62962d17b8914c62d74ffb843d73b2a3cccc": "Cap",
};

/** The Rails label for the protocol behind a yield token, or null where Rails has none. */
export function underlyingProtocol(yieldToken: string): string | null {
  return LABELS[yieldToken.toLowerCase()] ?? null;
}

/** The words every surface uses beside a label. */
export const UNDERLYING_LABEL_TIP =
  "Rails groups Pendle markets by the protocol behind each yield token. The chain does not name that protocol: this label is Rails' reading of who issues the token.";
