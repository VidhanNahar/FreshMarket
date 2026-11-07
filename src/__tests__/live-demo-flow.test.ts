/**
 * Live end-to-end run on the real testnets, through the app's own repositories:
 * Arkiv seller lifecycle → FreshPay USDT payment, partial refund and release → Arkiv review.
 *
 * Opt-in and run by the wallet owner, who types the key into a hidden prompt:
 *   read -s "LIVE_DEMO_BUYER_KEY?Buyer private key: " && export LIVE_DEMO_BUYER_KEY
 *   npx vitest run src/__tests__/live-demo-flow.test.ts
 *   unset LIVE_DEMO_BUYER_KEY
 *
 * The buyer wallet pays gas and USDT. A separate seller wallet is generated once and stored in
 * the git-ignored `.live-demo/seller.json` (the contract forbids paying yourself). Every
 * transaction hash is written to `.live-demo/evidence.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWalletClient as createArkivWalletClient } from "@arkiv-network/sdk";
import { createPublicClient, createWalletClient, erc20Abi, http, parseEther, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { rabdi } from "@arkiv-network/sdk/chains";

// The public Rabdi endpoint is heavily rate limited; use the project's access key when present.
try { process.loadEnvFile(".env.local"); } catch { /* optional */ }

const buyerKey = process.env.LIVE_DEMO_BUYER_KEY as Hex | undefined;
const FRESHPAY = "0x2D67Ed6aA929B1Dbc28370AEe3e23AD56277657F" as const;
// Must be set before the app modules below read their configuration.
process.env.NEXT_PUBLIC_FRESHPAY_ADDRESS ??= FRESHPAY;
process.env.NEXT_PUBLIC_FRESHPAY_DEPLOY_BLOCK ??= "12407705";

const SWAP_ROUTER = "0xe208cC685cD95D56E8ec6DEC9816476567fc6962" as const; // Uniswap SwapRouter02
const WWBT = "0x4200000000000000000000000000000000000006" as const;
const swapAbi = [{
  type: "function", name: "exactInputSingle", stateMutability: "payable",
  inputs: [{ type: "tuple", name: "params", components: [
    { name: "tokenIn", type: "address" }, { name: "tokenOut", type: "address" }, { name: "fee", type: "uint24" },
    { name: "recipient", type: "address" }, { name: "amountIn", type: "uint256" },
    { name: "amountOutMinimum", type: "uint256" }, { name: "sqrtPriceLimitX96", type: "uint160" },
  ] }],
  outputs: [{ name: "amountOut", type: "uint256" }],
}] as const;

