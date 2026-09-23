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
  summary: `Collateral (${collSym}) the vault held AFTER this event — the vault's running collateral, replayed by summing the signed dink of its own frob/grab/fork operations in log order up to this block${atBlock(coords)}. A replay of the urn.ink slot, not a slot read — it matches when the captured history is complete.`,
  contract: VAT,
  via: `${MAKER_VIA} · Σ ±dink → urn.ink · in on-chain order`,
  inputs: eventInputs(coords),
});

/** Normalized debt `art` after this event = Σ dart. */
export const artAfterProv = (coords: MakerCoords): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  verify: stateVerify(coords),
  summary: `Normalized debt (art) the vault held AFTER this event — the vault's running normalized debt, replayed by summing the signed dart of its own frob/grab/fork operations in log order up to this block${atBlock(coords)}. A replay of the urn.art slot, not a slot read — it matches when the captured history is complete.`,
  contract: VAT,
  via: `${MAKER_VIA} · Σ ±dart → urn.art · in on-chain order`,
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
  summary: `Collateral (${collSym}) the vault held BEFORE this event — the urn.ink after minus the signed dink this frob/grab/fork applied (after − change), reconstructed in the browser from the replayed ink and the LogNote dink, not a distinct chain read. Exact (collateral doesn't accrue).`,
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

/** Normalized debt `art` BEFORE this event = art after − dart. Arithmetic over
 *  two on-chain figures (the replayed art and the LogNote dart), so chain-derived;
 *  art is normalized (interest lives in the ilk rate accumulator, not in art), so
 *  the reconstruction is exact at the art level. */
export const artBeforeProv = (coords: MakerCoords): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Normalized debt (art) the vault held BEFORE this event — the urn.art after minus the signed dart this frob/grab/fork applied (after − change), reconstructed in the browser from the replayed art and the LogNote dart, not a distinct chain read. Exact at the art level (interest lives in the ilk rate accumulator, not in art); multiply by rate for the DAI figure.`,
  contract: VAT,
  via: "urn.art after − dart",
  formula: "after − change",
  inputs: eventInputs(coords, [
    { label: "after", kind: "chain", pclass: "indexed", note: "replayed urn.art after this event" },
    { label: "change", kind: "chain", pclass: "emitted", note: "the LogNote dart (signed)" },
  ]),
});

/** Current debt = art × rate — the one §2 multiply, both operands chain reads.
 *  `symbol` names the token the Vat unit mints for THIS vault: DAI through the
 *  DaiJoin for CdpManager vaults, USDS through the UsdsJoin for LockStake urns
 *  (decision 0013). */
export const daiDebtProv = (artHuman: string, rateRay: string, symbol: string = "DAI"): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary: `Current ${symbol} debt of the vault — the normalized art multiplied by the ilk's rate accumulator. Both operands are chain reads (the §2 index resolution) and the product is Maker's own debt figure, so it's chain-derived, not a model.`,
  contract: VAT,
  via: "urn.art (Σ dart replay) × Vat.ilks(ilk).rate (live)",
  formula: "art × rate ÷ 10^27",
  inputs: [
    { label: "art", value: artHuman, kind: "chain", pclass: "indexed", note: "Σ dart (replay of the urn.art slot)" },
    { label: "rate", value: rateRay, kind: "chain", pclass: "state", note: "Vat.ilks(ilk).rate, ray — live read" },
  ],
});

/** Accrued stability fee = art × rate − art (the DAI the rate accumulator has
 *  charged on the currently-outstanding normalized debt). Both operands are Vat
 *  reads, so the fee carry is chain-direct, not a projection. */
export const stabilityFeeProv = (artHuman: string, rateRay: string): Provenance => ({
  kind: "chain-derived",
  pclass: "state",
  summary:
    "Accrued stability fee on this vault — the difference between the current DAI debt (art × rate) and the normalized art, i.e. the DAI the ilk's rate accumulator has charged since each draw. Both operands are Vat reads, so this carry is read from the chain, not a forward projection.",
  contract: VAT,
  via: "urn.art (Σ dart replay) × (Vat.ilks(ilk).rate − 1)",
  formula: "art × rate ÷ 10^27 − art",
  inputs: [
    { label: "art", value: artHuman, kind: "chain", pclass: "indexed", note: "Σ dart (replay of the urn.art slot)" },
    { label: "rate", value: rateRay, kind: "chain", pclass: "state", note: "Vat.ilks(ilk).rate, ray — live read" },
  ],
});

