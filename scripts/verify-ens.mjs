import { createPublicClient, getAddress, http, keccak256, parseAbi, toBytes, zeroAddress } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import deployment from "../shared/ens-deployment.json" with { type: "json" };

// Read-only proof for #27. No wallet, signer, private key, or transaction is initialized.
for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
const root = getAddress(process.env.NEXT_PUBLIC_ENS_ROOT_REGISTRY_ADDRESS || deployment.rootRegistry);
const expectedEth = getAddress(process.env.NEXT_PUBLIC_ENS_ETH_REGISTRY_ADDRESS || deployment.ethRegistry);
const universalResolver = getAddress(process.env.NEXT_PUBLIC_ENS_UNIVERSAL_RESOLVER_ADDRESS || deployment.universalResolver);
const client = createPublicClient({
  chain: sepolia,
  transport: http(process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com", { timeout: 10_000, retryCount: 1 }),
});
const abi = parseAbi([
  "function ROOT_REGISTRY() view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource) state)",
]);
if (await client.getChainId() !== deployment.chainId) throw new Error("RPC endpoint is not Ethereum Sepolia");
const block = await client.getBlockNumber();
const code = await client.getCode({ address: root, blockNumber: block });
if (!code || code === "0x") throw new Error("No ENSv2 root contract at the configured address");
const ethRegistry = await client.readContract({ address: root, abi, functionName: "getSubregistry", args: ["eth"], blockNumber: block });
if (ethRegistry.toLowerCase() !== expectedEth.toLowerCase()) throw new Error("The configured ENSv2 root does not route .eth to the expected registry");
const eth = await client.readContract({ address: root, abi, functionName: "getState", args: [BigInt(keccak256(toBytes("eth")))], blockNumber: block });
const universalResolverRoot = await client.readContract({ address: universalResolver, abi, functionName: "ROOT_REGISTRY", blockNumber: block });
if (universalResolverRoot.toLowerCase() !== root.toLowerCase()) throw new Error("Universal Resolver currently routes a different ENS root; review deployment configuration");
const proof = {
  checkedAt: new Date().toISOString(), chainId: deployment.chainId, block,
  rootRegistry: root, ethRegistry, ethStatus: eth.status, universalResolver, universalResolverRoot, source: deployment.source,
};
const parent = process.env.NEXT_PUBLIC_ENS_PARENT_NAME;
if (parent) {
  const labels = normalize(parent).split(".").reverse();
  let registry = root;
  for (const label of labels) {
    registry = await client.readContract({ address: registry, abi, functionName: "getSubregistry", args: [label], blockNumber: block });
    if (registry === zeroAddress) break;
  }
  proof.parentName = normalize(parent);
  proof.parentSubregistry = registry;
}
console.log(JSON.stringify(proof, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
