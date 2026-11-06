import { describe, expect, it } from "vitest";
import { createReader, readCatalogue } from "../../storefront/src/reader";
import { listingRepository } from "@/services/listing-repository";

// Explicit opt-in: public RPC rate limits should not make UI tests flaky.
describe.skipIf(process.env.TEST_ARKIV_DISCOVERY !== "1")("live Arkiv buyer discovery", () => {
  it("reads the same live entity keys through Storefront B's independent client", async () => {
    const freshmarket = await listingRepository.searchAll();
    const secondary = await readCatalogue(createReader(process.env.VITE_ARKIV_ACCESS_KEY ?? ""));
    for (const listing of freshmarket) {
      const copy = secondary.listings.find((record) => record.id === listing.id);
      expect(copy).toBeDefined();
      expect(copy?.seller.toLowerCase()).toBe(listing.seller.toLowerCase());
      expect(copy?.priceMinor).toBe(listing.priceMinor);
    }
    console.info(`Independent live reader returned ${secondary.listings.length} records; FreshMarket returned ${freshmarket.length}.`);
  }, 30_000);

  it("reads the real catalogue without a wallet and resolves a returned detail record", async () => {
    const listings = await listingRepository.searchAll();
    expect(Array.isArray(listings)).toBe(true);
    for (const listing of listings) {
      expect(listing.status).toBe("available");
      expect(listing.owner.toLowerCase()).toBe(listing.seller.toLowerCase());
    }
    if (listings.length) {
      const detail = await listingRepository.getById(listings[0].id);
      expect(detail?.id).toBe(listings[0].id);
    }
    console.info(`Live discovery returned ${listings.length} available listings.`);
  }, 30_000);
});
