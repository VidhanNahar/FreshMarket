import { describe, expect, it } from "vitest";
import { search, getListingById } from "@/lib/arkiv/queries";

/** Opt-in RPC checks are read-only and never initialize a wallet or publish an entity. */
describe("Live Rabdi public marketplace reads", () => {
  it.runIf(process.env.RUN_ARKIV_INTEGRATION === "1")("queries active listings without a wallet", async () => {
    const listings = await search({ limit: 2 });
    expect(Array.isArray(listings)).toBe(true);
    for (const listing of listings) {
      expect(listing.status).toBe("available");
      expect(listing.seller.toLowerCase()).toBe(listing.owner.toLowerCase());
      expect(typeof listing.priceMinor).toBe("bigint");
    }
  }, 30_000);

  it.runIf(process.env.RUN_ARKIV_INTEGRATION === "1" && Boolean(process.env.ARKIV_TEST_ENTITY_KEY))(
    "reads a real published listing by key without a wallet", async () => {
      const id = process.env.ARKIV_TEST_ENTITY_KEY!;
      const listing = await getListingById(id);
      expect(listing).not.toBeNull();
      expect(listing?.id.toLowerCase()).toBe(id.toLowerCase());
    }, 30_000,
  );
});
