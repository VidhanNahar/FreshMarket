#!/usr/bin/env node
// Read-only proof of ENSv2 delegation on Sepolia: `npm run verify:ens-delegation`.
// Simulates the same setText from the revoked shop manager and from the owner at the latest block.
// No wallet, key or transaction is used; eth_call only.
import { bytesToHex, createPublicClient, encodeFunctionData, http, parseAbi } from "viem";
import { sepolia } from "viem/chains";
import { packetToBytes } from "viem/ens";

const NAME = "alice.freshmarket.eth";
const RESOLVER = "0xB4386FDb621B529658732F62522Da885ecc622cE"; // alice's own PermissionedResolver
const OWNER = "0x2D63097b7d955d487F06523f05676611146CA905";
const REVOKED_MANAGER = "0xDD4aCF89e75f3673222A25f57Aec12D30307f4f5";
const KEY = "freshmarket.description";

const client = createPublicClient({ chain: sepolia, transport: http(process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com") });
const abi = parseAbi(["function setText(bytes name, string key, string value)"]);
const data = encodeFunctionData({ abi, functionName: "setText", args: [bytesToHex(packetToBytes(NAME)), KEY, "simulated edit"] });
const block = await client.getBlockNumber();

async function canEdit(account) {
  try { await client.call({ account, to: RESOLVER, data, blockNumber: block }); return true; }
  catch { return false; }
}
const result = {
  checkedAt: new Date().toISOString(), block: block.toString(), name: NAME, resolver: RESOLVER, key: KEY,
  currentValue: await client.getEnsText({ name: NAME, key: KEY, universalResolverAddress: "0x24E1D8e068620B647CA097f961A61055f4f42D72" }),
  ownerCanEdit: await canEdit(OWNER),
  revokedManagerCanEdit: await canEdit(REVOKED_MANAGER),
};
console.log(JSON.stringify(result, null, 2));
if (!result.ownerCanEdit || result.revokedManagerCanEdit) process.exitCode = 1;
