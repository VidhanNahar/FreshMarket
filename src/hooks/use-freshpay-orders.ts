"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { erc20Abi, type Address, type Hex } from "viem";
import { useAccount, useSwitchChain, useWriteContract } from "wagmi";
import { toast } from "sonner";
import { describeFreshPayError, freshPayAbi, WHITECHAIN_SEPOLIA_CHAIN_ID, type FreshPayOrder } from "@/freshpay";
import { whitechainPublicClient } from "@/lib/freshpay/client";
import {
  activeOrderQueryOptions, buyerOrdersQueryOptions, merchantOrdersQueryOptions, orderEventsQueryOptions, orderKeys,
  orderQueryOptions, requireFreshPay,
} from "@/lib/freshpay/orders";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export const useOrder = (id: bigint | null) => useQuery({ ...orderQueryOptions(id ?? 0n), enabled: orderQueryOptions(0n).enabled && id !== null });
export const useOrderEvents = (id: bigint | null) => useQuery({ ...orderEventsQueryOptions(id ?? 0n), enabled: orderEventsQueryOptions(0n).enabled && id !== null });
export const useMerchantOrders = (merchant?: Address) => useQuery({ ...merchantOrdersQueryOptions(merchant ?? ZERO),
  enabled: merchantOrdersQueryOptions(ZERO).enabled && Boolean(merchant), refetchInterval: 15_000 });
export const useBuyerOrders = (buyer?: Address) => useQuery({ ...buyerOrdersQueryOptions(buyer ?? ZERO),
  enabled: buyerOrdersQueryOptions(ZERO).enabled && Boolean(buyer) });
export const useActiveOrder = (merchant?: Address, listingId?: string) => useQuery({ ...activeOrderQueryOptions(merchant ?? ZERO, listingId ?? ""),
  enabled: activeOrderQueryOptions(ZERO, "").enabled && Boolean(merchant && listingId), refetchInterval: 15_000 });

export type OrderAction = { kind: "release" } | { kind: "refund"; amount: bigint };

/**
 * Buyer release and merchant refund on Whitechain. A refund of released funds is pulled from
 * the merchant's wallet, so it first approves exactly the refund amount.
 */
export function useOrderActions() {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const cache = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  async function send(request: Parameters<typeof writeContractAsync>[0]) {
    const hash = await writeContractAsync(request);
    setTxHash(hash);
    const receipt = await whitechainPublicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The transaction reverted");
    return hash;
  }

  async function run(order: FreshPayOrder, action: OrderAction): Promise<Hex | null> {
    if (pending || !address) return null;
    const label = action.kind === "release" ? "Releasing payment" : "Sending refund";
    setPending(`${order.id}:${action.kind}`);
    setTxHash(null);
    const notification = toast.loading(`${label}… confirm in your wallet`);
    try {
      const contract = requireFreshPay();
      if (chainId !== WHITECHAIN_SEPOLIA_CHAIN_ID) await switchChainAsync({ chainId: WHITECHAIN_SEPOLIA_CHAIN_ID });
      if (action.kind === "refund" && order.state === "Released") {
        const token = await whitechainPublicClient.readContract({ address: contract, abi: freshPayAbi, functionName: "token" });
        const allowance = await whitechainPublicClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [address, contract] });
        if (allowance < action.amount) {
          toast.loading("Approve the refund amount in your wallet", { id: notification });
          await send({ address: token, abi: erc20Abi, functionName: "approve", args: [contract, action.amount], chainId: WHITECHAIN_SEPOLIA_CHAIN_ID });
        }
      }
      // Simulate first so a revert (wrong state, not due, over-refund) never reaches the wallet.
      let hash: Hex;
      if (action.kind === "release") {
        await whitechainPublicClient.simulateContract({ address: contract, abi: freshPayAbi, functionName: "release", args: [order.id], account: address });
        hash = await send({ address: contract, abi: freshPayAbi, functionName: "release", args: [order.id], chainId: WHITECHAIN_SEPOLIA_CHAIN_ID });
      } else {
        const args = [order.id, action.amount] as const;
        await whitechainPublicClient.simulateContract({ address: contract, abi: freshPayAbi, functionName: "refund", args, account: address });
        hash = await send({ address: contract, abi: freshPayAbi, functionName: "refund", args, chainId: WHITECHAIN_SEPOLIA_CHAIN_ID });
      }
      toast.success(action.kind === "release" ? "Payment released to the seller" : "Refund sent to the buyer", { id: notification });
      await cache.invalidateQueries({ queryKey: orderKeys.all });
      return hash;
    } catch (error) {
      toast.error(describeFreshPayError(error), { id: notification });
      return null;
    } finally {
      setPending(null);
    }
  }

  return { run, pending, txHash, isPending: pending !== null };
}