/** Lifetime gross collateral flow (deposited / withdrawn / liquidated / moved
 *  out) — the sum of the signed dink deltas of that kind over the vault's life.
 *  Chain-state amounts (frob/grab/fork dink); the tower values them at the
 *  current OSM price. */
export const collateralFlowProv = (
  flow: "deposited" | "withdrawn" | "liquidated" | "moved out",
  collSym: string,
): Provenance => ({
  kind: "chain",
  pclass: "indexed",
  summary: `Total ${collSym} ${flow} over the vault's life — the sum of the ${
    flow === "liquidated"
      ? "grab seizures"
      : flow === "moved out"
        ? "Vat fork position moves to another urn (no tokens transferred — the collateral relocated with its debt)"
        : `frob dink ${flow === "deposited" ? "increases" : "decreases"}`
  } across the vault's own Vat operations. Chain-state amounts; valued at the current OSM price.`,
  contract: VAT,
  via: `${MAKER_VIA} · Σ dink (${flow})`,
});

/** Lifetime gross DAI debt flow (generated / repaid / liquidated) — each historic
 *  `dart` valued at the Vat rate accumulator AS OF its own block, i.e. the DAI
 *  actually minted or burned at that draw/wipe. Chain-state: dart is a decoded
 *  LogNote word and rate@block is reconstructed from the captured `maker_fold`
 *  deltas, so the product is the §2 multiply at a historic block — not a model. */
export const debtFlowProv = (flow: "generated" | "repaid" | "liquidated" | "moved out"): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  summary: `Total DAI ${flow} over the vault's life — the sum of each ${
    flow === "liquidated"
      ? "grab debt seizure"
      : flow === "moved out"
        ? "Vat fork debt move to another urn (no DAI burned — the debt relocated with its collateral)"
        : `frob dart ${flow === "generated" ? "draw" : "repayment"}`
  } valued at the ilk's rate accumulator as of that event's block${
    flow === "generated" || flow === "repaid"
      ? ` (the DAI actually ${flow === "repaid" ? "burned" : "minted"} then)`
      : ""
  }. Both operands are chain values — the dart LogNote word and the rate replayed from the Vat's own fold deltas — so each term is read from the chain.`,
  contract: VAT,
  via: `${MAKER_VIA} · Σ (dart × rate@block ÷ 10^45) (${flow})`,
  formula: "Σ dart × rate@block ÷ 10^45",
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
  summary: `What the seized collateral was worth at the moment of the grab — the collateral this seizure moved (the grab LogNote's dink) times the ilk's own OSM price recovered at the event's block. Both factors are chain values pinned to this block. The collateral went to a Dutch auction, not to a liquidator directly.`,
  contract: VAT,
  via: `${MAKER_VIA} · |dink| × (spot × mat) at block`,
  inputs: [
    { label: "seized", value: `${vals.amount} ${collSym}`, kind: "chain", note: "grab LogNote · dink" },
    { label: "price at block", value: String(vals.priceUsd), kind: "chain", note: "Vat spot × Spotter mat" },
    ...eventInputs(coords),
  ],
});

/** The cleared-debt leg — |dart| × rate@block: DAI, the Vat's own unit. */
export const grabClearedDaiProv = (coords: MakerCoords, vals: { amount: string; dai: string }): Provenance => ({
  kind: "chain-derived",
  pclass: "indexed",
  formula: "dart × rate@block ÷ 10^45",
  verify: txVerify(coords),
  summary: `The debt this grab cleared from the vault, in DAI — the grab LogNote's dart valued at the ilk's rate accumulator as of this block (replayed from the Vat's own fold deltas). DAI is the Vat's own unit of account, so no price is applied: this is the protocol's exact reckoning of the debt seized into the liquidation system. The liquidation penalty (chop) is added on top at auction, not here.`,
  contract: VAT,
  via: `${MAKER_VIA} · |dart| × rate@block ÷ 10^45`,
  inputs: [
    { label: "debt cleared", value: `${vals.amount} (normalized art)`, kind: "chain", note: "grab LogNote · dart" },
    { label: "in DAI", value: vals.dai, kind: "chain", note: "× rate@block" },
    ...eventInputs(coords),
  ],
});

