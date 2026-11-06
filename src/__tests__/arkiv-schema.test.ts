import { describe, it, expect } from "vitest";
import { isSchema } from "@arkiv-network/sdk";
import { eq, or, startsWith } from "@arkiv-network/sdk/query";
import { listingSchema, reviewSchema, sellerSchema, LISTING_SCHEMA_VERSION } from "../lib/arkiv/schema";
import { toPriceMinor, toPriceInput, formatPrice } from "../domain/listing";
import { getArkivPublicClient } from "../lib/arkiv/chain";
import fs from "fs/promises";
import path from "path";

describe("Phase 2: Arkiv Schema & Domain Validation", () => {
  it("defines valid freshmarket schemas", () => {
    expect(isSchema(listingSchema)).toBe(true);
    expect(listingSchema.name).toBe("freshmarket.listings.v2");
    expect(LISTING_SCHEMA_VERSION).toBe(2);
    expect(sellerSchema.name).toBe("freshmarket.sellers");
    expect(reviewSchema.name).toBe("freshmarket.reviews");
  });

  it("indexes exactly the listing fields that searches filter on", () => {
    const cols = listingSchema.columns;
    const indexed = Object.entries(cols).filter(([, column]) => column.isIndexed).map(([name]) => name).sort();
    expect(indexed).toEqual(["brand", "categoryPath", "city", "condition", "fulfilment", "model", "priceMinor", "seller", "status", "visibility"]);
    expect(cols.seller.type).toBe("addr");
    expect(cols.priceMinor.type).toBe("u64");
    expect(cols.categoryPath.type).toBe("str");
    expect(cols.title.type).toBe("str");
    expect(cols.description.type).toBe("bytes");
    expect(cols.media.type).toBe("bytes");
    // Arkiv allows 32 attributes per entity, including the schema tag.
    expect(Object.keys(cols).length).toBeLessThan(32);
  });

  it("indexes seller directory and review lookups", () => {
    expect(sellerSchema.columns.ensName.isIndexed).toBe(true);
    expect(sellerSchema.columns.sellerType.isIndexed).toBe(true);
    expect(reviewSchema.columns.seller.isIndexed).toBe(true);
    expect(reviewSchema.columns.orderId.isIndexed).toBe(true);
    expect(reviewSchema.columns.sellerRating.isIndexed).toBe(false);
  });

  it("converts USDT prices to 6-decimal minor units reliably", () => {
    expect(toPriceMinor(100)).toBe(100_000_000n);
    expect(toPriceMinor(49.99)).toBe(49_990_000n);
    expect(toPriceMinor(1.0000005)).toBe(1_000_001n);
    expect(toPriceMinor(0)).toBe(0n);
    expect(toPriceMinor(1e-7)).toBe(0n);

    expect(() => toPriceMinor(-50)).toThrow("Price must be a non-negative finite number");
    expect(() => toPriceMinor(NaN)).toThrow("Price must be a non-negative finite number");
    expect(() => toPriceMinor(Infinity)).toThrow();
    expect(() => toPriceMinor(Number.MAX_SAFE_INTEGER)).toThrow("safe integer");
  });

  it("formats USDT minor units exactly", () => {
    expect(formatPrice(12_500_000n)).toBe("12.50 USDT");
    expect(formatPrice(85_000_000_000n)).toBe("85,000.00 USDT");
    expect(formatPrice(1_234_567n)).toBe("1.234567 USDT");
    expect(formatPrice(0n)).toBe("0.00 USDT");
    expect(formatPrice(18446744073709551615n)).toBe("18,446,744,073,709.551615 USDT");
    expect(toPriceInput(12_500_000n)).toBe("12.5");
    expect(toPriceInput(3_000_000n)).toBe("3");
    expect(() => formatPrice(1.5)).toThrow("safe integer");
    expect(() => formatPrice(-1n)).toThrow();
  });

  it("builds category, brand/model and visibility queries from indexed attributes", () => {
    // Rendering validates the schema/filter combination locally; no live RPC call is needed.
    const query = getArkivPublicClient()
      .select()
      .from(listingSchema)
      .where(eq("status", "available"))
      .where(startsWith("categoryPath", "pets/dogs/toys"))
      .where(or(eq("brand", "lenovo"), startsWith("model", "lenovo")));

    const queryStr = query.toString();
    expect(queryStr).toContain("arkiv.schema = str('freshmarket.listings.v2')");
    expect(queryStr).toContain("status = str('available')");
    expect(queryStr).toContain("categoryPath");
    expect(queryStr).toContain("pets/dogs/toys");
  });

  it("verifies /arkiv/schema.md documentation exists with required fields", async () => {
    const schemaDocPath = path.resolve(import.meta.dirname, "../../arkiv/schema.md");
    const content = await fs.readFile(schemaDocPath, "utf-8");

    expect(content).toContain("freshmarket.listings.v2");
    expect(content).toContain("freshmarket.sellers");
    expect(content).toContain("freshmarket.reviews");
    expect(content).toContain("7794095");
    expect(content).toContain("categoryPath");
    expect(content).toContain("ExpirationTime");
  });
});
