import { parseAbi } from "viem";

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
]);
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
// A seller gets address/text authority on its own resolver, not on a shared marketplace resolver.
export const RESOLVER_SELLER_ROLES = 1n | (1n << 4n);