describe.skipIf(!buyerKey)("live demo: Arkiv + FreshPay + reviews on real testnets", () => {
  it("runs the whole marketplace flow and records every transaction", { timeout: 15 * 60_000 }, async () => {
    const { whitechainSepolia, WHITECHAIN_SEPOLIA_USDT, freshPayAbi, verifyPayment, readOrder } = await import("@/freshpay");
    const { rabdiWalletChain } = await import("@/lib/arkiv/chain");
    const { listingRepository } = await import("@/services/listing-repository");
    const { reviewRepository } = await import("@/services/review-repository");
    const { DEMO_EXPIRATION_DAYS } = await import("@/domain/listing-schema");

    mkdirSync(".live-demo", { recursive: true });
    const sellerFile = ".live-demo/seller.json";
    if (!existsSync(sellerFile)) writeFileSync(sellerFile, JSON.stringify({ key: generatePrivateKey() }), { mode: 0o600 });
    const buyer = privateKeyToAccount(buyerKey!);
    const seller = privateKeyToAccount(JSON.parse(readFileSync(sellerFile, "utf8")).key as Hex);
    // Resume: steps already recorded for this buyer/seller pair are never sent twice.
    const previous = existsSync(".live-demo/evidence.json") ? JSON.parse(readFileSync(".live-demo/evidence.json", "utf8")) : {};
    const evidence: Record<string, unknown> = previous.buyer === buyer.address && previous.seller === seller.address
      ? previous : { buyer: buyer.address, seller: seller.address, startedAt: new Date().toISOString() };
    const once = async <T,>(step: string, run: () => Promise<T>): Promise<T> => {
      if (evidence[step] !== undefined) { console.log(step, "(already done)", evidence[step]); return evidence[step] as T; }
      const value = await run(); log(step, value); return value;
    };
    const save = () => writeFileSync(".live-demo/evidence.json", JSON.stringify(evidence, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    const log = (step: string, value: unknown) => { evidence[step] = value; save(); console.log(step, value); };

    const wc = createPublicClient({ chain: whitechainSepolia, transport: http() });
    const wcBuyer = createWalletClient({ account: buyer, chain: whitechainSepolia, transport: http() });
    const wcSeller = createWalletClient({ account: seller, chain: whitechainSepolia, transport: http() });
    const rabdiChain = rabdi({ accessKey: process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? "" });
    expect(rabdiChain.id).toBe(rabdiWalletChain.id);
    const rabdiTransport = () => http(undefined, { retryCount: 4, retryDelay: 1_500, timeout: 30_000 });
    const rabdiPublic = createPublicClient({ chain: rabdiChain, transport: rabdiTransport() });
    const rabdiBuyerNative = createWalletClient({ account: buyer, chain: rabdiChain, transport: rabdiTransport() });
    const arkivSeller = createArkivWalletClient({ account: seller, chain: rabdiChain, transport: rabdiTransport() });
    const arkivBuyer = createArkivWalletClient({ account: buyer, chain: rabdiChain, transport: rabdiTransport() });
    const mined = async (client: typeof wc | typeof rabdiPublic, hash: Hex) => {
      const receipt = await client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
      return hash;
    };

    // 1. Official test USDT for the buyer: swap a little WBT on the Uniswap WWBT/USDT pool if short.
    const usdt = () => wc.readContract({ address: WHITECHAIN_SEPOLIA_USDT, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address] });
    if (evidence.swapWbtForUsdt === undefined && (await usdt()) < 3_000_000n) {
      const amountIn = parseEther("0.15");
      const params = { tokenIn: WWBT, tokenOut: WHITECHAIN_SEPOLIA_USDT, fee: 3000, recipient: buyer.address, amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n } as const;
      const { result: quote } = await wc.simulateContract({ account: buyer, address: SWAP_ROUTER, abi: swapAbi, functionName: "exactInputSingle", args: [params], value: amountIn });
      log("swapWbtForUsdt", await mined(wc, await wcBuyer.writeContract({ address: SWAP_ROUTER, abi: swapAbi, functionName: "exactInputSingle",
        args: [{ ...params, amountOutMinimum: (quote * 95n) / 100n }], value: amountIn })));
    }
    log("buyerUsdtBalance", await usdt());

    // 2. Gas for the generated seller wallet on both chains.
    if (evidence.fundSellerRabdi === undefined && (await rabdiPublic.getBalance({ address: seller.address })) < parseEther("0.5")) {
      log("fundSellerRabdi", await mined(rabdiPublic, await rabdiBuyerNative.sendTransaction({ to: seller.address, value: parseEther("1") })));
    }
    if (evidence.fundSellerWhitechain === undefined && (await wc.getBalance({ address: seller.address })) < parseEther("0.01")) {
      log("fundSellerWhitechain", await mined(wc, await wcBuyer.sendTransaction({ to: seller.address, value: parseEther("0.03") })));
    }

    // 3. Seller lifecycle on Arkiv.
    const base = { seller: seller.address, categoryPath: "electronics/computers/laptops", condition: "good" as const, city: "Mumbai",
      fulfilment: "pickup" as const, media: ["https://placehold.co/800x600/png?text=FreshMarket+demo"] };
    const laptop = await once("arkivCreateListing", () => listingRepository.createWithReceipt({ ...base, title: "Lenovo ThinkPad T14 (live demo)", price: 2, brand: "Lenovo", model: "ThinkPad T14",
      description: "Live demo listing paid with official test USDT through FreshPay.", expirationDays: 7 }, arkivSeller));
    // The edit's patch transaction is recognised on chain if a previous run sent it but lost the receipt.
    await once("arkivEditPrice", async () => (await listingRepository.getById(laptop.entityKey))?.priceMinor === 1_000_000n
      ? { note: "price already 1 USDT on chain (patch sent by a previous run)" }
      : listingRepository.updateListing(laptop.entityKey, { priceMinor: 1_000_000n }, arkivSeller));
    await once("arkivCreate15MinListing", () => listingRepository.createWithReceipt({ ...base, title: "EXPIRY DEMO: test laptop", price: 1,
      description: "Disposable fifteen-minute expiry demonstration. Not for sale.", expirationDays: DEMO_EXPIRATION_DAYS }, arkivSeller));
    await once("arkivCreateThenDelete", async () => {
      const doomed = await listingRepository.createWithReceipt({ ...base, title: "Delete demo item", price: 1,
        description: "Created and then deleted by its seller to show deletion.", expirationDays: 1 }, arkivSeller);
      return { create: doomed, delete: await listingRepository.deleteListing(doomed.entityKey, arkivSeller) };
    });

    // 4. Buyer pays the Arkiv price into FreshPay (exact approval, then pay).
    await once("approveUsdt", async () => mined(wc, await wcBuyer.writeContract({ address: WHITECHAIN_SEPOLIA_USDT, abi: erc20Abi, functionName: "approve", args: [FRESHPAY, 1_000_000n] })));
    const paid = await once("freshPayPay", async () => {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      const payHash = await mined(wc, await wcBuyer.writeContract({ address: FRESHPAY, abi: freshPayAbi, functionName: "pay",
        args: [seller.address, laptop.entityKey, 1_000_000n, deadline] }));
      const payment = await verifyPayment(wc, FRESHPAY, payHash, { merchant: seller.address, reference: laptop.entityKey, amount: 1_000_000n });
      return { txHash: payHash, orderId: payment.order.id.toString(), block: payment.blockNumber.toString() };
    });
    const orderId = BigInt(paid.orderId);
    await once("arkivMarkReserved", () => listingRepository.updateStatus(laptop.entityKey, "reserved", arkivSeller));

    // 5. Seller partial refund from escrow, then the buyer confirms receipt.
    await once("freshPayPartialRefund", async () => mined(wc, await wcSeller.writeContract({ address: FRESHPAY, abi: freshPayAbi, functionName: "refund", args: [orderId, 250_000n] })));
    await once("freshPayRelease", async () => mined(wc, await wcBuyer.writeContract({ address: FRESHPAY, abi: freshPayAbi, functionName: "release", args: [orderId] })));
    const settled = await readOrder(wc, FRESHPAY, orderId);
    expect(settled).toMatchObject({ state: "Released", refunded: 250_000n });
    log("orderState", settled);

    // 6. Seller marks the item sold and extends it; the buyer reviews the verified purchase.
    await once("arkivMarkSold", () => listingRepository.updateStatus(laptop.entityKey, "sold", arkivSeller));
    await once("arkivExtend", () => listingRepository.extendExpiry(laptop.entityKey, 7, arkivSeller));
    await once("arkivReview", () => reviewRepository.create({ seller: seller.address, orderId, sellerRating: 5, itemRating: 4,
      text: "Paid in USDT on Whitechain, picked up as described. Seller refunded a small difference without fuss." }, arkivBuyer));
    log("finishedAt", new Date().toISOString());
  });
});
