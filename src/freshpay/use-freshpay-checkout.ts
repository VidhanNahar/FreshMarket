"use client";

import { useCallback, useRef, useState } from "react";
import { erc20Abi, type Address, type Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { freshPayAbi } from "./abi";
import { WHITECHAIN_SEPOLIA_CHAIN_ID, WHITECHAIN_SEPOLIA_USDT } from "./chain";
import { describeFreshPayError, nextCheckoutStep, toPaymentReference, verifyPayment, type VerifiedPayment } from "./sdk";

export type CheckoutPhase =
  | "idle"
  | "switching" // Asking the wallet to switch to Whitechain Sepolia
  | "checking" // Reading balance and allowance
  | "approving" // Waiting for the USDT approve signature or receipt
  | "paying" // Waiting for the pay signature or receipt
  | "verifying" // Reading the order back from the contract
  | "success"
  | "error";

export interface FreshPayCheckoutRequest {
  /** Deployed FreshPay contract on Whitechain Sepolia. */
  contract: Address;
  /** Wallet that receives the payment. */
  merchant: Address;
  /** USDT minor units (6 decimals): 12_500_000n = 12.50 USDT. */
  amount: bigint;
  /** Your order or invoice ID. 32-byte hex is used as is; other strings are hashed. */
  reference: string;
  /** Seconds the quote stays payable once the buyer starts. Default 15 minutes. */
  deadlineSeconds?: number;
  /** Token to pay with. Defaults to the official Whitechain Sepolia test USDT. */
  token?: Address;
}

/** Balance of a token on Whitechain Sepolia; refetches every 15 seconds while mounted. */
export function useUsdtBalance(owner?: Address, token: Address = WHITECHAIN_SEPOLIA_USDT) {
  return useReadContract({
    address: token, abi: erc20Abi, functionName: "balanceOf", args: owner ? [owner] : undefined,
    chainId: WHITECHAIN_SEPOLIA_CHAIN_ID, query: { enabled: Boolean(owner), refetchInterval: 15_000 },
  });
}

/**
 * Runs network switch → balance check → exact-amount approve → pay → onchain verification.
 * Every step re-reads chain state, so a retry after any failure resumes where it stopped.
 */
export function useFreshPayCheckout(request: FreshPayCheckoutRequest) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: WHITECHAIN_SEPOLIA_CHAIN_ID });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [phase, setPhase] = useState<CheckoutPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [approveHash, setApproveHash] = useState<Hex | null>(null);
  const [payHash, setPayHash] = useState<Hex | null>(null);
  const [payment, setPayment] = useState<VerifiedPayment | null>(null);
  const running = useRef(false);
  const token = request.token ?? WHITECHAIN_SEPOLIA_USDT;
  const balance = useUsdtBalance(address, token);

  const run = useCallback(async (): Promise<VerifiedPayment | null> => {
    if (running.current || !address || !client) return null;
    running.current = true;
    setError(null);
    try {
      const reference = toPaymentReference(request.reference);
      if (chainId !== WHITECHAIN_SEPOLIA_CHAIN_ID) {
        setPhase("switching");
        await switchChainAsync({ chainId: WHITECHAIN_SEPOLIA_CHAIN_ID });
      }
      setPhase("checking");
      const [funds, allowance] = await Promise.all([
        client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [address, request.contract] }),
      ]);
      const step = nextCheckoutStep({ chainId: WHITECHAIN_SEPOLIA_CHAIN_ID, balance: funds, allowance, amount: request.amount });
      if (step === "insufficient-balance") throw new Error("Not enough USDT in this wallet for this payment.");
      if (step === "approve") {
        setPhase("approving");
        // Approve exactly this payment, never an unlimited allowance.
        const hash = await writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve",
          args: [request.contract, request.amount], chainId: WHITECHAIN_SEPOLIA_CHAIN_ID });
        setApproveHash(hash);
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The USDT approval reverted.");
      }
      setPhase("paying");
      const deadline = BigInt(Math.floor(Date.now() / 1000) + (request.deadlineSeconds ?? 15 * 60));
      const args = [request.merchant, reference, request.amount, deadline] as const;
      // Simulate first: an already-sold item or expired quote fails before the wallet prompt.
      await client.simulateContract({ address: request.contract, abi: freshPayAbi, functionName: "pay", args, account: address });
      const hash = await writeContractAsync({ address: request.contract, abi: freshPayAbi, functionName: "pay", args,
        chainId: WHITECHAIN_SEPOLIA_CHAIN_ID });
      setPayHash(hash);
      await client.waitForTransactionReceipt({ hash });
      setPhase("verifying");
      const verified = await verifyPayment(client, request.contract, hash,
        { merchant: request.merchant, reference, amount: request.amount });
      setPayment(verified);
      setPhase("success");
      void balance.refetch();
      return verified;
    } catch (cause) {
      setError(describeFreshPayError(cause));
      setPhase("error");
      throw cause;
    } finally {
      running.current = false;
    }
  }, [address, balance, chainId, client, request, switchChainAsync, token, writeContractAsync]);

  return {
    run, phase, error, approveHash, payHash, payment,
    balance: balance.data, isConnected: Boolean(address), onWhitechain: chainId === WHITECHAIN_SEPOLIA_CHAIN_ID,
    isBusy: !["idle", "success", "error"].includes(phase),
  };
}
