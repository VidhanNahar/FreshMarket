/** Exact decimal parsing: never round an edited uint64 price through a JS number. */
export function parseListingPrice(input: string): bigint {
  const text = input.trim();
  if (!/^\d{1,18}(?:\.\d{1,2})?$/.test(text)) throw new Error("Enter a non-negative price with up to two decimal places");
  const [whole, fraction = ""] = text.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > 18_446_744_073_709_551_615n) throw new Error("Price exceeds Arkiv's supported range");
  return minor;
}
