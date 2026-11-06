// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {FreshPay} from "../src/FreshPay.sol";

/// 6-decimal stand-in for Whitechain test USDT.
contract MockUSDT is ERC20 {
    constructor() ERC20("Tether USD", "USDT") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Burns 1% of every transfer, like a fee-charging token.
contract FeeToken is MockUSDT {
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}

contract FreshPayTest is Test {
    uint64 constant DELAY = 3 days;
    uint256 constant PRICE = 12_500_000; // 12.50 USDT, the Arkiv priceMinor encoding
    bytes32 constant LISTING = keccak256("arkiv-listing-entity-key");

    MockUSDT usdt;
    FreshPay pay;
    address merchant = makeAddr("merchant");
    address buyer = makeAddr("buyer");
    address other = makeAddr("other");

    event OrderPaid(
        uint64 indexed orderId,
        address indexed merchant,
        address indexed buyer,
        bytes32 ref,
        uint256 amount,
        uint64 releaseAfter
    );
    event OrderReleased(uint64 indexed orderId, address indexed merchant, address indexed buyer, uint256 amount);
    event OrderRefunded(
        uint64 indexed orderId, address indexed merchant, address indexed buyer, uint256 amount, uint256 totalRefunded
    );

    function setUp() public {
        usdt = new MockUSDT();
        pay = new FreshPay(IERC20(address(usdt)), DELAY);
        usdt.mint(buyer, 1_000_000_000);
        usdt.mint(other, 1_000_000_000);
        usdt.mint(merchant, 1_000_000_000);
        vm.prank(buyer);
        usdt.approve(address(pay), type(uint256).max);
        vm.prank(other);
        usdt.approve(address(pay), type(uint256).max);
    }

    function _pay() internal returns (uint64) {
        vm.prank(buyer);
        return pay.pay(merchant, LISTING, PRICE, block.timestamp + 15 minutes);
    }

    // --- Payment ---

    function test_PayHoldsFundsAndRecordsOrder() public {
        vm.expectEmit(address(pay));
        emit OrderPaid(1, merchant, buyer, LISTING, PRICE, uint64(block.timestamp) + DELAY);
        uint64 id = _pay();

        assertEq(id, 1);
        assertEq(usdt.balanceOf(address(pay)), PRICE);
        FreshPay.Order memory order = pay.getOrder(id);
        assertEq(order.buyer, buyer);
        assertEq(order.merchant, merchant);
        assertEq(order.amount, PRICE);
        assertEq(order.ref, LISTING);
        assertEq(uint8(order.state), uint8(FreshPay.State.Paid));
        assertEq(pay.activeOrder(merchant, LISTING), id);
        assertEq(pay.merchantOrderIds(merchant).length, 1);
        assertEq(pay.buyerOrderIds(buyer)[0], id);
    }

    function test_RevertWhen_ReferenceAlreadyPaid() public {
        uint64 id = _pay();
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSelector(FreshPay.ReferenceAlreadyPaid.selector, id));
        pay.pay(merchant, LISTING, PRICE, block.timestamp + 15 minutes);
    }

    function test_SameReferenceForDifferentMerchantsIsIndependent() public {
        _pay();
        vm.prank(buyer);
        assertEq(pay.pay(other, LISTING, PRICE, block.timestamp + 1), 2);
    }

    function test_RevertWhen_QuoteExpired() public {
        uint256 deadline = block.timestamp + 15 minutes;
        vm.warp(deadline + 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FreshPay.QuoteExpired.selector, deadline));
        pay.pay(merchant, LISTING, PRICE, deadline);
    }

    function test_RevertWhen_InvalidInputs() public {
        vm.startPrank(buyer);
        vm.expectRevert(FreshPay.InvalidMerchant.selector);
        pay.pay(address(0), LISTING, PRICE, block.timestamp);
        vm.expectRevert(FreshPay.InvalidMerchant.selector);
        pay.pay(buyer, LISTING, PRICE, block.timestamp);
        vm.expectRevert(FreshPay.InvalidReference.selector);
        pay.pay(merchant, bytes32(0), PRICE, block.timestamp);
        vm.expectRevert(FreshPay.InvalidAmount.selector);
        pay.pay(merchant, LISTING, 0, block.timestamp);
        vm.expectRevert(FreshPay.InvalidAmount.selector);
        pay.pay(merchant, LISTING, uint256(type(uint128).max) + 1, block.timestamp);
        vm.stopPrank();
    }

    function test_RevertWhen_InsufficientAllowance() public {
        address stranger = makeAddr("stranger");
        usdt.mint(stranger, PRICE);
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(pay), 0, PRICE)
        );
        pay.pay(merchant, LISTING, PRICE, block.timestamp);
    }

    function test_RevertWhen_InsufficientBalance() public {
        address poor = makeAddr("poor");
        vm.startPrank(poor);
        usdt.approve(address(pay), PRICE);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, poor, 0, PRICE));
        pay.pay(merchant, LISTING, PRICE, block.timestamp);
        vm.stopPrank();
    }

    function test_RevertWhen_TokenChargesTransferFee() public {
        FeeToken feeToken = new FeeToken();
        FreshPay feePay = new FreshPay(IERC20(address(feeToken)), DELAY);
        feeToken.mint(buyer, PRICE);
        vm.startPrank(buyer);
        feeToken.approve(address(feePay), PRICE);
        vm.expectRevert(abi.encodeWithSelector(FreshPay.UnexpectedTransferAmount.selector, PRICE - PRICE / 100));
        feePay.pay(merchant, LISTING, PRICE, block.timestamp);
        vm.stopPrank();
    }

    function test_RevertWhen_ZeroToken() public {
        vm.expectRevert(FreshPay.InvalidToken.selector);
        new FreshPay(IERC20(address(0)), DELAY);
    }

    // --- Release ---

    function test_BuyerReleasesImmediately() public {
        uint64 id = _pay();
        vm.expectEmit(address(pay));
        emit OrderReleased(id, merchant, buyer, PRICE);
        vm.prank(buyer);
        pay.release(id);
        assertEq(usdt.balanceOf(address(pay)), 0);
        assertEq(usdt.balanceOf(merchant), 1_000_000_000 + PRICE);
        assertEq(uint8(pay.getOrder(id).state), uint8(FreshPay.State.Released));
        // Released orders keep the reference: the listing is sold.
        assertEq(pay.activeOrder(merchant, LISTING), id);
    }

    function test_AnyoneReleasesAfterDelay() public {
        uint64 id = _pay();
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(FreshPay.ReleaseNotDue.selector, uint64(block.timestamp) + DELAY));
        pay.release(id);
        vm.warp(block.timestamp + DELAY);
        vm.prank(other);
        pay.release(id);
        assertEq(uint8(pay.getOrder(id).state), uint8(FreshPay.State.Released));
    }

    function test_RevertWhen_ReleasedTwice() public {
        uint64 id = _pay();
        vm.startPrank(buyer);
        pay.release(id);
        vm.expectRevert(abi.encodeWithSelector(FreshPay.InvalidState.selector, FreshPay.State.Released));
        pay.release(id);
        vm.stopPrank();
    }

    function test_RevertWhen_UnknownOrder() public {
        vm.expectRevert(abi.encodeWithSelector(FreshPay.UnknownOrder.selector, uint64(7)));
        pay.release(7);
    }

    // --- Refunds ---

    function test_PartialRefundFromEscrowThenRelease() public {
        uint64 id = _pay();
        vm.expectEmit(address(pay));
        emit OrderRefunded(id, merchant, buyer, 2_500_000, 2_500_000);
        vm.prank(merchant);
        pay.refund(id, 2_500_000);
        assertEq(usdt.balanceOf(buyer), 1_000_000_000 - PRICE + 2_500_000);
        assertEq(uint8(pay.getOrder(id).state), uint8(FreshPay.State.Paid));

        vm.prank(buyer);
        pay.release(id);
        assertEq(usdt.balanceOf(merchant), 1_000_000_000 + PRICE - 2_500_000);
        assertEq(usdt.balanceOf(address(pay)), 0);
    }

    function test_FullRefundFreesReference() public {
        uint64 id = _pay();
        vm.prank(merchant);
        pay.refund(id, PRICE);
        assertEq(uint8(pay.getOrder(id).state), uint8(FreshPay.State.Refunded));
        assertEq(pay.activeOrder(merchant, LISTING), 0);
        assertEq(usdt.balanceOf(buyer), 1_000_000_000);

        vm.prank(other);
        assertEq(pay.pay(merchant, LISTING, PRICE, block.timestamp), 2);
    }

    function test_RefundAfterReleasePullsFromMerchant() public {
        uint64 id = _pay();
        vm.prank(buyer);
        pay.release(id);

        vm.startPrank(merchant);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(pay), 0, 5_000_000)
        );
        pay.refund(id, 5_000_000);
        usdt.approve(address(pay), PRICE);
        pay.refund(id, 5_000_000);
        pay.refund(id, PRICE - 5_000_000);
        vm.stopPrank();

        assertEq(usdt.balanceOf(buyer), 1_000_000_000);
        assertEq(uint8(pay.getOrder(id).state), uint8(FreshPay.State.Refunded));
        assertEq(pay.getOrder(id).refunded, PRICE);
    }

    function test_RevertWhen_OverRefunding() public {
        uint64 id = _pay();
        vm.startPrank(merchant);
        pay.refund(id, PRICE - 1);
        vm.expectRevert(abi.encodeWithSelector(FreshPay.RefundExceedsPayment.selector, 1));
        pay.refund(id, 2);
        vm.expectRevert(abi.encodeWithSelector(FreshPay.RefundExceedsPayment.selector, 1));
        pay.refund(id, 0);
        pay.refund(id, 1);
        vm.expectRevert(abi.encodeWithSelector(FreshPay.InvalidState.selector, FreshPay.State.Refunded));
        pay.refund(id, 1);
        vm.stopPrank();
    }

    function test_RevertWhen_UnauthorizedRefund() public {
        uint64 id = _pay();
        vm.prank(buyer);
        vm.expectRevert(FreshPay.NotMerchant.selector);
        pay.refund(id, 1);
        vm.prank(other);
        vm.expectRevert(FreshPay.NotMerchant.selector);
        pay.refund(id, 1);
    }

    function test_RevertWhen_ReleasingRefundedOrder() public {
        uint64 id = _pay();
        vm.prank(merchant);
        pay.refund(id, PRICE);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(FreshPay.InvalidState.selector, FreshPay.State.Refunded));
        pay.release(id);
    }

    function test_GetOrdersBatch() public {
        uint64 id = _pay();
        uint64[] memory ids = new uint64[](2);
        ids[0] = id;
        ids[1] = 99;
        FreshPay.Order[] memory orders = pay.getOrders(ids);
        assertEq(orders[0].buyer, buyer);
        assertEq(uint8(orders[1].state), uint8(FreshPay.State.None));
    }

    // --- Invariant-style fuzzing: escrow always equals what is owed ---

    function testFuzz_EscrowMatchesHeldAmount(uint96 amount, uint96 refundAmount, bool releaseFirst) public {
        amount = uint96(bound(amount, 1, 1_000_000_000));
        refundAmount = uint96(bound(refundAmount, 1, amount));
        vm.prank(buyer);
        uint64 id = pay.pay(merchant, LISTING, amount, block.timestamp);

        if (releaseFirst) {
            vm.prank(buyer);
            pay.release(id);
            vm.startPrank(merchant);
            usdt.approve(address(pay), refundAmount);
            pay.refund(id, refundAmount);
            vm.stopPrank();
            assertEq(usdt.balanceOf(address(pay)), 0);
        } else {
            vm.prank(merchant);
            pay.refund(id, refundAmount);
            assertEq(usdt.balanceOf(address(pay)), amount - refundAmount);
        }
        assertEq(usdt.balanceOf(buyer), 1_000_000_000 - amount + refundAmount);
        assertEq(pay.activeOrder(merchant, LISTING) == 0, refundAmount == amount);
    }
}
