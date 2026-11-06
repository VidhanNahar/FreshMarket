import type { PublicArkivClient } from "@arkiv-network/sdk";
import { getArkivPublicClient } from "./chain";

/**
 * Estimate from the latest block and observed block interval, not from the user's clock.
 * This is display metadata only; expiresAtBlock remains the authoritative deadline.
 */
export async function estimateListingExpiration(expiresAtBlock: bigint, client: Pick<PublicArkivClient, "getBlock"> = getArkivPublicClient()): Promise<number | null> {
  try {
    const latest = await client.getBlock();
    if (latest.number === null || latest.number < 10n) return null;
    const earlier = await client.getBlock({ blockNumber: latest.number - 10n });
    const secondsPerBlock = Number(latest.timestamp - earlier.timestamp) / 10;
    if (secondsPerBlock <= 0) return null;
    const timestamp = (Number(latest.timestamp) + Number(expiresAtBlock - latest.number) * secondsPerBlock) * 1000;
    return Number.isFinite(timestamp) && Math.abs(timestamp) <= 8.64e15 ? timestamp : null;
  } catch {
    // Timestamp estimation must never turn a successful create into a failed submission.
    return null;
  }
}
