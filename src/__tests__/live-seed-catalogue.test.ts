/**
 * Seeds the live testnets with a realistic catalogue through the app's own repositories:
 * three sellers in three cities publish 15 second-hand listings on Arkiv, and the buyer makes three
 * real USDT purchases through FreshPay, confirms receipt, and leaves a verified review for each.
 *
 * Opt-in, run by the buyer wallet's owner after live-demo-flow (it reuses `.live-demo/seller.json`):
 *   read -s "LIVE_DEMO_BUYER_KEY?Paste key: " && export LIVE_DEMO_BUYER_KEY=0x${LIVE_DEMO_BUYER_KEY#0x}
 *   npx vitest run src/__tests__/live-seed-catalogue.test.ts
 *   unset LIVE_DEMO_BUYER_KEY
 *
 * Resumable: every finished step is stored in the git-ignored `.live-demo/catalogue.json`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWalletClient as createArkivWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { createPublicClient, createWalletClient, erc20Abi, http, parseEther, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

try { process.loadEnvFile(".env.local"); } catch { /* optional */ }
const buyerKey = process.env.LIVE_DEMO_BUYER_KEY as Hex | undefined;
const FRESHPAY = "0x2D67Ed6aA929B1Dbc28370AEe3e23AD56277657F" as const;
process.env.NEXT_PUBLIC_FRESHPAY_ADDRESS ??= FRESHPAY;
process.env.NEXT_PUBLIC_FRESHPAY_DEPLOY_BLOCK ??= "12407705";

