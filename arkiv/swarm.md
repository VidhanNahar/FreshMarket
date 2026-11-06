# Swarm image integration

## Seller photo flow

The seller form links to https://gateway.ethswarm.org/ in a new tab. Upload a photo there, copy its direct HTTPS download URL or public Swarm reference, then paste it into FreshMarket. Prefix a bare 64-hex reference with `bzz://`. Check the live preview before publishing; publishing stores the reference in Arkiv, not the image bytes.

This manual flow needs no FreshMarket Bee upload credentials or upload-state Redis. The default read gateway is mainnet (`https://api.gateway.ethswarm.org`). Set both `NEXT_PUBLIC_SWARM_GATEWAY_URL` and `VITE_SWARM_GATEWAY_URL` to that value for mainnet references and restart/rebuild both readers. Existing testnet references still require a testnet read gateway.

## Optional direct-upload implementation

The server upload route and supporting component remain available in the codebase but are not used by the seller form. The setup below applies only when enabling that optional integration.

## What is implemented

FreshMarket stores public PNG/JPEG/WebP files on Swarm and stores their immutable `bzz://<64-hex-reference>` in the Arkiv entity's `media` list (UTF-8 JSON bytes). Legacy credential-free HTTPS URLs still work. Encrypted 128-hex references are rejected: they can contain decryption keys and must not be published as plain Arkiv metadata.

- `src/lib/swarm/upload.ts`: bounded image validation, wallet authorization, XHR progress, timeout and response-reference handling. Progress reaches 95% while sending to the server and 100% only after Bee accepts the upload; it is not a network replication percentage.
- `src/app/api/swarm/upload/route.ts`: server-only postage and Bee credentials, explicit wallet allowlist, origin and signed-content checks, authentication before body allocation, single-use claims, per-wallet quotas, streamed size limit, image magic checks, and a single Bee POST. No automatic upload retry.
- `src/components/swarm/SwarmUpload.tsx`: accessible file/drop input and upload status. It fills the form; it does not publish a listing. Wallet changes or navigation cancel the upload flow and prevent late results from overwriting the form.
- `shared/media.ts`: public reference and HTTPS resolution rules shared by both readers, with a configurable network-matched gateway.
- `src/components/listings/ListingImage.tsx` and `storefront/src/main.ts`: image loading and failure/slow-gateway fallback.

The HTTP integration follows [Bee's upload API](https://docs.ethswarm.org/api/). Public references are fetched as `/bzz/<reference>/`. Swarm testnet uploads need a testnet gateway; changing the gateway does not move content between networks.

## Configure and reproduce

1. Obtain a usable postage batch from your Bee node/service or the Swarm team. Record its actual ID, network, expiry, buyer wallet or provider. No postage purchase or faucet allocation has been performed by this agent.
2. Set server-only `SWARM_BEE_URL`, `SWARM_POSTAGE_BATCH_ID`, optionally `SWARM_BEE_API_KEY`, comma-separated `SWARM_UPLOAD_ALLOWED_WALLETS`, and exact `SWARM_ALLOWED_ORIGIN`. Never put a Bee API credential in a `NEXT_PUBLIC_` or `VITE_` variable. Use HTTPS except for a loopback Bee node in local development. A deployed Vercel function cannot reach a Bee node running only on your laptop's localhost.
3. Set `NEXT_PUBLIC_SWARM_GATEWAY_URL` and `VITE_SWARM_GATEWAY_URL` for the network holding the file. Rebuild browser bundles after changing them.
4. Start FreshMarket, connect an enabled EOA wallet and select/drop an image on `/sell`. Sign the content-bound authorization message (no gas transaction). An unavailable configuration fails closed; HTTPS images remain usable.
5. Verify the returned `bzz://` reference through the public gateway, then publish the listing with the actual Rabdi wallet transaction. Read the entity independently and verify its `media` list contains that same reference.
6. Open the same entity in `/browse`, its detail page, and `/storefront`. Verify actual image loading through the selected gateway. Record the video timestamp showing this flow.

An operator can also exercise Bee directly, using their real environment configuration:

```bash
curl --fail-with-body -X POST "$SWARM_BEE_URL/bzz?name=product-image" \
  -H "swarm-postage-batch-id: $SWARM_POSTAGE_BATCH_ID" \
  -H 'Content-Type: image/png' --data-binary @product.png
# Use the reference returned by Bee in your configured read gateway:
curl --fail-with-body "$NEXT_PUBLIC_SWARM_GATEWAY_URL/bzz/$SWARM_REFERENCE/" --output downloaded.png
```

The direct command assumes your Bee endpoint is accessible without a separate API credential; use your service's documented authentication otherwise. Never commit its credential or terminal output containing one.

## Security and limits

Only configured wallets can use the upload proxy. The signed authorization binds origin, file hash, MIME type, byte length and a two-minute time window. It uses EOA message recovery, not contract-wallet signature validation. Authorizations are claimed once before reading the image body, with per-wallet limits of 32 attempts and 16 MiB per UTC hour. Production requires a Redis-compatible HTTPS REST store (`SWARM_UPLOAD_STATE_URL` and `SWARM_UPLOAD_STATE_TOKEN`) supporting atomic EVAL; missing or unavailable shared state fails closed before Bee is contacted. Development uses process memory only. Identical requests, signature malleability and concurrent replays share the same content-message claim. Failed/malformed uploads consume their reservation so they cannot evade quotas. Keep the allowlist restricted; perimeter request/body rate limits are still needed for a public deployment. No storage credits are provisioned automatically.

Files are public and maximum 4 MiB. File signature validation is not a full image decoder or moderation system. Bee acceptance is not a guarantee of indefinite storage or global gateway availability; postage lifetime, pinning and node connectivity matter. A gateway timeout renders a fallback rather than blocking browsing.

## Genuine evidence status

| Required evidence | Status |
| --- | --- |
| Bee node/service and network | Not supplied or connected |
| Postage batch ID and buyer/provider | Not supplied |
| Real Swarm reference and public read URL | No live upload performed |
| Rabdi entity key containing the reference | No live Swarm-backed listing published |
| Writer transaction hash and wallet | No real writer evidence supplied |
| Demo video timestamp | Not recorded |

The implementation and mock-transport tests do not establish bonus qualification. Issue #22's live acceptance and #23's real gateway-rendering acceptance remain open until this evidence is recorded. Official requirements: https://ethglobal.com/events/mumbai/prizes
