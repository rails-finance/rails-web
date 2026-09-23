# Attribution

The code in this repository is MIT-licensed (see [LICENSE](LICENSE)). The material below is
third-party and is **not** covered by that licence. Each mark belongs to its project.

## Token images — `public/icons/tokens/*.png`

Logos of the tokens the site names, used to identify them in token chips.

- 93 address-named files (`0x….png`) were fetched from CoinGecko's coin image endpoint by
  `scripts/audit-token-icons.mjs`.
- 30 symbol-named files (`usdc.png`, `weth.png`, …) were added by hand.
- At request time the chip (`components/shared/token-chip-icon.tsx`) falls back to Trust
  Wallet's assets repository and DefiLlama's icon service for marks not held here.

Images via [CoinGecko](https://www.coingecko.com), [Trust Wallet](https://github.com/trustwallet/assets)
and [DefiLlama](https://defillama.com). Each mark is the property of the token's project and is not
covered by the MIT licence.

## Protocol marks — `public/icons/protocols/*.png`

Logos of the protocols and venues the site names (Aave, Compound, Liquity, MakerDAO, Morpho, …),
used to identify them. Each is the property of its project and is not covered by the MIT licence.

## Lucide

[`lucide-react`](https://lucide.dev) is a dependency under the ISC licence; its notice ships in the
package (`node_modules/lucide-react/LICENSE`).

One glyph is transcribed rather than imported: the "vault" icon's path geometry in
`lib/share/position-card.tsx` (`vaultsMark`, lines 192–217; the geometry itself at lines 205–214),
redrawn for the share-card renderer. Lucide's notice, reproduced for that transcription:

> ISC License
>
> Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2023 as part of Feather (MIT).
> All other copyright (c) for Lucide are held by Lucide Contributors 2025.
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or
> without fee is hereby granted, provided that the above copyright notice and this permission
> notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
> SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
> AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
> WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
> NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE
> OF THIS SOFTWARE.

## People's images

The repository holds only the team's own images: `public/avatars/x/milesessex.png`,
`public/avatars/x/rails_finance.svg`, `public/avatars/github/*` and `public/about-team-*.jpg`.
Other people's profile pictures are fetched at request time (`app/api/avatar/x/[handle]/route.ts`)
and are not stored here.
