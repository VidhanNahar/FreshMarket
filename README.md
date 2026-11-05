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

### 4. Run Tests & Build
```bash
npm test        # Runs Vitest test suite
npm run lint    # Runs ESLint checks
npm run build   # Compiles production build
```

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
