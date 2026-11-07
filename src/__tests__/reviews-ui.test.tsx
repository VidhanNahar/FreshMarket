// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FreshPayOrder } from "@/freshpay";
import type { Review } from "@/services/review-repository";
import { ReviewForm } from "@/components/reviews/ReviewForm";
import { SellerReviews } from "@/components/reviews/SellerReviews";

const seller = "0x1111111111111111111111111111111111111111" as const;
const buyer = "0x2222222222222222222222222222222222222222" as const;
const order: FreshPayOrder = { id: 7n, buyer, merchant: seller, amount: 1_000_000n, refunded: 0n, ref: `0x${"ab".repeat(32)}`, paidAt: 1, releaseAfter: 2, state: "Released" };
const review = (over: Partial<Review>): Review => ({ id: "0x1", buyer, seller, orderId: 7n, sellerRating: 5, itemRating: 4, text: "Smooth pickup", updatedAtBlock: 10n, verified: true, ...over });

const mocks = vi.hoisted(() => ({
  account: { address: undefined as string | undefined, chainId: 7794095 },
  reviews: [] as unknown[], submit: vi.fn(), switchChain: vi.fn(),
  write: { phase: "idle", txHash: undefined as string | undefined, error: null as string | null, isPending: false },
}));
vi.mock("wagmi", () => ({ useAccount: () => mocks.account, useSwitchChain: () => ({ switchChainAsync: mocks.switchChain, isPending: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-query", async (original) => ({ ...await original<typeof import("@tanstack/react-query")>(), useQuery: () => ({ data: order }) }));
vi.mock("@/hooks/useListings", () => ({ useListing: (id: string) => ({ data: id ? { id, title: "Lenovo ThinkPad T14" } : undefined, isPending: false }) }));
vi.mock("@/hooks/use-reviews", () => ({
  useSellerReviews: () => ({ data: mocks.reviews, isPending: false, isError: false }),
  useWriteReview: () => ({ ...mocks.write, submit: mocks.submit }),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.account = { address: undefined, chainId: 7794095 }; mocks.reviews = []; });

describe("Seller reviews", () => {
  it("averages verified purchases only and links each to its FreshPay order", () => {
    mocks.reviews = [review({}), review({ id: "0x2", orderId: 8n, sellerRating: 3, itemRating: 2 }), review({ id: "0x3", orderId: 9n, verified: false, text: "fake" })];
    render(<SellerReviews seller={seller} />);
    expect(screen.getByText(/Seller 4.0\/5 · Items 3.0\/5 · 2 verified purchases/)).toBeTruthy();
    expect(screen.queryByText("fake")).toBeNull();
    expect(screen.getByText(/1 review is hidden/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "verified purchase, order #7" }).getAttribute("href")).toBe("/receipt/7");
  });

  it("names the item each review was written about", () => {
    mocks.reviews = [review({})];
    const { rerender } = render(<SellerReviews seller={seller} />);
    expect(screen.getByRole("link", { name: "Lenovo ThinkPad T14" }).getAttribute("href")).toBe(`/listing/${order.ref}`);
    rerender(<SellerReviews seller={seller} listingId={order.ref} />);
    expect(screen.getByText("Review of this item")).toBeTruthy();
  });

  it("explains how reviews start when there are none", () => {
    render(<SellerReviews seller={seller} />);
    expect(screen.getByText(/No verified reviews yet/)).toBeTruthy();
  });
});

describe("Review form on the receipt", () => {
  it("is shown only to the buyer, and only after release or refund", () => {
    mocks.account.address = seller;
    const { rerender } = render(<ReviewForm order={order} />);
    expect(screen.queryByRole("heading", { name: "Review this seller" })).toBeNull();
    mocks.account.address = buyer;
    rerender(<ReviewForm order={{ ...order, state: "Paid" }} />);
    expect(screen.getByText(/once you confirm the item arrived/)).toBeTruthy();
    rerender(<ReviewForm order={{ ...order, state: "Refunded" }} />);
    expect(screen.getByRole("heading", { name: "Review this seller" })).toBeTruthy();
  });

  it("submits ratings and text for this order and seller", async () => {
    mocks.account.address = buyer;
    mocks.submit.mockResolvedValue(true);
    render(<ReviewForm order={order} />);
    await userEvent.click(screen.getAllByText("3 ★")[0]);
    await userEvent.type(screen.getByLabelText(/Comments/), "As described");
    await userEvent.click(screen.getByRole("button", { name: "Publish review" }));
    expect(mocks.submit).toHaveBeenCalledWith({ seller, orderId: 7n, sellerRating: 3, itemRating: 5, text: "As described" });
  });

  it("asks to switch to Rabdi before signing, and offers to update an existing review", async () => {
    mocks.account = { address: buyer, chainId: 1874 };
    mocks.reviews = [review({})];
    render(<ReviewForm order={order} />);
    expect(screen.getByRole("heading", { name: "Update your review" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Switch to Arkiv Rabdi to sign the review" }));
    expect(mocks.switchChain).toHaveBeenCalledWith({ chainId: 7794095 });
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
