"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { useTheme } from "next-themes";
import React, { useState, useSyncExternalStore } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, lightTheme, darkTheme } from "@rainbow-me/rainbowkit";
import { wagmiConfig } from "@/lib/wallet/config";
import { WalletConnectionEffects } from "@/components/wallet/WalletConnectionEffects";

interface Web3ProviderProps {
  children: React.ReactNode;
}

const subscribe = () => () => {};

export function Web3Provider({ children }: Web3ProviderProps) {
  const { resolvedTheme } = useTheme();
  // The saved browser theme is unavailable during SSR. Hydrate with the same
  // light CSS first, then apply the selected theme after hydration commits.
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds stale time
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      })
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={(hydrated && resolvedTheme === "dark" ? darkTheme : lightTheme)({
            accentColor: "#087a55", // emerald-600
            accentColorForeground: "white",
            borderRadius: "medium",
            fontStack: "system",
          })}
        >
          <WalletConnectionEffects />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
