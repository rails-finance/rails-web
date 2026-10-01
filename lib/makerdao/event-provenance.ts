// MakerDAO provenance vocabulary (chain-state tier).
// ----------------------------------------------------------------------------
// Every vault value traces to a Vat slot / LogNote field (`chain`) or to math over
// those on-chain reads that mirrors Maker's own logic — the §2 `art × rate` DAI
// debt, the §3 OSM-priced USD, the accrued stability fee (`chain-derived`). Both
// kinds are read from the chain, so this whole file is the On-chain-values surface. Only
// a figure that leaves the chain (an APR forward-projection, say) would belong to a
// later `<Layer>`, not here.
//
// Every value replays from the chain-captured maker_* tables (the rails-server index).

import type { Provenance, ProvInput, ProvVerify } from "@/components/shared/provenance";
import { MAKER_ADDRESSES } from "./asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const VAT = { name: "Vat", address: MAKER_ADDRESSES.VAT };
const CDP_MANAGER = { name: "CdpManager", address: MAKER_ADDRESSES.CDP_MANAGER };

// Custody, not origin — the via line's leading segment only (the embedded
// receipt renderer drops it; provenance-receipts-grammar §3). Summaries state
// what a value means on chain, never which store delivered it.
const MAKER_VIA = "captured Vat LogNotes (maker_frob / maker_grab / maker_fork)";

export interface MakerCoords {
  txHash?: string;
  blockNumber?: number;
  urn?: string;
  ilk?: string;
}

export const atBlock = (coords?: MakerCoords): string =>
  coords?.blockNumber != null ? ` at block ${coords.blockNumber}` : "";

/** Etherscan tx-logs link for an emitted (LogNote) value — zero-RPC, link only. */
const txVerify = (coords?: MakerCoords): ProvVerify | undefined =>
  coords?.txHash
    ? {
        kind: "etherscan",
        href: explorerUrl(MAINNET_CHAIN_ID, "tx-logs", coords.txHash),
        text: "Confirm in the tx event logs",
      }
    : undefined;

/** Replay check: re-run the Vat.urns eth_call yourself (an archive node for a
 *  historical block) and compare. No third-party deep link — explorers read head
 *  only, so the re-run IS the check. The replayed values are Σ dink/dart, not a
 *  slot read — they match urn.ink/urn.art when the captured history is complete
 *  (collateral doesn't accrue; art is normalized). */
const stateVerify = (coords?: MakerCoords): ProvVerify => ({
  kind: "recompute",
  text:
    coords?.blockNumber != null
      ? `Check against the Vat.urns eth_call at block ${coords.blockNumber} (archive node) — the replay matches the slot when the captured history is complete`
      : "Check against the Vat.urns eth_call — the replay matches the slot when the captured history is complete",
});

export function eventInputs(coords: MakerCoords | undefined, extra: ProvInput[] = []): ProvInput[] {
  const inputs: ProvInput[] = [...extra];
  if (coords?.ilk) inputs.push({ label: "ilk", value: coords.ilk, kind: "chain", note: "collateral type" });
  if (coords?.urn) inputs.push({ label: "urn", value: coords.urn, kind: "chain", note: "vault address" });
  if (coords?.blockNumber != null)
    inputs.push({ label: "block", value: String(coords.blockNumber), kind: "chain", note: "event block" });
  if (coords?.txHash)
    inputs.push({
      label: "tx",
      value: coords.txHash,
      kind: "chain",
      note: "captured log",
    });
  return inputs;
}

/** Signed collateral delta `dink` this frob/grab/fork applied. */
export const dinkProv = (collSym: string, coords: MakerCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Collateral (${collSym}) moved by this operation — the signed collateral change this frob/grab/fork applied to the vault's urn${atBlock(coords)}. Decoded from the Vat's anonymous LogNote calldata, never recomputed.`,
  contract: VAT,
  via: `${MAKER_VIA} · frob/grab/fork LogNote · dink · wad ÷10^18`,
  inputs: eventInputs(coords),
});

/** Signed normalized-debt delta `dart` this frob/grab/fork applied. */
export const dartProv = (coords: MakerCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Normalized debt (art) change from this operation — the signed change this frob/grab/fork applied to the vault's normalized debt${atBlock(coords)}. Multiply by the ilk's rate accumulator for the DAI figure. Decoded from the Vat's anonymous LogNote calldata, never recomputed.`,
  contract: VAT,
  via: `${MAKER_VIA} · frob/grab/fork LogNote · dart · wad ÷10^18`,
  inputs: eventInputs(coords),
});