/** The cushion the seizure carried into the auction — seized ÷ cleared − 1. */
export const grabCushionProv = (coords: MakerCoords, vals: { seizedUsd: string; clearedDai: string }): Provenance => ({
  kind: "chain-derived",
  pclass: "oracle",
  formula: "seized ÷ cleared − 1",
  verify: txVerify(coords),
  summary: `The vault's cushion at seizure — seized collateral value over cleared DAI debt, minus one, both at the block's own figures. Unlike Aave-model liquidations this is NOT a liquidator's realized bonus: the collateral went to a Dutch auction, where the liquidation penalty (chop) is charged on top of the debt and any remainder above debt + penalty returns to the vault owner as surplus. The cushion is what there was to auction over.`,
  contract: VAT,
  via: "seized ÷ cleared − 1 · both legs at the block's own figures",
  inputs: [
    { label: "seized", value: vals.seizedUsd, kind: "chain", note: "|dink| × price at block" },
    { label: "cleared", value: vals.clearedDai, kind: "chain", note: "|dart| × rate@block" },
    ...eventInputs(coords),
  ],
});

/** Position-card slot phrasing: the replay reconstructs the Vat.urns slot from the
 *  vault's own frob/grab/fork deltas. */
export const vaultSlotPhrase = (): string => "replayed from the vault's own Vat frob/grab/fork operations (Σ dink)";

/** Stated on a terminal vault's sub-dust balance: why a "closed" record still
 *  shows a figure, and why it isn't rounded away. */
const RESIDUE_SENTENCE =
  " This is a wei-scale residue on a terminal record — the remainder left in the slot when the record emptied, below the 0.000001 dust line the lifecycle status reads balances against; it renders at its true magnitude rather than as a zero.";

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
      ? `Collateral (${collSym}) the vault holds — the Vat's own \`urns(ilk, urn).ink\` slot, read by eth_call${atBlock ? ` at block ${atBlock}` : ""}. A slot read, not a replay: the same block pins every other figure on this card.${residue ? RESIDUE_SENTENCE : ""}`
      : `Collateral (${collSym}) the vault holds — ${vaultSlotPhrase()}${atBlock ? ` at block ${atBlock}` : ""}. A replay of the urn.ink slot, not a slot read.${residue ? RESIDUE_SENTENCE : ""}`,
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
      ? `Normalized debt (art) the vault holds — the Vat's own \`urns(ilk, urn).art\` slot, read by eth_call${atBlock ? ` at block ${atBlock}` : ""}. A slot read, not a replay. Multiply by the ilk rate for the DAI figure.${residue ? RESIDUE_SENTENCE : ""}`
      : `Normalized debt (art) the vault holds — ${vaultSlotPhrase().replace("Σ dink", "Σ dart")}${
          atBlock ? ` at block ${atBlock}` : ""
        }. A replay of the urn.art slot, not a slot read. Multiply by the ilk rate for the DAI figure.${residue ? RESIDUE_SENTENCE : ""}`,
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
  summary: `The vault's new holder — the dst argument of CdpManager.give(cdp, dst), decoded from the CdpManager's LogNote (topic 3)${atBlock(coords)}. The CdpManager's owner record for this vault points here from this event on. Often a DSProxy (a user's proxy contract) rather than the end user — the resolved owner beside it traces the hop.`,
  contract: CDP_MANAGER,
  via: "captured CdpManager give LogNotes (maker_give) · topic3 dst",
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
  summary: `The collateral price at which this vault crosses the liquidation line — the vault is safe exactly while ink × spot ≥ art × rate (the Vat's own predicate), which rearranges to price ≥ DAI debt × mat ÷ ink. Every input is a live chain read; the equivalence to the Vat's predicate is machine-verified, so this is the contract's line, not a model.`,
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
  summary: `The stability fee ${ilk} debt accrues — Maker's own per-second rate (Jug.base + Jug.ilks(ilk).duty, ray) compounded over a year's seconds. The per-second rate is a live chain read; the APR restates it at the familiar grain. Governance can change the duty at any time, so this is the CURRENT rate, not a promise.`,
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
  summary: `Collateralization ratio — the vault's collateral USD (ink × OSM price) divided by its DAI debt (art × rate), as a percentage. Every input is on-chain: the Vat slots and Maker's own OSM (Spotter) price. No off-chain feed, so it is chain-derived, not interpretation.`,
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
  summary: `The highest ${symbol} debt this vault ever recorded — each captured event's normalized art repriced at the Vat rate accumulator in force at that event, the ${symbol} actually owed at that on-chain touch. Measured at recorded events only: the stability fee accrues between events with no log of its own, so the true peak can sit slightly above this figure.`,
  contract: VAT,
  via: `${MAKER_VIA} · max(art × rate-at-block) · open → close${coords?.ilk ? ` · ${coords.ilk}` : ""}`,
});
