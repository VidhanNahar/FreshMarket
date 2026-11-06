import {
  encodeFunctionData, isAddressEqual, parseEventLogs, zeroAddress,
  type Abi, type Address, type Hex, type TransactionReceipt,
} from "viem";
import { normalize } from "viem/ens";
import { sepolia } from "viem/chains";
import { createEnsWalletClient, ensPublicClient } from "@/lib/ens/client";
import { ensConfig, ensConfigurationError, ENS_SEPOLIA_CHAIN_ID } from "@/lib/ens/config";
import {
  factoryAbi, permissionedResolverAbi, registryAbi, reverseRegistrarAbi, universalResolverAbi,
  REGISTRAR_ROLE, REGISTRY_OPERATOR_ROLES, RESOLVER_SELLER_ROLES, SELLER_ROLES,
} from "@/lib/ens/contracts";
import { dnsName, labelId, publicHttpsUrl, sellerAddress, storefrontLabel } from "@/lib/ens/names";
import { findNameRegistry, resolveForwardAddress, resolveSellerIdentity } from "./ens-identity";

export type EnsWallet = Pick<Awaited<ReturnType<typeof createEnsWalletClient>>, "account" | "chain" | "writeContract">;
export type WriteReader = Pick<typeof ensPublicClient, "readContract" | "getBlockNumber" | "getCode" | "getBlock" | "simulateContract" | "waitForTransactionReceipt">;
export interface EnsWriteResult { txHash: Hex; blockNumber: bigint; }
export interface StorefrontInput { label: string; seller: Address; resolver: Address; expirationDays: number; }
export interface StorefrontMetadata { avatar: string; description: string; url: string; }

/** initialize() payload for a dedicated seller resolver: seller roles + forward address in one step. */
export function sellerResolverInitData(name: string, owner: Address): Hex {
  const addressCall = encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setAddress", args: [dnsName(name), 60n, owner] });
  return encodeFunctionData({ abi: permissionedResolverAbi, functionName: "initialize", args: [[{ account: owner, roleBitmap: RESOLVER_SELLER_ROLES }], [addressCall]] });
}

/** Preserve a broadcast hash even when receipt/event/read-back verification fails. Never auto-retry. */
export class EnsWriteError extends Error {
  constructor(message: string, readonly txHash: Hex, options?: ErrorOptions) { super(message, options); }
}

/** Each method is one explicitly approved transaction; setup is intentionally resumable. */
export class EnsStorefrontService {
  constructor(protected readonly client: WriteReader = ensPublicClient) {}

  protected account(wallet: EnsWallet): Address {
    if (ensConfigurationError) throw new Error(ensConfigurationError);
    if (!wallet.account || wallet.chain?.id !== ENS_SEPOLIA_CHAIN_ID) throw new Error("Connect a Sepolia wallet for ENS writes");
    return wallet.account.address;
  }

