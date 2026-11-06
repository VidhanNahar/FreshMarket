// @vitest-environment jsdom
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({ theme: undefined as string | undefined }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: saved.theme }) }));
vi.mock("wagmi", () => ({ WagmiProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/lib/wallet/config", () => ({ wagmiConfig: {} }));
vi.mock("@/components/wallet/WalletConnectionEffects", () => ({ WalletConnectionEffects: () => null }));
vi.mock("@rainbow-me/rainbowkit", () => ({
  lightTheme: () => "light", darkTheme: () => "dark",
  RainbowKitProvider: ({ children, theme }: { children: React.ReactNode; theme: string }) => <div data-rk=""><style dangerouslySetInnerHTML={{ __html: `:root { color-scheme: ${theme}; }` }} />{children}</div>,
}));
const { Web3Provider } = await import("@/components/providers/Web3Provider");

describe("wallet theme hydration", () => {
  it("hydrates server light CSS without mismatches before applying saved dark CSS", async () => {
    saved.theme = undefined;
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Web3Provider><p>Marketplace</p></Web3Provider>);
    expect(container.querySelector("style")?.textContent).toContain("light");
    document.body.append(container);
    saved.theme = "dark";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const recover = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, <Web3Provider><p>Marketplace</p></Web3Provider>, { onRecoverableError: recover }); });
      expect(container.querySelector("style")?.textContent).toContain("dark");
      expect(recover).not.toHaveBeenCalled();
      expect(error.mock.calls.flat().join(" ")).not.toMatch(/hydration|hydrated|didn't match/i);
    } finally {
      await act(async () => root?.unmount());
      error.mockRestore(); container.remove(); saved.theme = undefined;
    }
  });
});
