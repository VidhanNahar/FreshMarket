import {
  BaseError, ContractFunctionRevertedError, decodeFunctionResult, encodeFunctionData, getAddress, isAddressEqual,
  namehash, parseEventLogs, zeroAddress, type Address,
} from "viem";
import { normalize } from "viem/ens";
import { ensPublicClient } from "@/lib/ens/client";
import { ensConfig, ensConfigurationError } from "@/lib/ens/config";
import {
  DELEGABLE_TEXT_KEYS, factoryAbi, isDelegableTextKey, permissionedResolverAbi, registryAbi, resolverProfileAbi,
  ROLE_SET_TEXT, ROLE_SET_TEXT_ADMIN, textResource, type DelegableTextKey,
} from "@/lib/ens/contracts";
import { dnsName, labelId, publicHttpsUrl, sellerAddress } from "@/lib/ens/names";
import { findNameRegistry, resolveForwardAddress } from "./ens-identity";
import { EnsStorefrontService, EnsWriteError, type EnsWallet, type EnsWriteResult, type WriteReader } from "./ens-storefront";

type DelegationReader = WriteReader & Pick<import("viem").PublicClient, "getLogs">;

export interface StorefrontDelegate { account: Address; key: DelegableTextKey; }
export interface StorefrontRecords {
  name: string;
  registry: Address;
  resolver: Address;
  owner: Address | null;
  expiry: bigint | null;
  forwardAddress: Address | null;
  /** True when the token owner and forward address are the same wallet. */
  verified: boolean;
  /** Roles granted to the token owner at the resolver's root. */
  ownerCanDelegate: boolean;
  text: Record<DelegableTextKey, string>;
  readAtBlock: bigint;
}
export interface EditCheck { allowed: boolean; reason: string; }

/** A resolver revert surfaced in plain words. Nothing was broadcast when this is thrown. */
export class EnsUnauthorizedError extends Error {
  constructor(message: string, readonly errorName: string) { super(message); }
}

// ---- Pure calldata builders (also exercised against the real Sepolia contract in ens-delegation-live) ----
export function setTextCall(name: string, key: string, value: string) {
  return { abi: permissionedResolverAbi, functionName: "setText" as const, args: [dnsName(name), key, value] as const };
}
/** grantSetterRoles derives resource = keccak256(key) from this setter; the name and value are ignored. */
export function grantTextDelegateCall(name: string, key: DelegableTextKey, delegate: Address) {
  return {
    abi: permissionedResolverAbi, functionName: "grantSetterRoles" as const,
    args: [encodeFunctionData(setTextCall(name, key, "")), delegate] as const,
  };
}
export function revokeTextDelegateCall(key: DelegableTextKey, delegate: Address) {
  return { abi: permissionedResolverAbi, functionName: "revokeRoles" as const, args: [textResource(key), ROLE_SET_TEXT, delegate] as const };
}

const LOG_CHUNK = 45_000n; // Public Sepolia RPCs reject eth_getLogs spans much above 50k blocks.
const MAX_LOG_CHUNKS = 30; // ≈ 1.35M blocks ≈ 6 months; stops earlier at the resolver's initialization.
const MAX_TEXT_LENGTH = 500;

function validateValue(key: DelegableTextKey, value: string) {
  if (value.length > MAX_TEXT_LENGTH) throw new Error(`Keep ${key} at most ${MAX_TEXT_LENGTH} characters`);
  if ((key === "url" || key === "avatar") && value && !publicHttpsUrl(value)) throw new Error(`${key} must be an HTTPS URL without credentials`);
}
function delegableKey(key: string): DelegableTextKey {
  if (!isDelegableTextKey(key)) throw new Error(`Only these storefront keys can be delegated: ${DELEGABLE_TEXT_KEYS.join(", ")}`);
  return key;
}
function revertName(cause: unknown): string | null {
  if (!(cause instanceof BaseError)) return null;
  const reverted = cause.walk((error) => error instanceof ContractFunctionRevertedError);
  if (reverted instanceof ContractFunctionRevertedError) return reverted.data?.errorName ?? reverted.signature ?? "reverted";
  return null;
}

/**
 * Key-scoped delegation on a seller's dedicated ENSv2 PermissionedResolver (issue #30).
 * ENS permissions never authorize Arkiv listing changes: those stay with the listing owner's wallet.
 */
export class EnsDelegationService extends EnsStorefrontService {
  constructor(protected readonly reader: DelegationReader) { super(reader); }

