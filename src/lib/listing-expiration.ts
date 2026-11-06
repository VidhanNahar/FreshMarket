import type { Listing } from "@/domain/listing";

export function isListingExpired(listing: Pick<Listing, "expiresAtBlock">, currentBlock?: bigint) {
  return currentBlock !== undefined && listing.expiresAtBlock <= currentBlock;
}
export function expirationState(expiresAtBlock: bigint, currentBlock?: bigint, elapsedSeconds = 0) {
  if (currentBlock === undefined) return { expired: false, nearExpiry: false, label: `Expires at block ${expiresAtBlock}` };
  const blocks = expiresAtBlock - currentBlock;
  if (blocks <= 0n) return { expired: true, nearExpiry: false, label: "Expired" };
  const seconds = blocks * 2n - BigInt(Math.max(0, Math.floor(elapsedSeconds)));
  const nearExpiry = blocks * 2n < 86400n;
  let label = "Awaiting expiration confirmation";
  if (seconds >= 86400n) label = `Expires in ~${seconds / 86400n} days`;
  else if (seconds >= 3600n) label = `Expires in ~${seconds / 3600n} hours`;
  else if (seconds >= 60n) label = `Expires in ~${seconds / 60n} min`;
  else if (seconds > 0n) label = `Expires in ~${seconds} seconds`;
  return { expired: false, nearExpiry, label };
}
