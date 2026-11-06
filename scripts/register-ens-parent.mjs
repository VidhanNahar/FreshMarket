// Register a Sepolia .eth parent name for FreshMarket for free (testnet only).
// Payment is MockUSDC, which anyone can mint; gas is Sepolia ETH from a faucet.
//
//   Dry run (no key, nothing sent):  node scripts/register-ens-parent.mjs freshmarket --address 0xYourWallet
//   Real run (signs with a TEST wallet key from .env.local ENS_REGISTRANT_PRIVATE_KEY):
//                                    node scripts/register-ens-parent.mjs freshmarket --send
//
// Contracts: ensdomains/contracts-v2 @ 07e55a05, contracts/deployments/sepolia (Sourcify-verified).
import fs from "node:fs";
import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, formatUnits, getAddress, http, keccak256, parseAbi, toBytes, toHex, zeroAddress, zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";

for (const file of [".env.local", ".env"]) {
  try { process.loadEnvFile(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
const REGISTRAR = "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3";
const USDC = "0x240b0316df57887dbbe58b586508b19e633a14aa";
const ETH_REGISTRY = "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4";
const PENDING = "ens/.pending-registration.json"; // holds the commit secret so a crash can resume
const registrarAbi = parseAbi([
  "function isAvailable(string label) view returns (bool)",
  "function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)",
  "function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)",
  "function commitmentAt(bytes32 commitment) view returns (uint64)",
  "function MIN_COMMITMENT_AGE() view returns (uint64)",
  "function MAX_COMMITMENT_AGE() view returns (uint64)",
  "function commit(bytes32 commitment)",
  "function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)",
]);
const usdcAbi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);
const registryAbi = parseAbi(["function getState(uint256 anyId) view returns ((uint8 status, uint64 expiry, address latestOwner, uint256 tokenId, uint256 resource) state)"]);

const args = process.argv.slice(2);
const label = normalize((args.find((a) => !a.startsWith("--") && !a.startsWith("0x")) ?? "").replace(/\.eth$/, ""));
const send = args.includes("--send");
const years = BigInt(args[args.indexOf("--years") + 1] && args.includes("--years") ? args[args.indexOf("--years") + 1] : 1);
if (!/^[a-z0-9-]{3,63}$/.test(label)) throw new Error("Usage: node scripts/register-ens-parent.mjs <label> [--address 0x… | --send] [--years N]");
const duration = 31_536_000n * years;
const tx = (hash) => `https://sepolia.etherscan.io/tx/${hash}`;

const client = createPublicClient({ chain: sepolia, transport: http(process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com", { timeout: 20_000 }) });
if (await client.getChainId() !== 11155111) throw new Error("RPC is not Ethereum Sepolia");

let account, owner;
if (send) {
  // MetaMask exports keys without the 0x prefix; accept both forms.
  const raw = process.env.ENS_REGISTRANT_PRIVATE_KEY?.trim() ?? "";
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Set ENS_REGISTRANT_PRIVATE_KEY=<64 hex characters> (a TEST wallet) in .env.local");
  account = privateKeyToAccount(key);
  owner = account.address;
} else {
  const flag = args.indexOf("--address");
  if (flag < 0) throw new Error("Dry run needs --address 0xYourWallet (or use --send)");
  owner = getAddress(args[flag + 1]);
}
const read = (address, abi, functionName, a = []) => client.readContract({ address, abi, functionName, args: a });

console.log(`Name: ${label}.eth   Owner: ${owner}   Mode: ${send ? "SEND" : "dry run (nothing is signed)"}`);
if (!await read(REGISTRAR, registrarAbi, "isAvailable", [label])) throw new Error(`${label}.eth is not available; choose another label`);
const [base, premium] = await read(REGISTRAR, registrarAbi, "getRegisterPrice", [label, duration, USDC]);
const price = base + premium;
const ethBalance = await client.getBalance({ address: owner });
console.log(`Price: ${formatUnits(price, 6)} MockUSDC (free test token)   Gas balance: ${formatEther(ethBalance)} Sepolia ETH`);
if (ethBalance < 5_000_000_000_000_000n) {
  console.warn("⚠ Under 0.005 Sepolia ETH. Get free gas from sepolia-faucet.pk910.de first.");
  // A real run would fail mid-way with an opaque "insufficient funds" error; stop before sending anything.
  if (send) { console.error("✖ Not enough Sepolia ETH for gas. Nothing was sent."); process.exit(1); }
}
const minAge = await read(REGISTRAR, registrarAbi, "MIN_COMMITMENT_AGE");
const maxAge = await read(REGISTRAR, registrarAbi, "MAX_COMMITMENT_AGE");
const mintAmount = price * 2n > 1_000_000_000n ? price * 2n : 1_000_000_000n;

let pending = null;
try { pending = JSON.parse(fs.readFileSync(PENDING, "utf8")); } catch { /* none */ }
if (pending && (pending.label !== label || pending.owner !== owner || BigInt(pending.duration) !== duration)) pending = null;
const secret = pending?.secret ?? toHex(crypto.getRandomValues(new Uint8Array(32)));
const commitment = await read(REGISTRAR, registrarAbi, "makeCommitment", [label, owner, secret, zeroAddress, zeroAddress, duration, zeroHash]);

if (!send) {
  const call = (to, abi, functionName, a) => ({ from: owner, to, data: encodeFunctionData({ abi, functionName, args: a }) });
  const head = await client.getBlock();
  const [first, second] = await client.simulateBlocks({ blocks: [
    { blockOverrides: { time: head.timestamp + 12n }, calls: [call(USDC, usdcAbi, "mint", [owner, mintAmount]), call(USDC, usdcAbi, "approve", [REGISTRAR, price]), call(REGISTRAR, registrarAbi, "commit", [commitment])] },
    { blockOverrides: { time: head.timestamp + 12n + minAge + 10n }, calls: [call(REGISTRAR, registrarAbi, "register", [label, owner, secret, zeroAddress, zeroAddress, duration, USDC, zeroHash])] },
  ] });
  const steps = ["mint MockUSDC", "approve registrar", "commit", "register"];
  [...first.calls, ...second.calls].forEach((r, i) => console.log(`${r.status === "success" ? "✓" : "✗"} ${steps[i]}${r.error ? `: ${r.error.shortMessage}` : ""}`));
  console.log("Dry run only. Re-run with --send to do it for real.");
  process.exit(0);
}

const wallet = createWalletClient({ account, chain: sepolia, transport: http(process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com") });
async function write(step, address, abi, functionName, a) {
  const { request } = await client.simulateContract({ account, address, abi, functionName, args: a });
  const hash = await wallet.writeContract(request);
  console.log(`… ${step}: ${tx(hash)}`);
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") throw new Error(`${step} reverted: ${tx(hash)}`);
  console.log(`✓ ${step}`);
  return hash;
}

// Step 3: mint free MockUSDC (only if needed)
if (await read(USDC, usdcAbi, "balanceOf", [owner]) < price) await write("Mint MockUSDC", USDC, usdcAbi, "mint", [owner, mintAmount]);
else console.log("✓ Already have enough MockUSDC");
// Step 4: approve
if (await read(USDC, usdcAbi, "allowance", [owner, REGISTRAR]) < price) await write("Approve registrar", USDC, usdcAbi, "approve", [REGISTRAR, price]);
else console.log("✓ Registrar already approved");
// Steps 6–8: commit (resumes an earlier commitment that is still valid)
let committedAt = await read(REGISTRAR, registrarAbi, "commitmentAt", [commitment]);
const now = (await client.getBlock()).timestamp;
if (committedAt === 0n || now > committedAt + maxAge) {
  fs.writeFileSync(PENDING, JSON.stringify({ label, owner, duration: duration.toString(), secret }, null, 2));
  await write("Commit", REGISTRAR, registrarAbi, "commit", [commitment]);
  committedAt = await read(REGISTRAR, registrarAbi, "commitmentAt", [commitment]);
} else console.log("✓ Reusing earlier commitment");
// Wait the required minimum age (chain time, not local time)
process.stdout.write(`Waiting ${minAge}s+ for the commitment to mature`);
while ((await client.getBlock()).timestamp < committedAt + minAge + 5n) { process.stdout.write("."); await new Promise((r) => setTimeout(r, 6_000)); }
console.log();
// Step 9: register
const registerHash = await write("Register", REGISTRAR, registrarAbi, "register", [label, owner, secret, zeroAddress, zeroAddress, duration, USDC, zeroHash]);
fs.rmSync(PENDING, { force: true });
// Step 10: verify
const state = await read(ETH_REGISTRY, registryAbi, "getState", [BigInt(keccak256(toBytes(label)))]);
if (state.status !== 2 || state.latestOwner.toLowerCase() !== owner.toLowerCase()) throw new Error("Registered, but ownership is not visible yet. Re-check in a minute.");
console.log(`\n🎉 ${label}.eth is yours until ${new Date(Number(state.expiry) * 1000).toISOString().slice(0, 10)}`);
console.log(`Evidence (save in ens/README.md): ${tx(registerHash)}`);
console.log(`Next: add NEXT_PUBLIC_ENS_PARENT_NAME=${label}.eth to .env.local, restart, then open /identity.`);