const photo = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&q=80&auto=format&fit=crop`;
type Seller = "mumbai" | "pune" | "bengaluru";
interface Item {
  id: string; seller: Seller; title: string; price: number; categoryPath: string; brand?: string; model?: string;
  condition: "new" | "like-new" | "good" | "fair"; fulfilment: "pickup" | "ship"; description: string; image: string;
  purchase?: { sellerRating: number; itemRating: number; review: string };
}

// Second-hand prices in USDT. The three cheap items are bought and reviewed on chain.
const CATALOGUE: Item[] = [
  { id: "iphone-x", seller: "mumbai", title: "iPhone X 64GB, Space Grey", price: 140, categoryPath: "electronics/phones", brand: "Apple", model: "iPhone X", condition: "good", fulfilment: "pickup",
    image: photo("1510557880182-3d4d3cba35a5"), description: "Battery health 81%. Face ID works, minor scuffs on the frame, screen has no cracks. Comes with original box and a Lightning cable." },
  { id: "sony-xm4", seller: "mumbai", title: "Sony WH-1000XM4 noise-cancelling headphones", price: 120, categoryPath: "electronics/audio", brand: "Sony", model: "WH-1000XM4", condition: "like-new", fulfilment: "ship",
    image: photo("1505740420928-5e560c06d30e"), description: "Used for four months, always kept in the case. Ear pads are clean. Includes case, USB-C and 3.5 mm cables." },
  { id: "ps5", seller: "mumbai", title: "PlayStation 5 Disc Edition with one controller", price: 330, categoryPath: "electronics/gaming", brand: "Sony", model: "PS5", condition: "good", fulfilment: "pickup",
    image: photo("1606144042614-b2417e99c4e3"), description: "Bought in 2023, runs quietly. One DualSense controller with slight stick wear. HDMI and power cables included." },
  { id: "canon-200d", seller: "mumbai", title: "Canon EOS 200D with 18-55 mm kit lens", price: 290, categoryPath: "electronics/cameras", brand: "Canon", model: "EOS 200D", condition: "good", fulfilment: "ship",
    image: photo("1516035069371-29a1b244cc32"), description: "About 9,000 shutter clicks. Lens is clean with no fungus. Two batteries, charger, strap and a 32 GB SD card." },
  { id: "magic-keyboard", seller: "mumbai", title: "Apple Magic Keyboard (Lightning)", price: 45, categoryPath: "electronics/computers/accessories", brand: "Apple", model: "Magic Keyboard", condition: "like-new", fulfilment: "ship",
    image: photo("1587829741301-dc798b83add3"), description: "Spare keyboard, barely used. All keys work, holds charge for weeks. Lightning cable included." },
  { id: "hero-sprint", seller: "pune", title: "Hero Sprint 21-speed mountain bike", price: 95, categoryPath: "vehicles/bicycles", brand: "Hero", model: "Sprint", condition: "good", fulfilment: "pickup",
    image: photo("1485965120184-e220f721d03e"), description: "Serviced last month: new brake pads and tuned gears. 26-inch wheels, fits riders 5'5\" to 6'. Pickup from Kothrud." },
  { id: "round-table", seller: "pune", title: "Round dining table with two chairs", price: 110, categoryPath: "furniture/tables", condition: "good", fulfilment: "pickup",
    image: photo("1533090481720-856c6e3c1fdc"), description: "80 cm white table with beech legs and two matching chairs. Small mark on one chair seat. Disassembles for transport." },
  { id: "armchair", seller: "pune", title: "Tufted cream accent armchair", price: 75, categoryPath: "furniture/seating", condition: "like-new", fulfilment: "pickup",
    image: photo("1567538096630-e0c55bd6374c"), description: "From a pet-free, smoke-free home. Fabric is clean, legs are solid. Moving out, so priced for a quick sale." },
  { id: "smart-tv", seller: "pune", title: "43-inch 4K Android smart TV", price: 180, categoryPath: "electronics/tvs", brand: "Xiaomi", model: "Mi TV 4A 43", condition: "good", fulfilment: "pickup",
    image: photo("1593359677879-a4bb92f829d1"), description: "Bright panel, no dead pixels. Remote and wall mount included. Netflix and Prime apps work." },
  { id: "dog-toy", seller: "pune", title: "Rope and squeaky chew toy set for dogs", price: 1.5, categoryPath: "pets/dogs/toys", condition: "new", fulfilment: "ship",
    image: photo("1601758228041-f3b2795255f1"), description: "Unopened bundle of three toys our dog never got to. Suits medium and large breeds.",
    purchase: { sellerRating: 5, itemRating: 5, review: "Arrived the next day exactly as described. Our dog has not put it down since." } },
  { id: "fossil-watch", seller: "bengaluru", title: "Fossil chronograph watch, brown leather strap", price: 60, categoryPath: "fashion/watches", brand: "Fossil", model: "FS5061", condition: "good", fulfilment: "ship",
    image: photo("1523275335684-37898b6baf30"), description: "All chronograph functions work. New battery fitted in October. Light wear on the strap." },
  { id: "air-max", seller: "bengaluru", title: "Nike Air Max 90, UK 9", price: 55, categoryPath: "fashion/footwear", brand: "Nike", model: "Air Max 90", condition: "like-new", fulfilment: "ship",
    image: photo("1542291026-7eec264c27ff"), description: "Worn three times, wrong size for me. Soles have almost no wear. Original box included." },
  { id: "backpack", seller: "bengaluru", title: "25 L laptop backpack, navy", price: 2.5, categoryPath: "fashion/bags", condition: "good", fulfilment: "ship",
    image: photo("1553062407-98eeb64c6a62"), description: "Fits a 15-inch laptop. Padded straps, all zips work. Small fade on the front pocket.",
    purchase: { sellerRating: 4, itemRating: 4, review: "Good bag for the price. Shipping took three days, the fade is a bit more visible than in the photo." } },
  { id: "teddy", seller: "bengaluru", title: "Large plush teddy bear (60 cm)", price: 2, categoryPath: "kids/toys/stuffed-animals", condition: "like-new", fulfilment: "ship",
    image: photo("1559454403-b8fb88521f11"), description: "Washed and clean, no loose stitching. Our daughter has outgrown it.",
    purchase: { sellerRating: 5, itemRating: 4, review: "Very soft and clean. Seller packed it carefully and answered questions quickly." } },
  { id: "macbook-air", seller: "bengaluru", title: "MacBook Air M1, 8 GB / 256 GB", price: 520, categoryPath: "electronics/computers/laptops", brand: "Apple", model: "MacBook Air M1", condition: "good", fulfilment: "pickup",
    image: photo("1496181133206-80ce9b88a853"), description: "Battery cycle count 212. One small dent on the lid corner, display is perfect. Comes with the original charger." },
];

describe.skipIf(!buyerKey)("live seed: realistic Arkiv catalogue with paid, reviewed purchases", () => {
  it("publishes listings, buys three items with USDT and reviews them", { timeout: 30 * 60_000 }, async () => {
    const { whitechainSepolia, WHITECHAIN_SEPOLIA_USDT, freshPayAbi, verifyPayment } = await import("@/freshpay");
    const { listingRepository } = await import("@/services/listing-repository");
    const { reviewRepository } = await import("@/services/review-repository");

    mkdirSync(".live-demo", { recursive: true });
    const keyFile = ".live-demo/sellers.json";
    const keys: Record<string, Hex> = existsSync(keyFile) ? JSON.parse(readFileSync(keyFile, "utf8")) : {};
    // Reuse the live-demo seller as the Mumbai seller; generate the other two once.
    if (!keys.mumbai && existsSync(".live-demo/seller.json")) keys.mumbai = JSON.parse(readFileSync(".live-demo/seller.json", "utf8")).key;
    for (const city of ["mumbai", "pune", "bengaluru"] as const) keys[city] ??= generatePrivateKey();
    writeFileSync(keyFile, JSON.stringify(keys), { mode: 0o600 });

    const stateFile = ".live-demo/catalogue.json";
    const state: Record<string, unknown> = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};
    const save = () => writeFileSync(stateFile, JSON.stringify(state, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    const once = async <T,>(step: string, run: () => Promise<T>): Promise<T> => {
      if (state[step] !== undefined) { console.log(step, "(already done)"); return state[step] as T; }
      const value = await run(); state[step] = value; save(); console.log(step, JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))); return value;
    };

    const rabdiChain = rabdi({ accessKey: process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? "" });
    const transport = () => http(undefined, { retryCount: 4, retryDelay: 1_500, timeout: 30_000 });
    const buyer = privateKeyToAccount(buyerKey!);
    const sellerFor = (city: Seller) => {
      const account = privateKeyToAccount(keys[city]);
      return { account, arkiv: createArkivWalletClient({ account, chain: rabdiChain, transport: transport() }) };
    };
    const sellers = { mumbai: sellerFor("mumbai"), pune: sellerFor("pune"), bengaluru: sellerFor("bengaluru") };
    state.buyer = buyer.address;
    state.sellers = Object.fromEntries(Object.entries(sellers).map(([city, s]) => [city, s.account.address]));
    save();

    const rabdiPublic = createPublicClient({ chain: rabdiChain, transport: transport() });
    const rabdiBuyer = createWalletClient({ account: buyer, chain: rabdiChain, transport: transport() });
    const arkivBuyer = createArkivWalletClient({ account: buyer, chain: rabdiChain, transport: transport() });
    const wc = createPublicClient({ chain: whitechainSepolia, transport: http() });
    const wcBuyer = createWalletClient({ account: buyer, chain: whitechainSepolia, transport: http() });
    const mined = async (client: typeof wc | typeof rabdiPublic, hash: Hex) => {
      expect((await client.waitForTransactionReceipt({ hash })).status).toBe("success");
      return hash;
    };

    // Gas for each seller on Rabdi (Arkiv writes cost a fraction of a tGLM each).
    for (const [city, seller] of Object.entries(sellers)) {
      if ((await rabdiPublic.getBalance({ address: seller.account.address })) < parseEther("0.2")) {
        await once(`fund:${city}`, async () => mined(rabdiPublic, await rabdiBuyer.sendTransaction({ to: seller.account.address, value: parseEther("0.4") })));
      }
    }

    // 1. Publish the catalogue (30 days, public).
    const keysById: Record<string, Hex> = {};
    for (const item of CATALOGUE) {
      const seller = sellers[item.seller];
      const receipt = await once(`list:${item.id}`, () => listingRepository.createWithReceipt({
        seller: seller.account.address, title: item.title, description: item.description, price: item.price,
        categoryPath: item.categoryPath, brand: item.brand, model: item.model, condition: item.condition,
        city: item.seller === "bengaluru" ? "Bengaluru" : item.seller === "pune" ? "Pune" : "Mumbai",
        fulfilment: item.fulfilment, media: [item.image], expirationDays: 30,
      }, seller.arkiv));
      keysById[item.id] = receipt.entityKey;
    }

    // 2. Buy, confirm and review the cheap items with official USDT.
    for (const item of CATALOGUE.filter((entry) => entry.purchase)) {
      const seller = sellers[item.seller];
      const ref = keysById[item.id];
      const amount = BigInt(Math.round(item.price * 1_000_000));
      await once(`approve:${item.id}`, async () => mined(wc, await wcBuyer.writeContract({ address: WHITECHAIN_SEPOLIA_USDT, abi: erc20Abi, functionName: "approve", args: [FRESHPAY, amount] })));
      const paid = await once(`pay:${item.id}`, async () => {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
        const hash = await mined(wc, await wcBuyer.writeContract({ address: FRESHPAY, abi: freshPayAbi, functionName: "pay", args: [seller.account.address, ref, amount, deadline] }));
        const payment = await verifyPayment(wc, FRESHPAY, hash, { merchant: seller.account.address, reference: ref, amount });
        return { txHash: hash, orderId: payment.order.id.toString() };
      });
      const orderId = BigInt(paid.orderId);
      await once(`reserve:${item.id}`, () => listingRepository.updateStatus(ref, "reserved", seller.arkiv));
      await once(`release:${item.id}`, async () => mined(wc, await wcBuyer.writeContract({ address: FRESHPAY, abi: freshPayAbi, functionName: "release", args: [orderId] })));
      await once(`sold:${item.id}`, () => listingRepository.updateStatus(ref, "sold", seller.arkiv));
      // A review whose receipt was lost is found on chain instead of being posted twice.
      await once(`review:${item.id}`, async () => {
        const existing = (await reviewRepository.listForSeller(seller.account.address))
          .find((review) => review.orderId === orderId && review.buyer.toLowerCase() === buyer.address.toLowerCase());
        if (existing) return { entityKey: existing.id, note: "already on chain" };
        return reviewRepository.create({ seller: seller.account.address, orderId,
          sellerRating: item.purchase!.sellerRating, itemRating: item.purchase!.itemRating, text: item.purchase!.review }, arkivBuyer);
      });
    }
    state.finishedAt = new Date().toISOString();
    save();
  });
});
