import { z } from "zod";
import {
  LISTING_CATEGORIES,
  type ListingCategory,
  type CreateListingInput,
} from "./listing";

export { LISTING_CATEGORIES, type ListingCategory, type CreateListingInput };

export const EXPIRATION_DAYS_OPTIONS = [3, 7, 14, 30] as const;
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
    .max(80, "Title cannot exceed 80 characters"),

  description: z
    .string({ message: "Description is required" })
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(1000, "Description cannot exceed 1000 characters"),

  category: z.enum(LISTING_CATEGORIES, {
    message: "Please select a valid category",
  }),

  price: z
    .number({ message: "Price must be a valid number" })
    .positive("Price must be greater than 0")
    .max(100_000_000, "Price exceeds maximum allowable amount")
    .refine(
      (val) => {
        const parts = val.toString().split(".");
        return parts.length === 1 || parts[1].length <= 2;
      },
      { message: "Price cannot have more than 2 decimal places" }
    ),

  currency: z.string().min(1, "Currency is required"),

  city: z
    .string({ message: "City is required" })
    .trim()
    .min(2, "City name must be at least 2 characters")
    .max(50, "City name cannot exceed 50 characters")
    .refine((val) => !/\d/.test(val), {
      message: "Coarse city only — do not include numbers or postal codes for privacy",
    })
    .refine((val) => !disallowedAddressRegex.test(val), {
      message: "Coarse city only — do not enter personal street addresses or apartment numbers",
    }),

  imageUrl: z
    .string({ message: "Image URL is required" })
    .trim()
    .url("Please enter a valid URL")
    .refine(
      (url) => /^https:\/\/.+/i.test(url),
      "Image URL must start with https://"
    ),

  expirationDays: z.union(
    [z.literal(3), z.literal(7), z.literal(14), z.literal(30)],
    {
      message: "Expiration period must be 3, 7, 14, or 30 days",
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
    category: values.category,
    price: Number(values.price),
    priceMinor: Math.round(Number(values.price) * 100),
    currency: values.currency || "INR",
    city: values.city.trim(),
    imageUrl: values.imageUrl.trim(),
    expirationDays: Number(values.expirationDays),
  };
}