/** Collateral `ink` after this event = Σ dink (truth-preserving replay). */
export const inkAfterProv = (collSym: string, coords: MakerCoords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  verify: stateVerify(coords),
  summary: `Collateral (${collSym}) the vault held AFTER this event — the vault's running collateral, replayed by summing the signed dink of its own frob/grab/fork operations in log order up to this block${atBlock(coords)}. A replay of the urn.ink slot — it matches when the captured history is complete.`,
  contract: VAT,
  via: `${MAKER_VIA} · Σ ±dink → urn.ink · in on-chain order`,
  inputs: eventInputs(coords),
});

/** Collateral `ink` BEFORE this event = ink after − dink. A derived quantity —
 *  arithmetic over two chain-direct figures (the replayed ink and the LogNote
 *  dink) — both inputs are on-chain, so it is chain-derived and shows in the
 *  chain-state view alongside the after it pairs with. Exact (collateral doesn't
 *  accrue). */
export const inkBeforeProv = (collSym: string, coords: MakerCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Collateral (${collSym}) the vault held BEFORE this event — the urn.ink after minus the signed dink this frob/grab/fork applied (after − change), reconstructed in the browser from the replayed ink and the LogNote dink. Exact (collateral doesn't accrue).`,
  contract: VAT,
  via: "urn.ink after − dink",
  formula: "after − change",
  // Operand rows: the driver (reconstructTransition) fills the values it
  // actually subtracted; the vocabulary owns the labels + grain.
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "indexed", note: `replayed urn.ink (${collSym}) after this event` },
    { label: "change", kind: "chain", pclass: "emitted", note: "the LogNote dink (signed)" },
  ]),
});

/** Debt owed AFTER this event = urn.art after × the ilk's rate at the block. */
export const debtAfterProv = (symbol: string, coords: MakerCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  verify: stateVerify(coords),
  summary: `${symbol} the vault owed AFTER this event${atBlock(coords)} — the urn's normalized debt (art) after this frob/grab/fork times the ilk's rate accumulator at the block, the Vat's debt figure. Equals Vat.urns(ilk, urn).art × Vat.ilks(ilk).rate ÷ 10^27 read at the block; the stability fee accrued up to the block is in it.`,
  contract: VAT,
  via: `${MAKER_VIA} · Σ ±dart → urn.art × rate at the block (Σ captured fold deltas)`,
  formula: "art after × rate ÷ 10^27",
  inputs: eventInputs(coords),
});

/** Debt owed BEFORE this event = debt after − the change. */
export const debtBeforeProv = (symbol: string, coords: MakerCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `${symbol} the vault owed just BEFORE this event — the art before it (art after − dart) times the same block's rate accumulator. It includes the stability fee accrued since the previous row.`,
  contract: VAT,
  via: "(urn.art after − dart) × rate at the block",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain-derived", pclass: "indexed", note: `${symbol} owed after this event (art × rate)` },
    { label: "change", kind: "chain-derived", pclass: "emitted", note: "dart × rate at the block (signed)" },
  ]),
});

/** The debt this event added or removed = dart × the rate at the block. */
export const debtChangeProv = (symbol: string, coords: MakerCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `${symbol} of debt this operation added or cleared${atBlock(coords)} — the signed normalized-debt change (dart) from the Vat LogNote times the ilk's rate accumulator at the block: the ${symbol} the Vat credited or debited for it.`,
  contract: VAT,
  via: `${MAKER_VIA} · frob/grab/fork LogNote · dart × rate at the block`,
  formula: "dart × rate ÷ 10^27",
  inputs: eventInputs(coords),
});

/** The debt figure a row's header, spine and explainer draw for this event:
 *  dart × rate (the debt token minted or burned) where the row carries its
 *  block's rate, the bare dart with an "art" tag where it does not. One source,
 *  so the three receipts key on the same value. */
export function debtDeltaOf(
  ctx: { dart: string; debtChange?: string },
  symbol: string,
  coords: MakerCoords,
): { value: number; prov: Provenance; suffix?: string } {
  if (ctx.debtChange != null) return { value: Number(ctx.debtChange) || 0, prov: debtChangeProv(symbol, coords) };
  return { value: Number(ctx.dart) || 0, prov: dartProv(coords), suffix: "art" };
}

