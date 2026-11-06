// @vitest-environment jsdom
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Navbar } from "@/components/layout/Navbar";
import { ListingImage } from "@/components/listings/ListingImage";
vi.mock("next/navigation", () => ({ usePathname: () => "/browse" }));
vi.mock("@/components/wallet/WalletButton", () => ({ WalletButton: () => <button>Connect wallet</button> }));
vi.mock("@/components/wallet/NetworkStatusBadge", () => ({ NetworkStatusBadge: () => <span>Rabdi</span> }));
vi.mock("@/components/wallet/RabdiNetworkGuard", () => ({ RabdiNetworkGuard: () => null }));
afterEach(cleanup);
describe("navigation and media accessibility", () => {
  it("passes axe structural accessibility checks for desktop and expanded mobile navigation", async () => {
    const user = userEvent.setup();
    render(<><Navbar /><main><h1>Marketplace</h1><ListingImage src="https://example.com/image.png" title="Used laptop" /></main></>);
    await user.click(screen.getByRole("button", { name: "Toggle navigation menu" }));
    const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });

  it("announces menu state, active route and supports Escape with focus restoration", async () => {
    const user = userEvent.setup(); render(<Navbar />);
    const toggle = screen.getByRole("button", { name: "Toggle navigation menu" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("navigation", { name: "Mobile navigation" });
    const current = within(menu).getByRole("link", { name: "Browse" });
    expect(current.getAttribute("aria-current")).toBe("page");
    current.focus(); await user.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });
  it("loads public Swarm images with a descriptive alt and gateway URL", () => {
    const reference = "ab".repeat(32);
    render(<ListingImage src={`bzz://${reference}`} title="Used laptop" />);
    expect(screen.getByRole("img", { name: "Used laptop" }).getAttribute("src")).toContain(`/bzz/${reference}/`);
  });
});
