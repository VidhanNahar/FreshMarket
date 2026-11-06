// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

beforeEach(() => { vi.stubGlobal("matchMedia", () => ({ matches: false, addListener() {}, removeListener() {} })); });
afterEach(() => { vi.unstubAllGlobals(); cleanup(); localStorage.removeItem("freshmarket-theme"); document.documentElement.classList.remove("light", "dark"); });
describe("marketplace themes", () => {
  it("switches both ways and remembers the selection", async () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    const toggle = screen.getByRole("button", { name: "Toggle light and dark theme" });
    await userEvent.click(toggle);
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    expect(localStorage.getItem("freshmarket-theme")).toBe("dark");
    await userEvent.click(toggle);
    await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
    expect(localStorage.getItem("freshmarket-theme")).toBe("light");
  });
  it("keeps semantic text pairs above 4.5:1 contrast in both themes", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const luminance = (hex: string) => {
      const [r,g,b] = hex.match(/[a-f0-9]{2}/gi)!.map(value => {
        const v = parseInt(value, 16)/255;
        return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
      });
      return .2126*r + .7152*g + .0722*b;
    };
    for (const block of [css.match(/:root\s*\{([^}]+)\}/)![1], css.match(/html\.dark\s*\{([^}]+)\}/)![1]]) {
      const colors = Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[a-f0-9]{6})/gi)].map(m=>[m[1],m[2]]));
      for (const [fg,bg] of [["foreground","background"],["card-foreground","card"],["muted-foreground","background"],["muted-foreground","card"],["muted-foreground","muted"],["primary","background"],["primary-foreground","primary"],["secondary-foreground","secondary"],["popover-foreground","popover"],["trust","background"],["warning","background"]]) {
        const a=luminance(colors[fg]),b=luminance(colors[bg]);
        expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
