import type { Listing } from "@/domain/listing";

export const fixtureListing: Listing = {
  id: `0x${"11".repeat(32)}`, title: "Wooden desk", description: "Used desk in good condition",
  categoryPath: "furniture/tables", brand: "ikea", model: "linnmon", condition: "good", fulfilment: "pickup", visibility: "public",
  city: "mumbai", seller: "0x1111111111111111111111111111111111111111", owner: "0x1111111111111111111111111111111111111111",
  priceMinor: 49_990_000n, status: "available", createdAtBlock: 100n, expiresAtBlock: 10000000n, media: ["https://example.com/desk.jpg"],
};
