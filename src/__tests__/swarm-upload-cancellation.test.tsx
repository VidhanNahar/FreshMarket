// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SwarmUpload } from "@/components/swarm/SwarmUpload";
const mocks = vi.hoisted(() => ({ address: "0x1111111111111111111111111111111111111111", upload: vi.fn() }));
vi.mock("wagmi", () => ({ useAccount: () => ({ address: mocks.address }), useSignMessage: () => ({ signMessageAsync: vi.fn() }) }));
vi.mock("@/lib/swarm/upload", () => ({ uploadImage: mocks.upload }));
afterEach(cleanup);
describe("upload cancellation and stale completions", () => {
  it("aborts an old wallet upload and never overwrites the form with its late result", async () => {
    let complete!: (reference: string) => void;
    let signal!: AbortSignal;
    mocks.upload.mockImplementation((_file, options) => { signal = options.signal; return new Promise((resolve) => { complete = resolve; }); });
    const onUploaded = vi.fn(); const onBusyChange = vi.fn();
    const { rerender } = render(<SwarmUpload onUploaded={onUploaded} onBusyChange={onBusyChange} />);
    await userEvent.upload(screen.getByLabelText("Upload to Swarm or drop an image here"), new File(["test"], "image.png", { type: "image/png" }));
    expect(signal.aborted).toBe(false);
    mocks.address = "0x2222222222222222222222222222222222222222";
    rerender(<SwarmUpload onUploaded={onUploaded} onBusyChange={onBusyChange} />);
    expect(signal.aborted).toBe(true);
    await act(async () => { complete(`bzz://${"ab".repeat(32)}`); });
    expect(onUploaded).not.toHaveBeenCalled();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });
});