  protected async send(wallet: EnsWallet, call: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] }) {
    const account = this.account(wallet);
    const { request } = await this.client.simulateContract({ ...call, account, chain: sepolia });
    const hash = await wallet.writeContract(request);
    try {
      const receipt = await this.client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 90_000 });
      if (receipt.status !== "success") throw new Error("ENS transaction reverted");
      return { hash, receipt };
    } catch (cause) { throw new EnsWriteError("The ENS transaction was submitted. Check its status before retrying.", hash, { cause }); }
  }

  private parent() {
    if (!ensConfig.parentName) throw new Error("Configure a project-owned Sepolia parent name first");
    const name = normalize(ensConfig.parentName);
    if (!name.endsWith(".eth") || name.split(".").length !== 2) throw new Error("Configure a project-owned second-level Sepolia .eth parent name first");
    return name;
  }

  async parentRegistry(): Promise<Address> {
    const resolverRoot = await this.client.readContract({ address: ensConfig.universalResolver, abi: universalResolverAbi, functionName: "ROOT_REGISTRY" });
    if (!isAddressEqual(resolverRoot, ensConfig.rootRegistry)) throw new Error("ENS resolver and registry deployment configuration must match before issuing names");
    const parent = this.parent();
    const location = await findNameRegistry(parent, this.client);
    if (!location) throw new Error("Parent name is not reachable from the configured ENSv2 root");
    const registry = await this.client.readContract({ address: location.registry, abi: registryAbi, functionName: "getSubregistry", args: [location.label] });
    if (registry === zeroAddress) throw new Error("Attach a UserRegistry to the parent name first");
    if (ensConfig.subregistry !== zeroAddress && !isAddressEqual(registry, ensConfig.subregistry)) throw new Error("Configured subregistry does not match the parent name's onchain registry");
    return registry;
  }

  /** Deploy a fresh ENSv2 proxy with narrow grants and verify its factory event. */
  private async deploy(wallet: EnsWallet, implementation: Address, data: Hex, salt: bigint) {
    const account = this.account(wallet);
    const predicted = await this.client.readContract({ address: ensConfig.factory, abi: factoryAbi, functionName: "predictProxyAddress", args: [account, salt] });
    const code = await this.client.getCode({ address: predicted });
    if (code && code !== "0x") throw new Error("This setup salt was already used. Check the existing deployment before choosing another.");
    const { hash, receipt } = await this.send(wallet, { address: ensConfig.factory, abi: factoryAbi, functionName: "deployProxy", args: [implementation, salt, data] });
    const event = parseEventLogs({ abi: factoryAbi, eventName: "ProxyDeployed", logs: receipt.logs.filter((log) => isAddressEqual(log.address, ensConfig.factory)) })
      .find((log) => isAddressEqual(log.args.proxyAddress, predicted) && isAddressEqual(log.args.sender, account) && isAddressEqual(log.args.implementation, implementation) && log.args.salt === salt);
    if (!event) throw new EnsWriteError("Deployment confirmed but its factory event did not match. Do not deploy again before checking the receipt.", hash);
    return { address: predicted, txHash: hash, blockNumber: receipt.blockNumber };
  }

  async deployParentRegistry(wallet: EnsWallet, salt: bigint) {
    const account = this.account(wallet);
    const location = await findNameRegistry(this.parent(), this.client);
    if (!location) throw new Error("Register the parent .eth name first");
    const state = await this.client.readContract({ address: location.registry, abi: registryAbi, functionName: "getState", args: [labelId(location.label)] });
    if (state.status !== 2 || !isAddressEqual(state.latestOwner, account)) throw new Error("Connect the parent name's current owner wallet");
    const existing = await this.client.readContract({ address: location.registry, abi: registryAbi, functionName: "getSubregistry", args: [location.label] });
    if (existing !== zeroAddress) throw new Error("The parent already has a registry. Reuse it instead of deploying a replacement.");
    return this.deploy(wallet, ensConfig.userRegistryImplementation, encodeFunctionData({
      abi: registryAbi, functionName: "initialize", args: [[{ account, roleBitmap: REGISTRY_OPERATOR_ROLES }]],
    }), salt);
  }

  /** Parent owner explicitly attaches its deployed registry; no name registration is impersonated. */
  async attachParentRegistry(wallet: EnsWallet, registry: Address): Promise<EnsWriteResult> {
    const account = this.account(wallet);
    const location = await findNameRegistry(this.parent(), this.client);
    if (!location) throw new Error("Register the parent .eth name first");
    const state = await this.client.readContract({ address: location.registry, abi: registryAbi, functionName: "getState", args: [labelId(location.label)] });
    if (state.status !== 2 || !isAddressEqual(state.latestOwner, account)) throw new Error("Only the current parent-name owner may use this setup flow");
    const current = await this.client.readContract({ address: location.registry, abi: registryAbi, functionName: "getSubregistry", args: [location.label] });
    if (current !== zeroAddress) throw new Error("This parent already has a subregistry. Replacing it could disconnect existing sellers; use its existing registry.");
    const implementation = await this.client.readContract({ address: ensConfig.factory, abi: factoryAbi, functionName: "verifyContract", args: [sellerAddress(registry)] });
    if (!isAddressEqual(implementation, ensConfig.userRegistryImplementation)) throw new Error("Expected a factory-deployed ENSv2 UserRegistry");
    const { hash, receipt } = await this.send(wallet, { address: location.registry, abi: registryAbi, functionName: "setSubregistry", args: [labelId(location.label), registry] });
    const attached = await this.client.readContract({ address: location.registry, abi: registryAbi, functionName: "getSubregistry", args: [location.label] });
    if (!isAddressEqual(attached, registry)) throw new EnsWriteError("Attachment confirmed; public verification is delayed. Check the transaction before retrying.", hash);
    return { txHash: hash, blockNumber: receipt.blockNumber };
  }

  /** Prepare a dedicated seller-controlled resolver and its forward record atomically. */
  async deploySellerResolver(wallet: EnsWallet, label: string, seller: Address, salt: bigint) {
    const name = `${storefrontLabel(label)}.${this.parent()}`;
    return this.deploy(wallet, ensConfig.resolverImplementation, sellerResolverInitData(name, sellerAddress(seller)), salt);
  }

  async register(wallet: EnsWallet, input: StorefrontInput) {
    const issuer = this.account(wallet);
    const label = storefrontLabel(input.label);
    const seller = sellerAddress(input.seller);
    const resolver = sellerAddress(input.resolver);
    if (!Number.isInteger(input.expirationDays) || input.expirationDays < 1 || input.expirationDays > 365) throw new Error("Choose 1–365 days");
    const registry = await this.parentRegistry();
    const authorized = await this.client.readContract({ address: registry, abi: registryAbi, functionName: "hasRootRoles", args: [REGISTRAR_ROLE, issuer] });
    if (!authorized) throw new Error("The parent registry's authorized issuer must register the seller's subname");
    const state = await this.client.readContract({ address: registry, abi: registryAbi, functionName: "getState", args: [labelId(label)] });
    // Do not silently overwrite or revive expired/reserved identities in this registration flow.
    if (state.status !== 0) throw new Error("This label is already registered or reserved");
    const implementation = await this.client.readContract({ address: ensConfig.factory, abi: factoryAbi, functionName: "verifyContract", args: [resolver] });
    if (!isAddressEqual(implementation, ensConfig.resolverImplementation)) throw new Error("Prepare a dedicated ENSv2 permissioned resolver first");
    const allowed = await this.client.readContract({ address: resolver, abi: permissionedResolverAbi, functionName: "hasRootRoles", args: [RESOLVER_SELLER_ROLES, seller] });
    if (!allowed) throw new Error("Seller must control address and text records on its resolver");
    const latest = await this.client.getBlock();
    const expiry = latest.timestamp + BigInt(input.expirationDays) * 86400n;
    const name = `${label}.${this.parent()}`;
    const { hash, receipt } = await this.send(wallet, { address: registry, abi: registryAbi, functionName: "register", args: [label, seller, zeroAddress, resolver, SELLER_ROLES, expiry] });
    this.verifyRegistrationEvent(receipt, registry, label, seller, issuer, expiry, hash);
    try {
      const current = await this.client.readContract({ address: registry, abi: registryAbi, functionName: "getState", args: [labelId(label)] });
      const owner = await this.client.readContract({ address: registry, abi: registryAbi, functionName: "ownerOf", args: [current.tokenId] });
      const forward = await resolveForwardAddress(name, this.client);
      if (current.status !== 2 || !isAddressEqual(owner, seller) || !forward || !isAddressEqual(forward, seller)) throw new Error("Ownership or forward resolution is not verified yet");
    } catch (cause) { throw new EnsWriteError("Registration confirmed; ownership/forward verification needs a public refresh. Do not register again.", hash, { cause }); }
    return { name, owner: seller, expiry, txHash: hash, blockNumber: receipt.blockNumber };
  }

  private verifyRegistrationEvent(receipt: TransactionReceipt, registry: Address, label: string, seller: Address, issuer: Address, expiry: bigint, hash: Hex) {
    const events = parseEventLogs({ abi: registryAbi, eventName: "LabelRegistered", logs: receipt.logs.filter((log) => isAddressEqual(log.address, registry)) });
    if (!events.some(({ args }) => args.label === label && BigInt(args.labelHash) === labelId(label) && isAddressEqual(args.owner, seller) && isAddressEqual(args.sender, issuer) && args.expiry === expiry)) {
      throw new EnsWriteError("Transaction confirmed but registration event did not match. Inspect the receipt before retrying.", hash);
    }
  }

  private async ownedName(wallet: EnsWallet, label: string) {
    const seller = this.account(wallet);
    const handle = storefrontLabel(label);
    const registry = await this.parentRegistry();
    const state = await this.client.readContract({ address: registry, abi: registryAbi, functionName: "getState", args: [labelId(handle)] });
    const owner = await this.client.readContract({ address: registry, abi: registryAbi, functionName: "ownerOf", args: [state.tokenId] });
    if (state.status !== 2 || !isAddressEqual(owner, seller)) throw new Error("Connect the current storefront owner wallet");
    return { seller, registry, label: handle, name: `${handle}.${this.parent()}` };
  }

  async updateProfile(wallet: EnsWallet, label: string, metadata: StorefrontMetadata): Promise<EnsWriteResult> {
    const owned = await this.ownedName(wallet, label);
    for (const value of [metadata.avatar, metadata.url]) if (value && !publicHttpsUrl(value)) throw new Error("Avatar and website must be HTTPS URLs without credentials");
    if (metadata.description.length > 500) throw new Error("Description must be at most 500 characters");
    const resolver = await this.client.readContract({ address: owned.registry, abi: registryAbi, functionName: "getResolver", args: [owned.label] });
    const implementation = await this.client.readContract({ address: ensConfig.factory, abi: factoryAbi, functionName: "verifyContract", args: [resolver] });
    if (!isAddressEqual(implementation, ensConfig.resolverImplementation)) throw new Error("This profile editor requires an ENSv2 permissioned resolver");
    const calls = [
      encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setAddress", args: [dnsName(owned.name), 60n, owned.seller] }),
      ...(["avatar", "description", "url"] as const).map((key) => encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setText", args: [dnsName(owned.name), key, metadata[key]] })),
    ];
    const { hash, receipt } = await this.send(wallet, { address: resolver, abi: permissionedResolverAbi, functionName: "multicall", args: [calls] });
    return { txHash: hash, blockNumber: receipt.blockNumber };
  }

  async setPrimaryName(wallet: EnsWallet, label: string): Promise<EnsWriteResult> {
    const owned = await this.ownedName(wallet, label);
    const forward = await resolveForwardAddress(owned.name, this.client);
    if (!forward || !isAddressEqual(forward, owned.seller)) throw new Error("Set and verify the seller's forward address first");
    const { hash, receipt } = await this.send(wallet, { address: ensConfig.reverseRegistrar, abi: reverseRegistrarAbi, functionName: "setName", args: [owned.name] });
    try {
      const identity = await resolveSellerIdentity(owned.seller, this.client);
      if (!identity || identity.name !== owned.name) throw new Error("Reverse/forward ownership checks are not ready");
    } catch (cause) { throw new EnsWriteError("Primary-name transaction confirmed; bidirectional verification needs a public refresh. Do not submit again.", hash, { cause }); }
    return { txHash: hash, blockNumber: receipt.blockNumber };
  }
}
export const ensStorefrontService = new EnsStorefrontService();
