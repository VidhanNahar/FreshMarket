import { describe, expect, it } from "vitest";
import { create } from "cuer/QrCode";

describe("RainbowKit QR dependency compatibility", () => {
  it("generates the borderless QR matrix used by the wallet modal", () => {
    // cuer requests border: 0, which newer qr releases reject.
    const code = create("wc:freshmarket@2?relay-protocol=irn&symKey=test");

    expect(code.edgeLength).toBeGreaterThan(0);
    expect(code.grid).toHaveLength(code.edgeLength);
    expect(code.grid.every((row) => row.length === code.edgeLength)).toBe(true);
    // The top-left finder touches the edge when no quiet-zone border is added.
    expect(code.grid[0].slice(0, code.finderLength)).toEqual(
      Array(code.finderLength).fill(true)
    );
  });
});
