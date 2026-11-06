# 🌿 FreshMarket

> **A wallet-owned, portable second-hand marketplace with time-limited listings.**  
> Built from scratch for **ETHGlobal Mumbai 2026** targeting **Arkiv — Build on Arkiv (From Scratch)**.

---

## 📌 Problem & Promise

Traditional second-hand marketplaces (like Craigslist, OLX, Facebook Marketplace) suffer from three critical problems:
1. **Accumulation of Outdated / Ghost Listings:** Old listings sit indefinitely even after an item is long gone.
2. **Platform Walled Gardens:** Sellers must manually duplicate and maintain their listings across multiple fragmented platforms.
3. **Availability Trust Issues:** Centralized platforms have no transparent proof of when an item was published, reserved, or edited.

### The FreshMarket Promise
- **Seller-Owned Listings:** Every listing is an onchain Arkiv entity cryptographically owned by the seller's wallet.
- **Automatic Expiration:** Listings expire at their deadline (default 7 days) and automatically drop out of active discovery unless renewed by the seller.
- **Portable Across Storefronts:** Because listings live in Arkiv's decentralized database, competing or community-run storefronts can query and display the exact same items without platform gatekeeping.
- **Explicit Lifecycle:** Sellers explicitly toggle item states (`available` → `reserved` → `sold`), providing clear transparency.

---

## 🏗️ Architecture & Boundaries

```
FreshMarket
├── src/
│   ├── app/                    # Next.js App Router (UI routes & pages)
│   │   ├── page.tsx            # Landing page with value proposition
│   │   ├── browse/page.tsx     # Public marketplace discovery (No wallet needed)
│   │   ├── sell/page.tsx       # Seller listing creation
│   │   ├── my-listings/page.tsx# Seller lifecycle dashboard (Available/Reserved/Sold)
│   │   └── listing/[id]/       # Dynamic entity detail view
│   ├── components/             # Reusable UI & Layout (Navbar, Footer, shadcn)
│   ├── domain/                 # Listing DTOs, Zod schemas, validation rules
│   ├── lib/
│   │   ├── arkiv/              # Rabdi chain config, public client, schema & queries
│   │   └── utils.ts            # Tailwind styling utilities
│   └── services/               # Repository interfaces (ArkivListingRepository)
```

### Network & Clients
- **Network:** Arkiv Rabdi Testnet (Chain ID `7794095`)
- **Public Read Client:** Reads active listings using restricted access key (safe for browser).
- **Wallet Client:** Signs transactions with connected user wallet via Wagmi & RainbowKit (no private keys exposed).

---

## 🛠️ Tech Stack

| Layer | Choice |
| :--- | :--- |
| **Framework** | Next.js 16 (App Router), React 19, TypeScript |
| **Styling** | Tailwind CSS v4, shadcn/ui, Lucide Icons |
| **Decentralized Database** | `@arkiv-network/sdk`, Arkiv Rabdi Testnet |
| **Web3 & Wallet** | Wagmi v2, Viem v2, RainbowKit v2 |
| **Data Fetching & Cache** | TanStack React Query v5 |
| **Testing** | Vitest with React plugin |

---

## 👥 Team

