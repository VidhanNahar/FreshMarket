/**
 * End-to-end FreshPay flow against a local Anvil fork of Whitechain Sepolia, using the real
 * official test USDT. Start a fork, build the contract, then run:
 *   anvil --fork-url https://rpc.testnet.whitechain.io --port 8547
 *   npm run contracts:build
 *   FRESHPAY_FORK_RPC=http://127.0.0.1:8547 npx vitest run src/__tests__/freshpay-fork-live.test.ts
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createTestClient, erc20Abi, getAddress, http, parseEther, publicActions, walletActions, type Address, type Hex, type PublicClient } from "viem";
import {
  freshPayAbi, readActiveOrder, readMerchantOrders, readOrderEvents, verifyPayment, whitechainSepolia, WHITECHAIN_SEPOLIA_USDT,
} from "@/freshpay";
import { verifyWebhook, type WebhookPayload } from "@/freshpay/webhooks";
import { checkoutBlock } from "@/lib/freshpay/orders";
import { dispatchWebhooks } from "@/lib/freshpay/webhook-dispatcher";
import { MemoryWebhookStore } from "@/lib/freshpay/webhook-store";
import { fixtureListing } from "./fixtures/listing";

const rpc = process.env.FRESHPAY_FORK_RPC;
// Any addresses work: the test impersonates them and funds gas.
const merchant = getAddress("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
const buyer = getAddress("0x70997970c51812dc3a719c79b437b10d83f4c79c");
const rival = getAddress("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc");
const holder = getAddress("0xffd76ff981cc7ea15ee2f67680815763c4c7683e"); // Received test USDT on Whitechain Sepolia
const listing = { ...fixtureListing, seller: merchant, owner: merchant, priceMinor: 12_500_000n };
const ref = listing.id as Hex; // The Arkiv entity key is the payment reference

describe.skipIf(!rpc)("Phase 10: FreshPay on a Whitechain Sepolia fork", () => {
  it("pays, blocks a second buyer, verifies, refunds, releases and notifies", { timeout: 120_000 }, async () => {
    const client = createTestClient({ mode: "anvil", chain: whitechainSepolia, transport: http(rpc) }).extend(publicActions).extend(walletActions);
    const reader = client as unknown as PublicClient;
    const send = async (hash: Hex) => { const receipt = await client.waitForTransactionReceipt({ hash }); expect(receipt.status).toBe("success"); return receipt; };

    // Fund the buyers with real test USDT from an existing holder.
    for (const account of [holder, merchant, buyer, rival]) {
      await client.impersonateAccount({ address: account });
      await client.setBalance({ address: account, value: parseEther("1") });
    }
    for (const to of [buyer, rival]) {
      await send(await client.writeContract({ account: holder, address: WHITECHAIN_SEPOLIA_USDT, abi: erc20Abi, functionName: "transfer", args: [to, 20_000_000n] }));
    }

    const artifact = JSON.parse(readFileSync("contracts/out/FreshPay.sol/FreshPay.json", "utf8"));
    const deployHash = await client.deployContract({ account: merchant, abi: freshPayAbi, bytecode: artifact.bytecode.object, args: [WHITECHAIN_SEPOLIA_USDT, 3600n] });
    const deployed = await send(deployHash);
    const contract = deployed.contractAddress as Address;
    expect(checkoutBlock({ contract, listing, viewer: buyer })).toBeNull();

    // Buyer checkout, as the widget does it.
    await send(await client.writeContract({ account: buyer, address: WHITECHAIN_SEPOLIA_USDT, abi: erc20Abi, functionName: "approve", args: [contract, listing.priceMinor] }));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
    const payHash = await client.writeContract({ account: buyer, address: contract, abi: freshPayAbi, functionName: "pay", args: [merchant, ref, listing.priceMinor, deadline] });
    await send(payHash);
    const verified = await verifyPayment(reader, contract, payHash, { merchant, reference: ref, amount: listing.priceMinor });
    expect(verified.order).toMatchObject({ id: 1n, buyer, merchant, state: "Paid" });

    // The listing is now locked onchain even though Arkiv still says "available".
    const active = await readActiveOrder(reader, contract, merchant, ref);
    expect(checkoutBlock({ contract, listing, viewer: rival, activeOrder: active })).toBe("already-paid");
    await send(await client.writeContract({ account: rival, address: WHITECHAIN_SEPOLIA_USDT, abi: erc20Abi, functionName: "approve", args: [contract, listing.priceMinor] }));
    await expect(client.simulateContract({ account: rival, address: contract, abi: freshPayAbi, functionName: "pay", args: [merchant, ref, listing.priceMinor, deadline] }))
      .rejects.toThrow(/ReferenceAlreadyPaid/);

    // A spoofed hash (the approval) is not accepted as a payment.
    const approvalHash = await client.writeContract({ account: rival, address: WHITECHAIN_SEPOLIA_USDT, abi: erc20Abi, functionName: "approve", args: [contract, 0n] });
    await send(approvalHash);
    await expect(verifyPayment(reader, contract, approvalHash)).rejects.toThrow("did not pay");

    // Merchant partial refund from escrow, then buyer confirms receipt.
    await send(await client.writeContract({ account: merchant, address: contract, abi: freshPayAbi, functionName: "refund", args: [1n, 2_500_000n] }));
    await send(await client.writeContract({ account: buyer, address: contract, abi: freshPayAbi, functionName: "release", args: [1n] }));
    const [order] = await readMerchantOrders(reader, contract, merchant);
    expect(order).toMatchObject({ state: "Released", refunded: 2_500_000n });

    const events = await readOrderEvents(reader, contract, { fromBlock: deployed.blockNumber }, { orderId: 1n });
    expect(events.map((event) => event.type)).toEqual(["paid", "refunded", "released"]);
    expect(events[0].txHash).toBe(payHash);

    // Webhooks: three signed events, delivered once each across repeated runs.
    await client.mine({ blocks: 12 });
    const store = new MemoryWebhookStore();
    const received: WebhookPayload[] = [];
    const deliver = async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      expect(verifyWebhook({ secret: "whsec", body: init.body as string, signature: headers["freshpay-signature"] })).toBe(true);
      received.push(JSON.parse(init.body as string));
      return { ok: true, status: 200 };
    };
    const options = { client: reader, contract, deployBlock: deployed.blockNumber, store, endpoint: "https://merchant.test/hooks", secret: "whsec", deliver };
    await dispatchWebhooks(options);
    await dispatchWebhooks(options);
    expect(received.map((payload) => payload.type)).toEqual(["order.paid", "order.refunded", "order.released"]);
    expect(received[1].data).toMatchObject({ orderId: "1", amount: "2500000", totalRefunded: "2500000" });
  });
});
