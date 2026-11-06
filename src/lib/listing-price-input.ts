import { PRICE_DECIMALS } from "@/domain/listing";

/** Exact decimal parsing: never round an edited uint64 USDT price through a JS number. */
export function parseListingPrice(input: string): bigint {
  const text = input.trim();
  if (!new RegExp(`^\\d{1,14}(?:\\.\\d{1,${PRICE_DECIMALS}})?$`).test(text)) {
    throw new Error(`Enter a non-negative USDT price with up to ${PRICE_DECIMALS} decimal places`);
  }
  const [whole, fraction = ""] = text.split(".");
  const minor = BigInt(whole) * 10n ** BigInt(PRICE_DECIMALS) + BigInt(fraction.padEnd(PRICE_DECIMALS, "0"));
  if (minor > 18_446_744_073_709_551_615n) throw new Error("Price exceeds Arkiv's supported range");
  return minor;
}