/** Stability fee accrued between the previous row and this one. */
export const interestSincePreviousProv = (symbol: string, coords: MakerCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Stability fee the debt accrued since the vault's previous event, up to this one${atBlock(coords)} — the debt just before this event less the debt just after the previous one. Art did not move between them, so this is art × (the rate at this block − the rate at the previous row's block) ÷ 10^27.`,
  contract: VAT,
  via: "urn.art before × (rate at this block − rate at the previous row)",
  formula: "art before × (rate − previous rate) ÷ 10^27",
  inputs: eventInputs(coords),
});

/** Current debt = art × rate — the one §2 multiply, both operands chain reads.
 *  `symbol` names the token the Vat unit mints for THIS vault: DAI through the
 *  DaiJoin for CdpManager vaults, USDS through the UsdsJoin for LockStake urns
 *  (decision 0013). */
export const daiDebtProv = (artHuman: string, rateRay: string, symbol: string = "DAI"): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Current ${symbol} debt of the vault — the normalized art multiplied by the ilk's rate accumulator. Both operands are chain reads (the §2 index resolution) and the product is Maker's own debt figure, so it's chain-derived.`,
  contract: VAT,
  via: "urn.art (Σ dart replay) × Vat.ilks(ilk).rate (live)",
  formula: "art × rate ÷ 10^27",
  inputs: [
    { label: "art", value: artHuman, kind: "chain", pclass: "indexed", note: "Σ dart (replay of the urn.art slot)" },
    { label: "rate", value: rateRay, kind: "chain", pclass: "state", note: "Vat.ilks(ilk).rate, ray — live read" },
  ],
});

// ── Liquidation forensics (the valued grab legs) ─────────────────────────────
//
// A grab moves the vault's seized collateral (dink) and cleared debt (dart)
// into the liquidation system. The collateral leg is valued at the ilk's own
// OSM price recovered from the protocol's risk state AT the grab block
// (Vat spot × Spotter mat — inverting Spot.poke's spot = val/par/mat; the OSM
// itself is read-whitelisted, these are two public views). The DAI leg needs
// no price: dart × rate IS the protocol's own unit of account. The cushion
// (seized ÷ cleared − 1) is what the seizure carried into the Dutch auction —
// the penalty and any surplus settle there, not at the grab.

const SPOTTER = { name: "Spot (Spotter)", address: MAKER_ADDRESSES.SPOTTER };

/** The ilk's own OSM price at the grab block. */
export const atBlockPriceProv = (collSym: string, coords: MakerCoords, priceUsd: number): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  formula: "Vat.ilks(ilk).spot × Spotter.ilks(ilk).mat ÷ RAY²",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the Vat.ilks and Spotter.ilks eth_calls at block ${coords.blockNumber} (archive node) and multiply spot × mat`
        : "Re-run the Vat.ilks and Spotter.ilks eth_calls (archive node) and multiply spot × mat",
  },
  summary: `${collSym}:USD at this event's block — the OSM price recovered from the protocol's own risk state${atBlock(coords)}: Spot.poke writes spot = price ÷ par ÷ mat, so spot × mat inverts it back to the OSM's figure — the EXACT price the Dog's unsafety test (ink × spot < art × rate) judged this vault against. Read from two public Vat/Spotter views at the block and captured into the index; the OSM itself is read-whitelisted.`,
  contract: SPOTTER,
  via: "Vat.ilks · spot × Spotter.ilks · mat at the event's block",
  inputs: [
    { label: `${collSym} price`, value: String(priceUsd), kind: "chain", note: "spot × mat, at block" },
    ...eventInputs(coords),
  ],
});

/** The seized-collateral leg — |dink| × the at-block OSM price. */
export const grabSeizedUsdProv = (
  collSym: string,
  coords: MakerCoords,
  vals: { amount: string; priceUsd: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  formula: "seized collateral × price at block",
  verify: txVerify(coords),
  summary: `What the seized collateral was worth at the moment of the grab — the collateral this seizure moved (the grab LogNote's dink) times the ilk's own OSM price recovered at the event's block. Both factors are chain values pinned to this block. The collateral went to a Dutch auction.`,
  contract: VAT,
  via: `${MAKER_VIA} · |dink| × (spot × mat) at block`,
  inputs: [
    { label: "seized", value: `${vals.amount} ${collSym}`, kind: "chain", note: "grab LogNote · dink" },
    { label: "price at block", value: String(vals.priceUsd), kind: "chain", note: "Vat spot × Spotter mat" },
    ...eventInputs(coords),
  ],
});

/** Position-card slot phrasing: the replay reconstructs the Vat.urns slot from the
 *  vault's own frob/grab/fork deltas. */
export const vaultSlotPhrase = (): string => "replayed from the vault's own Vat frob/grab/fork operations (Σ dink)";

/** Stated on a terminal vault's sub-dust balance: why a "closed" record still
 *  shows a figure, and why it isn't rounded away. */
const RESIDUE_SENTENCE =
  " This is a wei-scale residue on a terminal record — the remainder left in the slot when the record emptied, below the 0.000001 dust line the lifecycle status reads balances against; it renders at its true magnitude.";

/** Where a position-card slot figure came from. The card renders from whichever
 *  of the two landed (`MakerVaultView.source`), and the two are NOT the same
 *  claim: the api arm replays the slot from the vault's own captured LogNotes,
 *  the chain arm reads the slot itself with an eth_call. Defaulted to `"api"`,
 *  the older of the two and the one every caller meant before the overlay
 *  existed. */
