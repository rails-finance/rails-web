// Aave V4's position managers and gateways, by address, on both deployments:
// the contracts a spoke event names as its caller when they act for the
// position's owner. Source: aave-dao/aave-address-book, src/AaveV4Ethereum.sol
// and src/AaveV4Base.sol (`AaveV4<Chain>PositionManagers`). The names they
// print are the `manager_*` words in content/aave-v4/event-prose.yaml.

export type AaveV4ManagerKind = "giver" | "taker" | "config" | "native_gateway" | "signature_gateway";

/** Lowercased address → which manager it is. */
const MANAGERS: Readonly<Record<string, AaveV4ManagerKind>> = {
  // Ethereum
  "0x17a54b8d6d9c68e7fa1c7112ac998ea1ba51d11e": "giver",
  "0x6c044c0d3801499bcabfad458b70880bc518e9f7": "taker",
  "0x51305839ce822a7b4b12aa7d86ea7005052d575c": "config",
  "0xe68ab4f90fe026b9873f5f276ed2d7efbbbe42be": "native_gateway",
  "0xfbc184337dc6595d8bf62968bda46e7de7af9c3d": "signature_gateway",
  // Base
  "0x9e81c2fde4e34cab3ab1667ca3c932dbaed95f08": "giver",
  "0x8481204e528735af2f3391ad98f36e757a56d695": "taker",
  "0xe90f830bee4b190b4910e146908437075b0bdaaf": "config",
  "0xdfc11f7037ba11d9cc29a822844f5dc19c42b70d": "native_gateway",
  "0x5d488d3eaaa86ddb6d4f834fc34938054ec505a7": "signature_gateway",
};

/** The manager an address is, or null for one the address book does not list. */
export function aaveV4ManagerKind(address: string | null | undefined): AaveV4ManagerKind | null {
  return address ? (MANAGERS[address.toLowerCase()] ?? null) : null;
}
