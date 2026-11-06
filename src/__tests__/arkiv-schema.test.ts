import { describe, it, expect } from "vitest";
import { isSchema } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import { listingSchema, LISTING_SCHEMA_VERSION } from "../lib/arkiv/schema";
import { toPriceMinor, formatPrice } from "../domain/listing";
import { getArkivPublicClient } from "../lib/arkiv/chain";
import fs from "fs/promises";
import path from "path";

describe("Phase 2: Arkiv Schema & Domain Validation", () => {
  it("defines valid freshmarket.listings schema", () => {
    expect(isSchema(listingSchema)).toBe(true);
    expect(listingSchema.name).toBe("freshmarket.listings");
    expect(LISTING_SCHEMA_VERSION).toBe(1);
  });

  it("configures required indexed attributes correctly", () => {
    const cols = listingSchema.columns;

    // Indexed columns
    expect(cols.seller.isIndexed).toBe(true);
    expect(cols.seller.type).toBe("addr");

    expect(cols.category.isIndexed).toBe(true);
    expect(cols.category.type).toBe("str");

    expect(cols.status.isIndexed).toBe(true);
    expect(cols.status.type).toBe("str");

    expect(cols.city.isIndexed).toBe(true);
    expect(cols.city.type).toBe("str");

    expect(cols.priceMinor.isIndexed).toBe(true);
    expect(cols.priceMinor.type).toBe("u64");

    // Unindexed payload columns
    expect(cols.title.isIndexed).toBe(false);
    expect(cols.title.type).toBe("str");

    expect(cols.description.isIndexed).toBe(false);
    expect(cols.description.type).toBe("bytes");

    expect(cols.imageUrl.isIndexed).toBe(false);
    expect(cols.imageUrl.type).toBe("bytes");

    expect(cols.createdAt.isIndexed).toBe(false);
    expect(cols.createdAt.type).toBe("u64");
  });

  it("converts major display price to minor integer units reliably", () => {
    expect(toPriceMinor(100)).toBe(10000n);
    expect(toPriceMinor(85000)).toBe(8500000n);
    expect(toPriceMinor(49.99)).toBe(4999n);
    expect(toPriceMinor(1.005)).toBe(101n);
    expect(toPriceMinor(0)).toBe(0n);
    expect(toPriceMinor(1e-7)).toBe(0n);

    expect(() => toPriceMinor(-50)).toThrow("Price must be a non-negative finite number");
    expect(() => toPriceMinor(NaN)).toThrow("Price must be a non-negative finite number");
    expect(() => toPriceMinor(Infinity)).toThrow();
    expect(() => toPriceMinor(Number.MAX_SAFE_INTEGER)).toThrow("safe integer");
  });

  it("formats minor currency units to readable strings", () => {
    const formatted = formatPrice(8500000n, "INR");
    expect(formatted).toContain("85,000");

    const formattedUsd = formatPrice(2500n, "USD");
    expect(formattedUsd).toContain("25");
    expect(formatPrice(4999n, "INR")).toContain("49.99");
    expect(formatPrice(18446744073709551615n, "USD")).toBe("$184,467,440,737,095,516.15");
    expect(() => formatPrice(1.5)).toThrow("safe integer");
    expect(() => formatPrice(-1n)).toThrow();
  });

  it("builds valid Arkiv query expression using schema and indexed attributes", () => {
    // Rendering validates the schema/filter combination locally; no live RPC call is needed.
    const publicClient = getArkivPublicClient();
    const query = publicClient
      .select()
      .from(listingSchema)
      .where(eq("status", "available"));

    const queryStr = query.toString();
    expect(queryStr).toContain("arkiv.schema = str('freshmarket.listings')");
    expect(queryStr).toContain("status = str('available')");
  });

  it("verifies /arkiv/schema.md documentation exists with required fields", async () => {
    const schemaDocPath = path.resolve(import.meta.dirname, "../../arkiv/schema.md");
    const content = await fs.readFile(schemaDocPath, "utf-8");

    expect(content).toContain("freshmarket.listings");
    expect(content).toContain("7794095");
    expect(content).toContain("priceMinor");
    expect(content).toContain("ExpirationTime");
  });
});
