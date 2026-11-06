import { describe, it, expect } from "vitest";
import { CATEGORIES } from "../../shared/categories";
import {
  listingFormSchema,
  toCreateListingInput,
  EXPIRATION_DAYS_OPTIONS,
  type ListingFormValues,
} from "@/domain/listing-schema";

describe("Phase 2: Seller Listing Schema & Zod Validation", () => {
  const validPayload: ListingFormValues = {
    title: "Sony WH-1000XM5 Noise Canceling Headphones",
    description: "Gently used headphones with original carry case and cables. Working perfectly.",
    categoryPath: "electronics/audio",
    brand: "Sony",
    model: "WH-1000XM5",
    condition: "like-new",
    fulfilment: "pickup",
    visibility: "public",
    price: 185,
    city: "Mumbai",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e",
    expirationDays: 7,
  };

  it("validates a compliant listing form submission", () => {
    const result = listingFormSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe(validPayload.title);
      expect(result.data.categoryPath).toBe("electronics/audio");
      expect(result.data.price).toBe(185);
      expect(result.data.city).toBe("Mumbai");
      expect(result.data.expirationDays).toBe(7);
    }
  });

  // These constraints must match the repository before a wallet prompt is ever opened.
  it.each([
    { title: "अ".repeat(50) }, { city: "अ".repeat(45) },
    { imageUrl: "https://user:secret@example.com/image.png" },
    { imageUrl: `https://example.com/${"a".repeat(2048)}` },
    { brand: "b".repeat(65) }, { model: "m".repeat(65) },
    { condition: "broken" }, { fulfilment: "teleport" }, { visibility: "secret" },
  ])("rejects values incompatible with Arkiv storage: %j", (change) => {
    expect(listingFormSchema.safeParse({ ...validPayload, ...change }).success).toBe(false);
  });

  describe("Title constraints (5–80 chars)", () => {
    it("rejects title with fewer than 5 characters", () => {
      const result = listingFormSchema.safeParse({
        ...validPayload,
        title: "Sony",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.title?.[0]).toMatch(
          /at least 5 characters/i
        );
      }
    });

    it("rejects title with more than 80 characters", () => {
      const overlongTitle = "A".repeat(81);
      const result = listingFormSchema.safeParse({
        ...validPayload,
        title: overlongTitle,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.title?.[0]).toMatch(
          /cannot exceed 80 characters/i
        );
      }
    });

    it("accepts edge boundary titles (5 chars and 80 chars)", () => {
      const minTitle = listingFormSchema.safeParse({
        ...validPayload,
        title: "Books",
      });
      expect(minTitle.success).toBe(true);

      const maxTitle = listingFormSchema.safeParse({
        ...validPayload,
        title: "A".repeat(80),
      });
      expect(maxTitle.success).toBe(true);
    });
  });

  describe("Description constraints (10–1000 chars)", () => {
    it("rejects description with fewer than 10 characters", () => {
      const result = listingFormSchema.safeParse({
        ...validPayload,
        description: "Too short",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.description?.[0]).toMatch(
          /at least 10 characters/i
        );
      }
    });

    it("rejects description exceeding 1000 characters", () => {
      const overlongDesc = "x".repeat(1001);
      const result = listingFormSchema.safeParse({
        ...validPayload,
        description: overlongDesc,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.description?.[0]).toMatch(
          /cannot exceed 1000 characters/i
        );
      }
    });
  });

  describe("Category tree validation", () => {
    it("accepts every category in the shared tree", () => {
      for (const node of CATEGORIES) {
        const result = listingFormSchema.safeParse({
          ...validPayload,
          categoryPath: node.path,
        });
        expect(result.success).toBe(true);
      }
    });

    it("rejects undefined or invalid categories", () => {
      const result = listingFormSchema.safeParse({
        ...validPayload,
        categoryPath: "illegal/category",
      });
      expect(result.success).toBe(false);
      expect(listingFormSchema.safeParse({ ...validPayload, categoryPath: "" }).success).toBe(false);
    });
  });

  describe("Price & PriceMinor Conversion", () => {
    it("rejects zero or negative price", () => {
      const zeroResult = listingFormSchema.safeParse({
        ...validPayload,
        price: 0,
      });
      expect(zeroResult.success).toBe(false);

      const negativeResult = listingFormSchema.safeParse({
        ...validPayload,
        price: -50,
      });
      expect(negativeResult.success).toBe(false);
    });

    it("rejects prices with more than 6 decimal places (USDT precision)", () => {
      expect(listingFormSchema.safeParse({ ...validPayload, price: 19.123456 }).success).toBe(true);
      const result = listingFormSchema.safeParse({
        ...validPayload,
        price: 19.1234567,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.price?.[0]).toMatch(
          /cannot have more than 6 decimal places/i
        );
      }
    });

    it("maps form values to repository input, with the image as the media list", () => {
      const input = toCreateListingInput(
        {
          ...validPayload,
          price: 18.5,
        },
        "0x1111111111111111111111111111111111111111"
      );

      expect(input.price).toBe(18.5);
      expect(input.media).toEqual([validPayload.imageUrl]);
      expect(input).toMatchObject({ categoryPath: "electronics/audio", brand: "Sony", model: "WH-1000XM5", condition: "like-new", fulfilment: "pickup", visibility: "public" });
      expect(input.seller).toBe("0x1111111111111111111111111111111111111111");
    });
  });

  describe("City Privacy & Validation (Coarse public city, no street addresses)", () => {
    it("accepts valid broad city names", () => {
      const cities = ["Mumbai", "Bengaluru", "New Delhi", "Pune", "Kolkata", "San Francisco"];
      for (const city of cities) {
        const result = listingFormSchema.safeParse({
          ...validPayload,
          city,
        });
        expect(result.success).toBe(true);
      }
    });

    it("rejects city containing numbers or postal codes", () => {
      const result = listingFormSchema.safeParse({
        ...validPayload,
        city: "Mumbai 400001",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.city?.[0]).toMatch(
          /do not include numbers/i
        );
      }
    });

    it("rejects city containing specific street address keywords", () => {
      const invalidAddresses = [
        "221B Baker Street",
        "Flat 402 MG Road",
        "Park Avenue Building",
        "Sector 5 Plot 12",
        "Door 14 Lane 3",
      ];

      for (const addr of invalidAddresses) {
        const result = listingFormSchema.safeParse({
          ...validPayload,
          city: addr,
        });
        expect(result.success).toBe(false);
      }
    });
  });

  describe("Image URL Validation (HTTPS Required)", () => {
    it("accepts valid https image URLs", () => {
      const validUrls = [
        "https://images.unsplash.com/photo-1",
        "https://example.com/item.png",
        "https://cdn.freshmarket.io/products/headphones.jpg",
      ];

      for (const url of validUrls) {
        const result = listingFormSchema.safeParse({
          ...validPayload,
          imageUrl: url,
        });
        expect(result.success).toBe(true);
      }
    });

    it("rejects insecure HTTP, non-URL or non-HTTP protocols", () => {
      const invalidUrls = [
        "not-a-url",
        "http://insecure.example.com/item.png",
        "ftp://example.com/item.png",
        "/local/path/image.png",
        "javascript:alert(1)",
      ];

      for (const url of invalidUrls) {
        const result = listingFormSchema.safeParse({
          ...validPayload,
          imageUrl: url,
        });
        expect(result.success).toBe(false);
      }
    });
  });

  describe("Expiration Days Validation", () => {
    it("accepts all permitted expiration periods (3, 7, 14, 30 days)", () => {
      for (const days of EXPIRATION_DAYS_OPTIONS) {
        const result = listingFormSchema.safeParse({
          ...validPayload,
          expirationDays: days,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.expirationDays).toBe(days);
        }
      }
    });

    it("rejects non-standard expiration intervals", () => {
      const invalidDays = [1, 5, 10, 60, 365];
      for (const days of invalidDays) {
        const result = listingFormSchema.safeParse({
          ...validPayload,
          expirationDays: days as unknown as ListingFormValues["expirationDays"],
        });
        expect(result.success).toBe(false);
      }
    });
  });

  describe("Output Shape: CreateListingInput ready for Arkiv Repository", () => {
    it("produces a complete CreateListingInput object", () => {
      const seller = "0xAbCd1234567890AbCd1234567890AbCd12345678" as const;
      const output = toCreateListingInput(validPayload, seller);

      expect(output).toEqual({
        title: "Sony WH-1000XM5 Noise Canceling Headphones",
        description: "Gently used headphones with original carry case and cables. Working perfectly.",
        categoryPath: "electronics/audio",
        brand: "Sony",
        model: "WH-1000XM5",
        condition: "like-new",
        fulfilment: "pickup",
        visibility: "public",
        price: 185,
        city: "Mumbai",
        media: ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e"],
        expirationDays: 7,
        seller,
      });
    });
  });
});