type MakerSlotSource = "api" | "chain";

/** Vault collateral `ink` on the position card. `residue` marks a terminal
 *  vault's sub-dust remainder — the receipt then says what the trace is.
 *  `atBlock` is the block the figure is true at: the eth_call's own block on
 *  the chain arm (the loader pins every read to one head block and names it),
 *  the replay's last captured event on the api arm. */
export const vaultInkProv = (
  collSym: string,
  atBlock?: number,
  residue?: boolean,
  source: MakerSlotSource = "api",
): Provenance => ({
  kind: "chain",
  pclass: source === "chain" ? "state" : "indexed",
  verify: stateVerify({ blockNumber: atBlock }),
  summary:
    source === "chain"
      ? `Collateral (${collSym}) the vault holds — the Vat's own \`urns(ilk, urn).ink\` slot, read by eth_call${atBlock ? ` at block ${atBlock}` : ""}. A slot read: the same block pins every other figure on this card.${residue ? RESIDUE_SENTENCE : ""}`
      : `Collateral (${collSym}) the vault holds — ${vaultSlotPhrase()}${atBlock ? ` at block ${atBlock}` : ""}. A replay of the urn.ink slot.${residue ? RESIDUE_SENTENCE : ""}`,
  contract: VAT,
  via: source === "chain" ? "Vat.urns(ilk, urn) · ink, eth_call at the block" : `${MAKER_VIA} · Σ ±dink → urn.ink`,
});

/** Vault normalized debt `art` on the position card. `residue` as on ink. */
export const vaultArtProv = (atBlock?: number, residue?: boolean, source: MakerSlotSource = "api"): Provenance => ({
  kind: "chain",
  pclass: source === "chain" ? "state" : "indexed",
  verify: stateVerify({ blockNumber: atBlock }),
  summary:
    source === "chain"
      ? `Normalized debt (art) the vault holds — the Vat's own \`urns(ilk, urn).art\` slot, read by eth_call${atBlock ? ` at block ${atBlock}` : ""}. A slot read. Multiply by the ilk rate for the DAI figure.${residue ? RESIDUE_SENTENCE : ""}`
      : `Normalized debt (art) the vault holds — ${vaultSlotPhrase().replace("Σ dink", "Σ dart")}${
          atBlock ? ` at block ${atBlock}` : ""
        }. A replay of the urn.art slot. Multiply by the ilk rate for the DAI figure.${residue ? RESIDUE_SENTENCE : ""}`,
  contract: VAT,
  via: source === "chain" ? "Vat.urns(ilk, urn) · art, eth_call at the block" : `${MAKER_VIA} · Σ ±dart → urn.art`,
});

/** Collateral USD = ink × OSM price (charter §3 — overlay names its source). */
export const collateralUsdProv = (collSym: string, inkHuman: string, priceUsd: number): Provenance => ({
  kind: "chain-derived",
  summary: `USD value of the vault's ${collSym} collateral — the collateral amount times the Maker OSM price for this ilk, derived from the Vat spot × Spotter mat. The price names its source on its face (§3).`,
  contract: { name: "Spotter", address: MAKER_ADDRESSES.SPOTTER },
  via: "Maker OSM (Spotter spot × mat)",
  formula: "ink × price",
  inputs: [
    {
      label: "ink",
      value: `${inkHuman} ${collSym}`,
      kind: "chain",
      pclass: "indexed",
      note: "Σ dink (replay of the urn.ink slot)",
    },
    {
      label: "price",
      value: `$${priceUsd.toLocaleString("en-US")}`,
      kind: "chain",
      pclass: "oracle",
      note: "Maker OSM (Spotter)",
    },
  ],
});

/** Third-party action: the vault owner neither signed the transaction nor
 *  initiated it through their own proxy. Maker-shaped facts: the Vat has no
 *  per-event party param (the LogNote usr is always the CdpManager — one
 *  contract for everyone), so the second fact is the transaction envelope's
 *  entry contract. A DSProxy is auth-gated — a stranger cannot call the
 *  owner's proxy — so tx_to on the owner (or their proxy) means the owner
 *  initiated the transaction whoever signed it. The owner is the one IN FORCE
 *  at the event's block (era-aware — `give` transfers re-home a vault, so a
 *  pre-give event judges against the owner of its own era, not the current
 *  one). */
