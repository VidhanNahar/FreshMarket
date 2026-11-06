import { describe, expect, it } from "vitest";
import { listingRepository } from "@/services/listing-repository";

// Explicit opt-in: public RPC rate limits should not make UI tests flaky.
describe.skipIf(process.env.TEST_ARKIV_DISCOVERY !== "1")("live Arkiv buyer discovery", () => {
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
