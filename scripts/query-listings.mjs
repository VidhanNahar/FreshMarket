import { createPublicClient, defineSchema, str, addr, u64, bytes } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { asc, eq, startsWith } from '@arkiv-network/sdk/query';
import { http } from 'viem';
const schema = defineSchema('freshmarket.listings.v2', {
  seller: addr().indexed(), status: str().indexed(), visibility: str().indexed(), categoryPath: str().indexed(),
  brand: str().indexed(), model: str().indexed(), condition: str().indexed(), city: str().indexed(),
  fulfilment: str().indexed(), priceMinor: u64().indexed(), title: str(), description: bytes(), media: bytes(),
});
const client = createPublicClient({ chain: rabdi({ accessKey: process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? '' }), transport: http() });
const query = client.select().from(schema).where(eq('status', 'available')).where(eq('visibility', 'public'));
// A whole category branch is one indexed query: CATEGORY=pets/dogs npm run query:listings
if (process.env.CATEGORY) query.where(startsWith('categoryPath', process.env.CATEGORY));
const result = await query.orderBy(asc('$key')).limit(20).fetch();
console.log(JSON.stringify(result.entities, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
