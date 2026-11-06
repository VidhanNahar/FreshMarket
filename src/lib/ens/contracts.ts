import { keccak256, parseAbi, toBytes } from "viem";

/** Minimal interfaces verified against the pinned ENSv2 deployment in shared/ens-deployment.json. */
export const registryAbi = parseAbi([
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource) state)",
  "function getTokenId(uint256 anyId) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function initialize((address account, uint256 roleBitmap)[] grants)",
  "event LabelRegistered(uint256 indexed tokenId, bytes32 indexed labelHash, string label, address owner, uint64 expiry, address indexed sender)",
]);
export const universalResolverAbi = parseAbi([
  "function ROOT_REGISTRY() view returns (address)",
  "function resolve(bytes name, bytes data) view returns (bytes, address)",
  "function reverse(bytes lookupAddress, uint256 coinType) view returns (string, address, address)",
]);
export const resolverProfileAbi = parseAbi([
  "function addr(bytes32 node) view returns (address)",
  "function text(bytes32 node, string key) view returns (string)",
]);

// ENSv2 PermissionedResolver setters use DNS-encoded names, not namehashes.
// Never point these setters at PublicResolverV2 or an implementation contract.
export const permissionedResolverAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "function multicall(bytes[] calls) returns (bytes[])",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
  "function setText(bytes name, string key, string value)",
  "function resolve(bytes name, bytes data) view returns (bytes)",
  // Delegation (EnhancedAccessControl). grantRoles() is disabled on this resolver; scoped grants
  // go through grantSetterRoles(<setter calldata>, account), which derives the resource itself.
  "function grantSetterRoles(bytes setter, address account) returns (bool)",
  "function revokeRoles(uint256 resource, uint256 roleBitmap, address account) returns (bool)",
  "function hasRoles(uint256 resource, uint256 roleBitmap, address account) view returns (bool)",
  "function roles(uint256 resource, address account) view returns (uint256)",
  "event EACRolesChanged(uint256 indexed resource, address indexed account, uint256 oldRoleBitmap, uint256 newRoleBitmap)",
  "event ResourceArgument(uint256 indexed resource, bytes arg)",
  "event Initialized(uint64 version)",
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACCannotGrantRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACCannotRevokeRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACInvalidAccount()",
]);

// PermissionedResolverLib (ensdomains/contracts-v2 @ the pinned deployment commit).
export const ROLE_SET_ADDRESS = 1n;
export const ROLE_SET_TEXT = 1n << 4n;
/** Lets its holder grant/revoke ROLE_SET_TEXT, root-wide or for a single text key. */
export const ROLE_SET_TEXT_ADMIN = ROLE_SET_TEXT << 128n;

/** Text keys a storefront owner may delegate. Address and root roles are never delegated. */
export const DELEGABLE_TEXT_KEYS = ["freshmarket.description", "freshmarket.contact", "description", "url", "avatar"] as const;
export type DelegableTextKey = (typeof DELEGABLE_TEXT_KEYS)[number];
export function isDelegableTextKey(key: string): key is DelegableTextKey {
  return (DELEGABLE_TEXT_KEYS as readonly string[]).includes(key);
}
/** Same as PermissionedResolverLib.resource(string): a key-scoped (not name-scoped) EAC resource. */
export function textResource(key: string): bigint {
  return BigInt(keccak256(toBytes(key)));
}
// ENSv2's reverse mirror still uses the Sepolia v1 reverse registrar as its write path.
export const reverseRegistrarAbi = parseAbi(["function setName(string name) returns (bytes32)"]);

export const REGISTRAR_ROLE = 1n;
// Name-level permissions only: the seller can manage its resolver, renew and transfer its token.
// This does not emancipate the parent registry or grant root-level registration authority.
export const SELLER_ROLES = (1n << 16n) | (1n << 20n) | (1n << 24n) | (1n << 156n);

export const factoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address proxy)",
  "function predictProxyAddress(address deployer, uint256 salt) view returns (address proxy)",
  "function verifyContract(address proxy) view returns (address implementation)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
]);
const registryRegularRoles = REGISTRAR_ROLE | (1n << 8n) | (1n << 16n) | (1n << 20n) | (1n << 24n);
export const REGISTRY_OPERATOR_ROLES = registryRegularRoles | (registryRegularRoles << 128n) | (1n << 156n);
// A seller gets address/text authority on its OWN resolver, not on a shared marketplace resolver.
// ROLE_SET_TEXT_ADMIN lets the seller delegate single text keys to a manager wallet. Because EAC
// resources are key-scoped (not name-scoped), a dedicated resolver per seller is what keeps a
// delegate from editing any other storefront.
export const RESOLVER_SELLER_ROLES = ROLE_SET_ADDRESS | ROLE_SET_TEXT | ROLE_SET_TEXT_ADMIN;