export const externalActorProv = (
  args: { owner: string; txFrom: string; txTo: string },
  coords: MakerCoords,
): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `Executed by a third party — the vault owner neither signed the transaction nor initiated it through their own proxy. The transaction sender and the transaction's entry contract are both chain facts${atBlock(coords)}; each is compared against the owner AS OF this event's block — the vault's give history decides which owner was in force — and the entry contract also against that owner's DSProxy, which only its owner can call. Routed owner flows keep the owner as signer, and proxy-initiated owner flows keep the owner's proxy as the entry contract — this operation has neither.`,
  contract: VAT,
  via: `${MAKER_VIA} · tx envelope from + to vs owner-at-block + vault proxy`,
  inputs: eventInputs(coords, [
    {
      label: "vault owner",
      value: args.owner,
      kind: "chain",
      note: "owner in force at this event's block (give history; CdpManager owns → DSProxy.owner)",
    },
    {
      label: "transaction sender",
      value: args.txFrom,
      kind: "chain",
      note: "signed the transaction (tx envelope from)",
    },
    {
      label: "entry contract",
      value: args.txTo,
      kind: "chain",
      note: "the transaction's to — not the owner, nor the owner's auth-gated proxy",
    },
  ]),
});

/** The vault's new holder on a `give` (ownership transfer) row — the dst
 *  argument of CdpManager.give, decoded from the CdpManager's LogNote. The
 *  CdpManager's owner record points here from this event on; often a DSProxy
 *  rather than the end user (the resolved owner is its own trace). */
export const giveDstProv = (coords: MakerCoords): Provenance => ({
  kind: "chain",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The vault's new holder — the dst argument of CdpManager.give(cdp, dst), decoded from the CdpManager's LogNote (topic 3)${atBlock(coords)}. The CdpManager's owner record for this vault points here from this event on. Often a DSProxy (a user's proxy contract) — the resolved owner beside it traces the hop.`,
  contract: CDP_MANAGER,
  via: "captured CdpManager give LogNotes (maker_give) · topic3 dst",
  inputs: eventInputs(coords),
});

/** The owner before a give: the previous give's destination, or for the
 *  vault's first give the account that held it (the give's caller, which the
 *  CDP manager requires to be the owner or an address it allowed). */
export const ownerBeforeProv = (coords: MakerCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "emitted",
  verify: txVerify(coords),
  summary: `The vault's owner before this transfer — the destination of the vault's previous give, or, before any give, the account that held it (this give's caller: CdpManager.give requires the owner or an address the owner allowed)${atBlock(coords)}. An Instadapp account or a DSProxy is named by the transaction read at its block (owner(), the Proxy Registry, the Instadapp index).`,
  contract: CDP_MANAGER,
  via: "captured CdpManager give LogNotes (maker_give) · previous dst / caller",
  inputs: eventInputs(coords),
});

/** The new owner behind a give's dst, resolved through the DSProxy hop —
 *  a head-time chain read (the chain keeps no per-block proxy-owner history),
 *  recorded as such. */
export const giveOwnerProv = (coords: MakerCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `The new owner behind this transfer — the give's dst resolved through the DSProxy hop (DSProxy.owner()), the same resolution the vault's owner column uses. A chain read taken at scan time (head): the chain keeps no per-block history of a proxy's internal owner, so if the proxy's owner later changed without a give, this names the current one${atBlock(coords)}.`,
  contract: CDP_MANAGER,
  via: "give dst → DSProxy.owner() eth_call (head read at scan)",
  inputs: eventInputs(coords),
});

/** The ilk's OSM price itself (live) — inverted from the Vat spot and the
 *  Spotter mat, exactly reversing Spotter.poke's write. Chain-derived: both
 *  operands are live chain reads and the algebra is Maker's own. */
export const osmPriceProv = (collSym: string, ilk: string): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `The ${collSym} price Maker itself acts on for ${ilk} — the OSM (Oracle Security Module) price, recovered by inverting Spotter.poke: price = spot × par × mat ÷ RAY². The OSM delays feeds by one hour by design, so this is the protocol's operative price, not the spot market's.`,
  contract: { name: "Spotter", address: MAKER_ADDRESSES.SPOTTER },
  via: "Vat.ilks(ilk).spot × Spotter.par × Spotter.ilks(ilk).mat ÷ RAY²",
  formula: "spot × par × mat ÷ RAY²",
});

/** The collateral price at which the Vat's own safety line is crossed —
 *  liqPrice = DAI debt × mat ÷ ink. Algebraically EQUIVALENT to the Vat
 *  predicate ink·spot ≥ art·rate (equivalence machine-verified in
 *  scripts/verify-makerdao-chain.mjs §4), so this is the contract's line
 *  restated as a price, not a client risk model. */
export const liquidationPriceProv = (debtDaiHuman: string, matPct: string, inkHuman: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `The collateral price at which this vault crosses the liquidation line — the vault is safe exactly while ink × spot ≥ art × rate (the Vat's own predicate), which rearranges to price ≥ DAI debt × mat ÷ ink. Every input is a live chain read; the equivalence to the Vat's predicate is machine-verified, so this is the contract's line.`,
  contract: VAT,
  via: "Vat safety line (ink·spot ≥ art·rate), rearranged for price",
  formula: "DAI debt × mat ÷ ink",
  inputs: [
    { label: "DAI debt", value: debtDaiHuman, kind: "chain-derived", pclass: "state", note: "art × rate (Vat)" },
    { label: "mat", value: matPct, kind: "chain", pclass: "state", note: "Spotter.ilks(ilk).mat — liquidation ratio" },
    { label: "ink", value: inkHuman, kind: "chain", pclass: "state", note: "urn.ink collateral" },
  ],
});