  /** Finds the name's resolver through the ENSv2 hierarchy and requires a factory-verified PermissionedResolver. */
  async locate(nameInput: string) {
    if (ensConfigurationError) throw new Error(ensConfigurationError);
    let name: string;
    try { name = normalize(nameInput.trim()); } catch { throw new Error("Enter a valid ENS name"); }
    if (name.split(".").length < 2) throw new Error("Enter a full ENS name, e.g. alice.your-market.eth");
    const location = await findNameRegistry(name, this.reader);
    if (!location) throw new Error(`${name} is not reachable from the configured ENSv2 root`);
    const resolver = await this.reader.readContract({ address: location.registry, abi: registryAbi, functionName: "getResolver", args: [location.label] });
    if (resolver === zeroAddress) {
      const state = await this.reader.readContract({ address: location.registry, abi: registryAbi, functionName: "getState", args: [labelId(location.label)] });
      throw new Error(state.status === 2
        ? `${name} is registered but has no resolver yet. Its owner can prepare one on the Seller identity page.`
        : `${name} isn't registered yet. The owner of the parent name issues it on the Seller identity page (/identity).`);
    }
    const implementation = await this.reader.readContract({ address: ensConfig.factory, abi: factoryAbi, functionName: "verifyContract", args: [resolver] })
      .catch(() => zeroAddress);
    if (!isAddressEqual(implementation, ensConfig.resolverImplementation)) {
      throw new Error("This name does not use a dedicated ENSv2 PermissionedResolver, so key-scoped delegation is unavailable");
    }
    return { name, registry: location.registry, label: location.label, resolver };
  }

  private async readText(resolver: Address, name: string, key: string, blockNumber: bigint): Promise<string> {
    try {
      const data = await this.reader.readContract({
        address: resolver, abi: permissionedResolverAbi, functionName: "resolve", blockNumber,
        args: [dnsName(name), encodeFunctionData({ abi: resolverProfileAbi, functionName: "text", args: [namehash(name), key] })],
      });
      return data === "0x" ? "" : decodeFunctionResult({ abi: resolverProfileAbi, functionName: "text", data }).slice(0, 2000);
    } catch { return ""; }
  }

  async readStorefront(nameInput: string): Promise<StorefrontRecords> {
    const { name, registry, label, resolver } = await this.locate(nameInput);
    const blockNumber = await this.reader.getBlockNumber();
    const state = await this.reader.readContract({ address: registry, abi: registryAbi, functionName: "getState", args: [labelId(label)], blockNumber });
    const owner = state.status === 2
      ? await this.reader.readContract({ address: registry, abi: registryAbi, functionName: "ownerOf", args: [state.tokenId], blockNumber }).catch(() => null)
      : null;
    const forwardAddress = await resolveForwardAddress(name, this.reader, blockNumber).catch(() => null);
    const ownerCanDelegate = owner
      ? await this.reader.readContract({ address: resolver, abi: permissionedResolverAbi, functionName: "hasRootRoles", args: [ROLE_SET_TEXT_ADMIN, owner], blockNumber })
      : false;
    const values = await Promise.all(DELEGABLE_TEXT_KEYS.map((key) => this.readText(resolver, name, key, blockNumber)));
    return {
      name, registry, resolver, owner: owner ? getAddress(owner) : null, expiry: state.status === 2 ? state.expiry : null,
      forwardAddress, verified: Boolean(owner && forwardAddress && isAddressEqual(owner, forwardAddress)), ownerCanDelegate,
      text: Object.fromEntries(DELEGABLE_TEXT_KEYS.map((key, index) => [key, values[index]])) as Record<DelegableTextKey, string>,
      readAtBlock: blockNumber,
    };
  }

  /**
   * Event logs only nominate candidates; every returned delegate is confirmed by a live roles() read,
   * so a stale or reorged log can never show a permission that is not currently held onchain.
   */
  async listDelegates(resolverInput: Address): Promise<StorefrontDelegate[]> {
    const resolver = sellerAddress(resolverInput);
    const head = await this.reader.getBlockNumber();
    const candidates = new Set<Address>();
    for (let chunk = 0, toBlock = head; chunk < MAX_LOG_CHUNKS && toBlock > 0n; chunk++) {
      const fromBlock = toBlock > LOG_CHUNK ? toBlock - LOG_CHUNK + 1n : 0n;
      const logs = await this.reader.getLogs({ address: resolver, fromBlock, toBlock });
      const parsed = parseEventLogs({ abi: permissionedResolverAbi, logs, strict: false });
      let initialized = false;
      for (const log of parsed) {
        if (log.eventName === "EACRolesChanged" && log.args.account && log.args.resource !== 0n) candidates.add(getAddress(log.args.account));
        if (log.eventName === "Initialized") initialized = true;
      }
      if (initialized) break;
      toBlock = fromBlock - 1n;
    }
    const delegates: StorefrontDelegate[] = [];
    await Promise.all([...candidates].flatMap((account) => DELEGABLE_TEXT_KEYS.map(async (key) => {
      const roles = await this.reader.readContract({ address: resolver, abi: permissionedResolverAbi, functionName: "roles", args: [textResource(key), account], blockNumber: head });
      if (roles & ROLE_SET_TEXT) delegates.push({ account, key });
    })));
    return delegates.sort((a, b) => a.account.localeCompare(b.account) || a.key.localeCompare(b.key));
  }

