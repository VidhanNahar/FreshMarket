import { createPublicClient, defineSchema, str, addr, u64, bytes } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { asc, eq } from '@arkiv-network/sdk/query';
import { http } from 'viem';
const schema = defineSchema('freshmarket.listings', {
  seller: addr().indexed(), category: str().indexed(), status: str().indexed(), city: str().indexed(), priceMinor: u64().indexed(),
  title: str(), description: bytes(), imageUrl: bytes(), currency: str().default('INR'), createdAt: u64(),
});
const client = createPublicClient({ chain: rabdi({ accessKey: process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? '' }), transport: http() });
const result = await client.select().from(schema).where(eq('status', 'available')).orderBy(asc('$key')).limit(20).fetch();
console.log(JSON.stringify(result.entities, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
