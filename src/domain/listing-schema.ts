import { z } from "zod";
import { resolveImageSource } from "../../shared/media";
import { isCategoryPath } from "../../shared/categories";
import { squash } from "../../shared/search";

// Non-Latin brands can be under 64 characters yet over Arkiv's 128-byte str limit.
const fitsSearchKey = (value: string) => new TextEncoder().encode(squash(value)).length <= 128;
import {
  LISTING_CONDITIONS,
  LISTING_FULFILMENTS,
  LISTING_VISIBILITIES,
  PRICE_DECIMALS,
  type CreateListingInput,
} from "./listing";

export type { CreateListingInput };

export const DEMO_EXPIRATION_DAYS = 15 / (24 * 60);
export const EXPIRATION_DAYS_OPTIONS = [DEMO_EXPIRATION_DAYS, 3, 7, 14, 30] as const;
export type ExpirationDays = (typeof EXPIRATION_DAYS_OPTIONS)[number];

// Privacy filter to disallow exact personal street addresses in the coarse public city field
const DISALLOWED_ADDRESS_KEYWORDS = [
  "street",
  "st.",
  "road",
  "rd.",
  "avenue",
  "ave",
  "lane",
  "ln.",
  "drive",
  "dr.",
  "boulevard",
  "blvd",
  "apartment",
  "apt",
  "flat",
  "floor",
  "house",
  "building",
  "bldg",
  "block",
  "sector",
  "plot",
  "door",
  "room",
];

const disallowedAddressRegex = new RegExp(
  `\\b(${DISALLOWED_ADDRESS_KEYWORDS.join("|")})\\b`,
  "i"
);

export const listingFormSchema = z.object({
  title: z
    .string({ message: "Listing title is required" })
    .trim()
    .min(5, "Title must be at least 5 characters")
    .max(80, "Title cannot exceed 80 characters")
    // Arkiv str limits bytes, so some Unicode titles hit the limit before 80 characters.
    .refine((value) => new TextEncoder().encode(value).length <= 128, "Title cannot exceed 128 UTF-8 bytes"),

  description: z
    .string({ message: "Description is required" })
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(1000, "Description cannot exceed 1000 characters"),

  categoryPath: z.string().refine(isCategoryPath, "Please select a valid category"),

  // Optional search keys; stored lowercase without spaces, so they must fit 128 bytes.
  brand: z.string().trim().max(64, "Brand cannot exceed 64 characters")
    .refine(fitsSearchKey, "Brand is too long once stored (128 UTF-8 bytes)"),
  model: z.string().trim().max(64, "Model cannot exceed 64 characters")
    .refine(fitsSearchKey, "Model is too long once stored (128 UTF-8 bytes)"),

  condition: z.enum(LISTING_CONDITIONS, { message: "Please select the item condition" }),
  fulfilment: z.enum(LISTING_FULFILMENTS, { message: "Choose local pickup or shipping" }),
  visibility: z.enum(LISTING_VISIBILITIES, { message: "Choose public or unlisted" }),

  price: z
    .number({ message: "Price must be a valid number" })
    .positive("Price must be greater than 0")
    .max(100_000_000, "Price exceeds maximum allowable amount")
    .refine(
      (val) => {
        const parts = val.toString().split(".");
        return parts.length === 1 || parts[1].length <= PRICE_DECIMALS;
      },
      { message: `Price cannot have more than ${PRICE_DECIMALS} decimal places` }
    ),

  city: z
    .string({ message: "City is required" })
    .trim()
    .min(2, "City name must be at least 2 characters")
    .max(50, "City name cannot exceed 50 characters")
    .refine((value) => new TextEncoder().encode(value).length <= 128, "City cannot exceed 128 UTF-8 bytes")
    .refine((val) => !/\d/.test(val), {
      message: "Coarse city only — do not include numbers or postal codes for privacy",
    })
    .refine((val) => !disallowedAddressRegex.test(val), {
      message: "Coarse city only — do not enter personal street addresses or apartment numbers",
    }),

  imageUrl: z
    .string({ message: "Image URL is required" })
    .trim()
    .max(2048, "Image URL cannot exceed 2048 characters")
    .refine((value) => resolveImageSource(value) !== null,
      "Use an HTTPS URL without credentials or bzz:// followed by a 64-character public Swarm reference"),

  expirationDays: z.union(
    [z.literal(DEMO_EXPIRATION_DAYS), z.literal(3), z.literal(7), z.literal(14), z.literal(30)],
    {
      message: "Choose the 15-minute demo or 3, 7, 14, or 30 days",
    }
  ),
});

export type ListingFormValues = z.infer<typeof listingFormSchema>;

export function toCreateListingInput(
  values: ListingFormValues,
  seller: `0x${string}` = "0x0000000000000000000000000000000000000000"
): CreateListingInput {
  return {
    seller,
    title: values.title.trim(),
    description: values.description.trim(),
    categoryPath: values.categoryPath,
    brand: values.brand.trim(),
    model: values.model.trim(),
    condition: values.condition,
    fulfilment: values.fulfilment,
    visibility: values.visibility,
    price: Number(values.price),
    city: values.city.trim(),
    // The form takes one image; the Arkiv media list supports up to MAX_MEDIA_ITEMS.
    media: [values.imageUrl.trim()],
    expirationDays: Number(values.expirationDays),
  };
}