/** The ilk's liquidation ratio `mat` (Spotter slot, live). */
export const matProv = (ilk: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `The minimum collateralization ${ilk} vaults must keep — the Spotter's mat slot for the ilk. Below it the vault can be liquidated (Dog.bark). A live chain read of Maker's own parameter.`,
  contract: { name: "Spotter", address: MAKER_ADDRESSES.SPOTTER },
  via: "Spotter.ilks(ilk).mat · ray ÷10^27",
});

/** The ilk's live stability fee, compounded to an APR. The per-second rate
 *  (Jug base + duty) is the chain's own parameter; the yearly figure only
 *  compounds it over a year's seconds — the same restatement every rate UI
 *  makes, with the formula on its face. */
export const stabilityFeeAprProv = (ilk: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `The stability fee ${ilk} debt accrues — Maker's own per-second rate (Jug.base + Jug.ilks(ilk).duty, ray) compounded over a year's seconds. The per-second rate is a live chain read; the APR restates it at the familiar grain. Governance can change the duty at any time, so this is the CURRENT rate.`,
  contract: { name: "Jug", address: MAKER_ADDRESSES.JUG },
  via: "Jug.base + Jug.ilks(ilk).duty · compounded",
  formula: "((base + duty) ÷ RAY) ^ 31,536,000 − 1",
});

/** The ilk's minimum vault debt (`dust`). RAD-scaled slot (1e45). */
export const dustProv = (ilk: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `The minimum debt an ${ilk} vault may carry — the Vat's dust parameter. A vault cannot wipe to a remainder below it (only to exactly zero). Live chain read; rad ÷ 10^45 for the DAI figure.`,
  contract: VAT,
  via: "Vat.ilks(ilk).dust · rad ÷10^45",
});

/** The ilk's debt ceiling utilization — total ilk debt (Art × rate) vs line. */
export const ilkCeilingProv = (ilk: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `How much of the ${ilk} debt ceiling is drawn — the ilk's total debt (Vat.ilks(ilk).Art × rate) against its ceiling (line). All three are live Vat reads.`,
  contract: VAT,
  via: "Vat.ilks(ilk) · Art × rate vs line",
  formula: "Art × rate ÷ 10^27 vs line ÷ 10^45",
});

/** Borrow headroom to the mat line — how much more DAI the vault could draw
 *  before crossing the ilk's minimum collateralization. */
export const borrowHeadroomProv = (matPct: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `How much more DAI this vault could draw before crossing the ${matPct} minimum collateralization — collateral USD ÷ mat − current DAI debt. Every input is a live chain read (Vat slots + the OSM price); the algebra rearranges Maker's own safety line.`,
  contract: VAT,
  via: "collateral USD ÷ mat − DAI debt",
  formula: "ink × price ÷ mat − art × rate",
});

/** Collateralization ratio — collateral USD (ink × OSM price) ÷ DAI debt (art ×
 *  rate), as a percentage. More than one derivation step from chain, but EVERY
 *  leaf is on-chain (Vat slots + Maker's own OSM oracle, not an off-chain feed),
 *  so it is chain-derived and shows in the chain-state view. What would push it out
 *  is an off-chain leaf (a DefiLlama price), never the step count. */
export const collateralRatioProv = (collUsdHuman: string, daiDebtHuman: string): Provenance => ({
  kind: "chain-derived",
  summary: `Collateralization ratio — the vault's collateral USD (ink × OSM price) divided by its DAI debt (art × rate), as a percentage. Every input is on-chain: the Vat slots and Maker's own OSM (Spotter) price. No off-chain feed, so it is chain-derived.`,
  contract: VAT,
  via: "collateral USD ÷ DAI debt",
  // Formula at the grain the inputs are traced at (the two composites); the
  // ink×price / art×rate leaf story rides each input's note.
  formula: "collateral USD ÷ DAI debt × 100",
  inputs: [
    {
      label: "collateral USD",
      value: collUsdHuman,
      kind: "chain-derived",
      pclass: "oracle",
      note: "ink × Maker OSM price",
    },
    { label: "DAI debt", value: daiDebtHuman, kind: "chain-derived", pclass: "state", note: "art × rate (Vat)" },
  ],
});

/** Peak collateral on a terminal card — the highest recorded ink over the
 *  vault's life. Exact at recorded events: ink is a Vat slot that only moves
 *  when a frob / grab / fork touches it, so the replayed maximum IS the peak. */
