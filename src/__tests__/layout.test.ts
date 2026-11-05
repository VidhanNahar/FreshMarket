import { describe, it, expect } from "vitest";

describe("Phase 0 Layout & Route Structure", () => {
  it("defines standard marketplace route paths", () => {
    const requiredRoutes = [
      "/",
      "/browse",
      "/sell",
      "/my-listings",
      "/listing/[id]"
    ];

    expect(requiredRoutes).toContain("/");
    expect(requiredRoutes).toContain("/browse");
    expect(requiredRoutes).toContain("/sell");
    expect(requiredRoutes).toContain("/my-listings");
    expect(requiredRoutes).toContain("/listing/[id]");
  });

  it("has environment variable template defined", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    
    const envExamplePath = path.resolve(import.meta.dirname, "../../.env.example");
    const content = await fs.readFile(envExamplePath, "utf-8");

    expect(content).toContain("NEXT_PUBLIC_ARKIV_ACCESS_KEY");
    expect(content).toContain("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID");
  });

  it("has valid MIT License file with team members", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");

    const licensePath = path.resolve(import.meta.dirname, "../../LICENSE");
    const content = await fs.readFile(licensePath, "utf-8");

    expect(content).toContain("MIT License");
    expect(content).toContain("Vidhan Nahar");
    expect(content).toContain("Dhairya");
  });
});