- **Vidhan Nahar** ([@VidhanNahar](https://github.com/VidhanNahar)) — Arkiv integration, repository architecture, and resilience testing.
- **Dhairya** ([@Dhairya0531](https://github.com/Dhairya0531)) — UI flows, seller lifecycle UX, and storefront portability proof.

---

## 🚀 Getting Started

### 1. Clone & Install
```bash
git clone https://github.com/VidhanNahar/FreshMarket.git
cd FreshMarket
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Add your:
- `NEXT_PUBLIC_ARKIV_ACCESS_KEY` from [Arkiv Hub](https://hub.arkiv.network/access-keys)
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` from [WalletConnect Cloud](https://cloud.walletconnect.com)

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view FreshMarket.

### 4. Connect a Wallet (Arkiv Rabdi Testnet)

FreshMarket uses RainbowKit + Wagmi. The navbar shows a live network status badge and a custom wallet pill.

- **Connect / disconnect:** Use **Connect Wallet** in the navbar. MetaMask, Rabby and WalletConnect-compatible wallets are supported.
- **Network enforcement:** Only Arkiv Rabdi (chain ID `7794095`) is configured. If the wallet is on another chain, a red banner shows **Wrong network** with a one-click **Switch to Arkiv Rabdi Testnet** button. Wagmi uses `wallet_switchEthereumChain` and `wallet_addEthereumChain`, so the network is added automatically when missing.
- **Wallet details:** Click the green address pill (`0x1234...5678`) to open the wallet dialog. It shows the full address with **Copy**, the Rabdi balance, faucet instructions and **Disconnect**.
- **Faucet:** [https://hub.arkiv.network/faucet](https://hub.arkiv.network/faucet) — paste your wallet address and request Rabdi testnet funds.
- **Low balance:** A warning appears when the Rabdi balance is below `0.001 ETH`. Browsing still works; listing writes may fail until the wallet is funded.
- **Missing wallet extension:** If no injected wallet is detected, a dismissible banner links to MetaMask and Rabby. WalletConnect (QR) still works.
- **Rejected requests:** RainbowKit shows connection-rejection errors inside its connect modal. Rejected network switches are caught by FreshMarket and shown as a short toast; the page does not crash.

#### Manual browser-wallet test checklist

This development environment has no browser wallet available to automate, so the following steps must be run manually in Chrome/Brave/Firefox before a demo:

1. Install MetaMask or Rabby and create/import a test wallet.
2. Start the app, click **Connect Wallet**, and approve the connection.
3. If prompted, approve adding/switching to Arkiv Rabdi (`7794095`); verify the green `Arkiv Rabdi Testnet · 7794095` badge and the address pill.
4. Open the address pill → copy the address → open the faucet link and request test funds.
5. Switch the wallet to another network (for example Sepolia) and confirm the red **Wrong network** banner and one-click switch.
6. Reject a network switch once and confirm a friendly rejection toast appears.
7. Click **Disconnect** and confirm the navbar returns to **Connect Wallet**.
8. In a browser profile without MetaMask/Rabby, confirm the missing-wallet banner appears and browsing still works.

### 5. Run Tests & Build
```bash
npm test        # Runs Vitest test suite
npm run lint    # Runs ESLint checks
npm run build   # Compiles production build
```

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).

### Buyer discovery (issues #9 and #10)

- `/browse` reads available, non-expired listings from Arkiv without a wallet. Cards link to `/listing/[id]`, which displays the actual description, image, seller, publication time, expiration block, and Rabdi Explorer record.
- Category pills apply immediately. Enter a title search and/or an exact, case-sensitive city name and press **Search**. Sort by newest or price; prices are grouped by currency because no exchange-rate conversion is performed.
- Filters live in `category`, `city`, `q`, and `sort` URL parameters. Shared links, refresh, and browser back/forward restore them. **Clear all filters** returns to `/browse`.
- Discovery reads all matching pages (100 records per RPC page) before searching titles and sorting. Large catalogues require more RPC requests; configure an origin-restricted Arkiv access key to reduce rate limiting.
- Expiration time is estimated from the current block and Rabdi's two-second target. When block reads are unavailable, the exact expiration block remains visible. The catalogue refreshes every minute and the block height every 30 seconds.
- Failed/missing images have a fallback. Failed reads show a retry action; missing or expired detail records have an unavailable state. The share action uses native sharing when supported, otherwise copies the URL.

Buyer component and hook tests run with `npm test`. To include the opt-in live catalogue read:

```bash
TEST_ARKIV_DISCOVERY=1 npm test
```

The live test only reads public data. When the catalogue is empty, populated card and detail flows are covered using fixtures rather than creating onchain records.