  /**
   * Read-only eth_call of setText from `account` against the live resolver. A rejection here is the
   * resolver contract's own revert (EACUnauthorizedAccountRoles), not a client-side guess.
   */
  async checkTextEdit(nameInput: string, keyInput: string, accountInput: Address): Promise<EditCheck> {
    const key = delegableKey(keyInput);
    const account = sellerAddress(accountInput);
    const { name, resolver } = await this.locate(nameInput);
    try {
      await this.reader.simulateContract({ ...setTextCall(name, key, ""), address: resolver, account });
      return { allowed: true, reason: `${account} may edit ${key} on ${name}` };
    } catch (cause) {
      const error = revertName(cause);
      if (!error) throw cause;
      return { allowed: false, reason: `Resolver rejected the edit (${error}): ${account} has no permission for “${key}” on ${name}` };
    }
  }

  async grantTextDelegate(wallet: EnsWallet, nameInput: string, keyInput: string, delegateInput: Address): Promise<EnsWriteResult> {
    const owner = this.account(wallet);
    const key = delegableKey(keyInput);
    const delegate = sellerAddress(delegateInput);
    if (isAddressEqual(delegate, owner)) throw new Error("You already control this storefront; choose a different delegate wallet");
    const { name, resolver } = await this.locate(nameInput);
    const canDelegate = await this.reader.readContract({ address: resolver, abi: permissionedResolverAbi, functionName: "hasRootRoles", args: [ROLE_SET_TEXT_ADMIN, owner] });
    if (!canDelegate) {
      throw new Error("The connected wallet cannot delegate on this resolver. Use the storefront owner wallet; resolvers prepared before delegation support must be re-prepared.");
    }
    const already = await this.reader.readContract({ address: resolver, abi: permissionedResolverAbi, functionName: "roles", args: [textResource(key), delegate] });
    if (already & ROLE_SET_TEXT) throw new Error(`${delegate} can already edit ${key}`);
    const { hash, receipt } = await this.sendResolver(wallet, resolver, grantTextDelegateCall(name, key, delegate));
    const granted = await this.reader.readContract({ address: resolver, abi: permissionedResolverAbi, functionName: "hasRoles", args: [textResource(key), ROLE_SET_TEXT, delegate] });
    if (!granted) throw new EnsWriteError("Grant confirmed; the role is not visible yet. Refresh before granting again.", hash);
    return { txHash: hash, blockNumber: receipt.blockNumber };
  }

  async revokeTextDelegate(wallet: EnsWallet, nameInput: string, keyInput: string, delegateInput: Address): Promise<EnsWriteResult> {
    this.account(wallet);
    const key = delegableKey(keyInput);
    const delegate = sellerAddress(delegateInput);
    const { resolver } = await this.locate(nameInput);
    const current = await this.reader.readContract({ address: resolver, abi: permissionedResolverAbi, functionName: "roles", args: [textResource(key), delegate] });
    if (!(current & ROLE_SET_TEXT)) throw new Error(`${delegate} has no delegated permission for ${key}`);
    const { hash, receipt } = await this.sendResolver(wallet, resolver, revokeTextDelegateCall(key, delegate));
    const remaining = await this.reader.readContract({ address: resolver, abi: permissionedResolverAbi, functionName: "roles", args: [textResource(key), delegate] });
    if (remaining & ROLE_SET_TEXT) throw new EnsWriteError("Revocation confirmed; the role still appears. Refresh before revoking again.", hash);
    return { txHash: hash, blockNumber: receipt.blockNumber };
  }

  /** Used by both owners and delegates; the resolver decides. Simulation rejects unauthorized wallets before signing. */
  async setStorefrontText(wallet: EnsWallet, nameInput: string, keyInput: string, value: string): Promise<EnsWriteResult> {
    this.account(wallet);
    const key = delegableKey(keyInput);
    validateValue(key, value);
    const { name, resolver } = await this.locate(nameInput);
    const { hash, receipt } = await this.sendResolver(wallet, resolver, setTextCall(name, key, value));
    const stored = await this.readText(resolver, name, key, receipt.blockNumber);
    if (stored !== value) throw new EnsWriteError("Record update confirmed; the new value is not readable yet. Refresh before editing again.", hash);
    return { txHash: hash, blockNumber: receipt.blockNumber };
  }

  private async sendResolver(wallet: EnsWallet, resolver: Address, call: { abi: typeof permissionedResolverAbi; functionName: string; args: readonly unknown[] }) {
    try {
      return await this.send(wallet, { ...call, address: resolver });
    } catch (cause) {
      const error = cause instanceof EnsWriteError ? null : revertName(cause);
      if (error === "EACUnauthorizedAccountRoles") throw new EnsUnauthorizedError("The resolver rejected this wallet: it has no permission for that record. Nothing was sent.", error);
      if (error === "EACCannotGrantRoles" || error === "EACCannotRevokeRoles") throw new EnsUnauthorizedError("The resolver rejected this permission change: the connected wallet is not a delegation admin. Nothing was sent.", error);
      throw cause;
    }
  }
}


let shared: EnsDelegationService | undefined;
export function getEnsDelegationService(): EnsDelegationService {
  shared ??= new EnsDelegationService(ensPublicClient);
  return shared;
}
