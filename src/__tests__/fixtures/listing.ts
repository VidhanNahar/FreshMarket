import type { Listing } from "@/domain/listing";

export const fixtureListing: Listing = {
  id: `0x${"11".repeat(32)}`, title: "Wooden desk", description: "Used desk in good condition", category: "Furniture", city: "Mumbai",
  seller: "0x1111111111111111111111111111111111111111", owner: "0x1111111111111111111111111111111111111111",
  priceMinor: 4999n, currency: "INR", status: "available", createdAt: 1700000000000, expiresAtBlock: 10000000n, imageUrl: "https://example.com/desk.jpg",
};

