# Vercel release and smoke checklist

## Deployable configuration

The repository contains a Next.js app plus the independent Vite-built storefront. `npm run build` first runs `prebuild` to generate `public/storefront/`, then builds Next.js. Use the root as the Vercel project directory. The production build script explicitly selects Next.js Webpack, which was verified locally; development remains on Turbopack.

Configure these values in Vercel before building:

- `NEXT_PUBLIC_ARKIV_ACCESS_KEY`: restrict to the final production/preview origins in Arkiv Hub.
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`: use the team's actual project ID and allowed domain settings.
- `VITE_ARKIV_ACCESS_KEY`: public reader key, origin restricted.
- Public read gateway variables and server-only Swarm variables from `.env.example`, if enabling optional uploads. The Bee node must be reachable from Vercel over HTTPS. Restrict `SWARM_ALLOWED_ORIGIN` to the intended app origin and enable only intended upload wallets.

Do not publish server-only secrets in Vercel's public environment variables. Public build variables are baked into bundles, so redeploy after changing them. Swarm upload requests are bounded to 4 MiB with a 90-second function limit; confirm the deployed account's function limits support it.

## Automated read-only smoke checks

```bash
npm run lint
npm test
npm run build
npm run start -- --port 3001
# In another terminal:
npm run smoke -- http://localhost:3001
# After an actual deployment, use its real URL:
npm run smoke -- https://your-actual-deployment-domain
```

The smoke script checks HTTP routes, page markers, Storefront B's redirect and JavaScript asset. It does not certify wallet operations, viewport layout, Lighthouse scores or live image availability.

## Manual acceptance from build guide section 8

- [ ] Verify public URL without authentication and add that real URL to README/repository description.
- [ ] Verify 375px and desktop layouts, keyboard navigation, focus, modal scroll and Lighthouse accessibility.
- [ ] Connect a funded Rabdi wallet and publish a real listing; retain its transaction hash and entity key.
- [ ] Read it in incognito without connecting a wallet.
- [ ] Reserve and sell it; verify the entity persists with unchanged deadline.
- [ ] Read the same key, price and status in independently hosted SECOND LOOK.
- [ ] Publish the 15-minute demo and observe absence at the confirmed expiration block.
- [ ] If enabling Swarm, record a real batch provenance, upload, public read URL and Arkiv reference.

The deployment is not recorded as complete until these observations and references are added to `submission-evidence.md`. No Vercel login/project was available at implementation time; connecting the Vercel integration enables deployment work to continue.