export const peakInkProv = (collSym: string, coords?: MakerCoords): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary: `The highest ${collSym} collateral this vault ever recorded — the maximum of the running ink balance after each captured event (frobs, liquidation seizures, vault-to-vault moves), from open to close. Ink only moves when an event touches it, so the recorded maximum is the vault's true peak. A token amount in the vault's own collateral.`,
  contract: VAT,
  via: `${MAKER_VIA} · max(ink after each event) · open → close${coords?.ilk ? ` · ${coords.ilk}` : ""}`,
});

/** Peak DAI/USDS debt on a terminal card — each event's normalized art repriced
 *  at the Vat rate accumulator in force AT that event (mig 051), so it is the
 *  debt actually owed at each on-chain touch, not a head-rate approximation. */
export const peakDebtProv = (symbol: string, coords?: MakerCoords): Provenance => ({
  kind: "derived",
  pclass: "indexed",
  summary: `The most ${symbol} this vault owed at any of its events, stability fee accrued to that event included — the larger of each event's normalized art before and after it, repriced at the Vat rate accumulator in force at that event. A liquidation's debt before is what it seized against. Measured at recorded events: the fee also accrues between events with no log of its own.`,
  contract: VAT,
  via: `${MAKER_VIA} · max(max(art before, art after) × rate-at-block) · open → close${coords?.ilk ? ` · ${coords.ilk}` : ""}`,
});

// ── The debt split: DAI drawn and the stability fee on it ────────────────────
// One definition for the card, the flows panel and every row
// (lib/makerdao/vault-history.tsx): the fee is the debt less the DAI drawn net
// of repayments since the vault last owed nothing.

/** The stability fee inside the vault's debt now. */
export const feeInDebtProv = (vals: { debt: string; drawn: string; since?: string }): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Stability fee in the debt — the debt owed now less the DAI drawn, net of repayments, since the vault last owed nothing${vals.since ? ` (${vals.since})` : ""}. A repayment is counted against the drawn DAI first.`,
  contract: VAT,
  via: "art × rate (live) − Σ (dart × rate@block) since the debt was last zero",
  formula: "debt now − DAI drawn since zero debt",
  inputs: [
    { label: "debt now", value: vals.debt, kind: "chain-derived", pclass: "state", note: "art × rate (Vat)" },
    {
      label: "DAI drawn",
      value: vals.drawn,
      kind: "chain-derived",
      pclass: "indexed",
      note: "each draw and repayment at its block's rate",
    },
  ],
});

// ── The ilk at an event's block (T2 of a row) ────────────────────────────────

/** The OSM price at a row's block. */
/** The collateral after an event valued as the Lifetime flows ledger values
 *  it: at the ilk's price at the close of the event's day in the daily price
 *  store (Vat spot × Spotter mat at the day's last block), or a liquidation's
 *  price at its block. */
export const flowValueProv = (
  collSym: string,
  coords: MakerCoords,
  vals: { amount: string; priceUsd: number },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  formula: "ink after × the ilk's price at the day's close",
  verify: {
    kind: "recompute",
    text: "Read Vat.ilks(ilk).spot × Spotter.ilks(ilk).mat at the last block of the event's day (archive node) and multiply by the collateral after the event",
  },
  summary: `What the ${collSym} in the vault after this event was worth at Maker's oracle price at the close of the event's day, the price the Lifetime flows ledger values the event at. Rails records that price once a day for each collateral type.`,
  contract: SPOTTER,
  via: "the daily price store (maker:<ILK>, Vat spot × Spotter mat at the day's last block)",
  inputs: [
    { label: "collateral after", value: `${vals.amount} ${collSym}`, kind: "chain", note: "ink after the event" },
    { label: `${collSym} price`, value: String(vals.priceUsd), kind: "chain", note: "spot × mat at the day's close" },
    ...eventInputs(coords),
  ],
});

export const eventPriceProv = (collSym: string, coords: MakerCoords, priceUsd: number): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  formula: "Vat.ilks(ilk).spot × Spotter.par × Spotter.ilks(ilk).mat ÷ RAY²",
  verify: {
    kind: "recompute",
    text:
      coords.blockNumber != null
        ? `Re-run the Vat.ilks and Spotter.ilks eth_calls at block ${coords.blockNumber} (archive node) and multiply spot × mat`
        : "Re-run the Vat.ilks and Spotter.ilks eth_calls (archive node) and multiply spot × mat",
  },
  summary: `${collSym} OSM price at this event — the price the Vat checked this change against${atBlock(coords)}: the Spotter stores spot = price ÷ par ÷ mat, so spot × par × mat gives the price back. Read by eth_call at the block.`,
  contract: SPOTTER,
  via: "Vat.ilks · spot × Spotter.par × Spotter.ilks · mat, eth_call at the event's block",
  inputs: [
    { label: `${collSym} price`, value: String(priceUsd), kind: "chain", note: "spot × par × mat" },
    ...eventInputs(coords),
  ],
});

/** The collateral ratio before or after a row, at the row's price. */
export const eventRatioProv = (
  side: "before" | "after",
  coords: MakerCoords,
  vals: { collateralUsd: string; debt: string },
): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `Collateral ratio ${side} this event — the collateral ${side} it times the OSM price at the block, divided by the debt ${side} it.`,
  contract: VAT,
  via: `ink ${side} × price at block ÷ debt ${side}`,
  formula: "collateral × price ÷ debt × 100",
  inputs: [
    { label: "collateral value", value: vals.collateralUsd, kind: "chain-derived", pclass: "oracle" },
    { label: "debt", value: vals.debt, kind: "chain-derived", pclass: "indexed", note: "art × rate@block" },
    ...eventInputs(coords),
  ],
});

/** The ilk's minimum ratio at a row's block. */
export const matAtBlockProv = (ilk: string, coords: MakerCoords): Provenance => ({
  kind: "chain",
  pclass: "state",
  summary: `${ilk}'s minimum collateral ratio at this event — the Spotter's mat for the ilk, read by eth_call${atBlock(coords)}.`,
  contract: SPOTTER,
  via: "Spotter.ilks(ilk).mat at the event's block",
  inputs: eventInputs(coords),
});

/** How much more DAI the vault could have drawn after a row. */
export const roomAtBlockProv = (coords: MakerCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  summary: `DAI the vault could still draw after this event — its collateral value at the block's OSM price divided by the minimum ratio, less the debt after the event.`,
  contract: VAT,
  via: "ink after × price at block ÷ mat − debt after",
  formula: "ink × price ÷ mat − debt",
  inputs: eventInputs(coords),
});

