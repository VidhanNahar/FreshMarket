import { describe, expect, it, vi } from "vitest";
import { createWalletClient, custom } from "viem";
import { sepolia } from "viem/chains";
import { createEnsWalletClient } from "@/lib/ens/client";
import { rabdiWalletChain } from "@/lib/arkiv/chain";

const seller = "0x1111111111111111111111111111111111111111";
describe("Isolated Sepolia ENS wallet", () => {
  it("rejects Rabdi writes without switching the wallet or sending anything", async () => {
    const request = vi.fn();
    const wallet = createWalletClient({ account: seller, chain: rabdiWalletChain, transport: custom({ request }) });
    await expect(createEnsWalletClient(wallet)).rejects.toThrow("Ethereum Sepolia");
    expect(request).not.toHaveBeenCalled();
  });

  it("checks actual provider network and never silently switches it", async () => {
    const request = vi.fn().mockResolvedValue("0x1");
    const wallet = createWalletClient({ account: seller, chain: sepolia, transport: custom({ request }) });
    await expect(createEnsWalletClient(wallet)).rejects.toThrow("Switch your wallet");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].method).toBe("eth_chainId");
  });

  it("reports signature then hash and does not retry transient write errors", async () => {
    const request = vi.fn().mockResolvedValueOnce("0xaa36a7").mockRejectedValue(Object.assign(new Error("limit"), { code: -32005 }));
    const wallet = createWalletClient({ account: seller, chain: sepolia, transport: custom({ request }) });
    const signature = vi.fn(), submitted = vi.fn();
    const client = await createEnsWalletClient(wallet, { onSignatureRequested: signature, onSubmitted: submitted });
    request.mockClear();
    await expect(client.transport.request({ method: "eth_sendTransaction", params: [{ from: seller }] })).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    expect(signature).toHaveBeenCalledTimes(1);
    expect(submitted).not.toHaveBeenCalled();
  });
});
