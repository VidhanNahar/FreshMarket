// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../storefront/src/reader", () => ({
  createReader: () => ({}), readCatalogue: mocks.read,
  portablePrice: (minor: bigint) => `INR ${minor / 100n}`,
}));
const row = { id: `0x${"ab".repeat(32)}`, seller: "0x1111111111111111111111111111111111111111", title: "<img src=x onerror=alert(1)>",
  priceMinor: 10000n, currency: "INR", city: "Mumbai", category: "Electronics", status: "available", expiresAtBlock: 1000n };
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  // Disable automatic background polling; exercise refresh deterministically.
  vi.spyOn(globalThis, "setInterval").mockReturnValue(0 as unknown as ReturnType<typeof setInterval>);
  document.body.innerHTML = '<button id="refresh">Refresh</button><select id="status-filter"><option value="all">All</option><option value="reserved">Reserved</option></select><p id="read-status"></p><section id="listings"></section>';
  mocks.read.mockResolvedValue({ listings: [row], block: 100n });
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe("standalone reader rendering and refresh", () => {
  it("renders public content as text and reflects real refresh responses without a wallet provider", async () => {
    await import("../../storefront/src/main");
    await waitFor(() => expect(document.querySelectorAll("article")).toHaveLength(1));
    expect(document.querySelector("article img")).toBeNull();
    expect(document.querySelector("h2")?.textContent).toBe(row.title);
    expect(document.querySelector("code")?.textContent).toBe(row.id);
    const filter = document.querySelector<HTMLSelectElement>("#status-filter")!;
    fireEvent.change(filter, { target: { value: "reserved" } });
    expect(document.querySelectorAll("article")).toHaveLength(0);
    mocks.read.mockResolvedValueOnce({ listings: [{ ...row, status: "reserved", priceMinor: 20000n }], block: 110n });
    fireEvent.click(document.querySelector("button")!);
    await waitFor(() => expect(document.querySelector("strong")?.textContent).toBe("INR 200"));
    expect(document.querySelector(".reserved")).not.toBeNull();
    mocks.read.mockResolvedValueOnce({ listings: [], block: 1000n });
    fireEvent.click(document.querySelector("button")!);
    await waitFor(() => expect(document.querySelectorAll("article")).toHaveLength(0));
  });
  it("keeps prior records clearly labelled stale after RPC failure and enables retry", async () => {
    await import("../../storefront/src/main");
    await waitFor(() => expect(document.querySelectorAll("article")).toHaveLength(1));
    mocks.read.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(document.querySelector("button")!);
    await waitFor(() => expect(document.querySelector("#read-status")?.textContent).toContain("may be stale"));
    expect(document.querySelectorAll("article")).toHaveLength(1);
    expect(document.querySelector("button")?.disabled).toBe(false);
  });
});