// ── The auction behind a liquidation (Dog.Bark, Clipper.Kick / Take) ────────

const DOG = { name: "Dog", address: MAKER_ADDRESSES.DOG };

export type MakerAuctionFigure = "ratio" | "tab" | "penalty" | "sold" | "raised" | "leftover" | "shortfall";

export const auctionProv = (
  figure: MakerAuctionFigure,
  coords: MakerCoords,
  vals: { clip?: string; auctionId?: string; value?: string } = {},
): Provenance => {
  const where = vals.auctionId ? ` (auction ${vals.auctionId}${vals.clip ? ` on Clipper ${vals.clip}` : ""})` : "";
  const texts: Record<MakerAuctionFigure, { summary: string; via: string; formula?: string }> = {
    ratio: {
      summary: `Collateral ratio at seizure — the seized collateral at the OSM price of the block divided by the debt the liquidation cleared. The Dog could bark only because it was under the minimum.`,
      via: "Bark.ink × price at block ÷ Bark.due",
      formula: "ink × price ÷ debt × 100",
    },
    tab: {
      summary: `What the auction had to raise — the Clipper's Kick tab${where}: the debt cleared times the ilk's penalty factor.`,
      via: "Clipper Kick · tab ÷ 10^45",
      formula: "due × chop",
    },
    penalty: {
      summary: `Liquidation penalty — the auction's tab less the debt cleared (Dog Bark · due)${where}. It went to the protocol's surplus.`,
      via: "Kick.tab − Bark.due",
      formula: "tab − due",
    },
    sold: {
      summary: `Collateral the auction sold — the lot at the Kick less what remained after the closing Take${where}.`,
      via: "Kick.lot − last Take.lot",
      formula: "lot − lot left",
    },
    raised: {
      summary: `DAI the buyers paid — the sum of every Take's owe${where}.`,
      via: "Σ Take.owe ÷ 10^45",
      formula: "Σ owe",
    },
    leftover: {
      summary: `Collateral handed back to the vault — the lot left when a Take covered the whole tab${where}; the Clipper sends it to the vault's address (vat.flux).`,
      via: "last Take.lot where Take.tab = 0",
    },
    shortfall: {
      summary: `Debt the auction did not cover — the tab left when the lot ran out${where}; the protocol absorbs it.`,
      via: "last Take.tab where Take.lot = 0",
    },
  };
  const t = texts[figure];
  return {
    kind: "chain",
    pclass: "emitted",
    verify: txVerify(coords),
    summary: t.summary,
    contract: figure === "ratio" || figure === "penalty" || !vals.clip ? DOG : { name: "Clipper", address: vals.clip },
    via: t.via,
    ...(t.formula ? { formula: t.formula } : {}),
    inputs: eventInputs(coords, vals.value ? [{ label: figure, value: vals.value, kind: "chain" }] : []),
  };
};
