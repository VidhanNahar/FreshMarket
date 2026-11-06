// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FreshPay
 * @notice USDT checkout for merchants on Whitechain. A buyer pays a merchant for a payment
 *         reference (FreshMarket uses the Arkiv listing entity key). Funds are held until the
 *         buyer confirms receipt or the release delay passes, so a merchant can refund from
 *         escrow in one transaction. After release, refunds come from the merchant's wallet.
 *
 *         One reference can back only one live order per merchant: a second payment for the
 *         same listing reverts until the first is fully refunded. That is the atomic "stock of
 *         one" a second-hand listing needs, which Arkiv data alone cannot enforce.
 *
 *         Order IDs are sequential and start at 1, so they fit the Arkiv `freshmarket.reviews`
 *         `orderId` (u64) attribute that proves a purchase.
 */
contract FreshPay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        None,
        Paid, // Funds held by this contract.
        Released, // Funds sent to the merchant (minus any refunds issued while held).
        Refunded // Every unit returned to the buyer. Terminal.
    }

    struct Order {
        address buyer;
        uint64 paidAt;
        State state;
        address merchant;
        uint64 releaseAfter;
        uint128 amount;
        uint128 refunded;
        bytes32 ref;
    }

    IERC20 public immutable token;
    /// @notice Seconds after payment when anyone may release held funds to the merchant.
    uint64 public immutable releaseDelay;
    uint64 public orderCount;

    mapping(uint256 orderId => Order) private _orders;
    /// @notice merchant => payment reference => live order (0 when none or fully refunded).
    mapping(address merchant => mapping(bytes32 ref => uint64 orderId)) public activeOrder;
    mapping(address merchant => uint64[]) private _merchantOrders;
    mapping(address buyer => uint64[]) private _buyerOrders;

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

    error InvalidToken();
    error InvalidMerchant();
    error InvalidReference();
    error InvalidAmount();
    error QuoteExpired(uint256 deadline);
    error ReferenceAlreadyPaid(uint64 orderId);
    error UnexpectedTransferAmount(uint256 received);
    error UnknownOrder(uint64 orderId);
    error InvalidState(State state);
    error NotMerchant();
    error ReleaseNotDue(uint64 releaseAfter);
    error RefundExceedsPayment(uint256 refundable);

    constructor(IERC20 token_, uint64 releaseDelay_) {
        if (address(token_) == address(0)) revert InvalidToken();
        token = token_;
        releaseDelay = releaseDelay_;
    }

    /**
     * @notice Pays `amount` token units to `merchant` for `ref`, held until release.
     * @param deadline Unix time after which this quote may not settle, so a stale checkout
     *        page cannot pay a price the merchant has since changed.
     */
    function pay(address merchant, bytes32 ref, uint256 amount, uint256 deadline)
        external
        nonReentrant
        returns (uint64 orderId)
    {
        if (merchant == address(0) || merchant == msg.sender) revert InvalidMerchant();
        if (ref == bytes32(0)) revert InvalidReference();
        if (amount == 0 || amount > type(uint128).max) revert InvalidAmount();
        if (block.timestamp > deadline) revert QuoteExpired(deadline);
        uint64 existing = activeOrder[merchant][ref];
        if (existing != 0) revert ReferenceAlreadyPaid(existing);

        // Measure what actually arrived, so a fee-charging token cannot under-fund escrow.
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received != amount) revert UnexpectedTransferAmount(received);

        orderId = ++orderCount;
        uint64 releaseAfter = uint64(block.timestamp) + releaseDelay;
        _orders[orderId] = Order({
            buyer: msg.sender,
            paidAt: uint64(block.timestamp),
            state: State.Paid,
            merchant: merchant,
            releaseAfter: releaseAfter,
            amount: uint128(amount),
            refunded: 0,
            ref: ref
        });
        activeOrder[merchant][ref] = orderId;
        _merchantOrders[merchant].push(orderId);
        _buyerOrders[msg.sender].push(orderId);
        emit OrderPaid(orderId, merchant, msg.sender, ref, amount, releaseAfter);
    }

    /// @notice The buyer confirms receipt at any time; anyone may release once the delay passes.
    function release(uint64 orderId) external nonReentrant {
        Order storage order = _existing(orderId);
        if (order.state != State.Paid) revert InvalidState(order.state);
        if (msg.sender != order.buyer && block.timestamp < order.releaseAfter) {
            revert ReleaseNotDue(order.releaseAfter);
        }
        order.state = State.Released;
        uint256 payout = order.amount - order.refunded;
        token.safeTransfer(order.merchant, payout);
        emit OrderReleased(orderId, order.merchant, order.buyer, payout);
    }

    /**
     * @notice The merchant refunds part or all of an order. Held funds are refunded from
     *         escrow; released funds are pulled from the merchant, who must approve this
     *         contract first. A full refund frees the payment reference for a new order.
     */
    function refund(uint64 orderId, uint256 amount) external nonReentrant {
        Order storage order = _existing(orderId);
        if (msg.sender != order.merchant) revert NotMerchant();
        State state = order.state;
        if (state != State.Paid && state != State.Released) revert InvalidState(state);
        uint256 refundable = order.amount - order.refunded;
        if (amount == 0 || amount > refundable) revert RefundExceedsPayment(refundable);

        order.refunded += uint128(amount);
        if (amount == refundable) {
            order.state = State.Refunded;
            delete activeOrder[order.merchant][order.ref];
        }
        if (state == State.Paid) token.safeTransfer(order.buyer, amount);
        else token.safeTransferFrom(order.merchant, order.buyer, amount);
        emit OrderRefunded(orderId, order.merchant, order.buyer, amount, order.refunded);
    }

    function getOrder(uint64 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    /// @notice Batch read for dashboards; unknown IDs return an empty order (state None).
    function getOrders(uint64[] calldata orderIds) external view returns (Order[] memory result) {
        result = new Order[](orderIds.length);
        for (uint256 i; i < orderIds.length; ++i) {
            result[i] = _orders[orderIds[i]];
        }
    }

    function merchantOrderIds(address merchant) external view returns (uint64[] memory) {
        return _merchantOrders[merchant];
    }

    function buyerOrderIds(address buyer) external view returns (uint64[] memory) {
        return _buyerOrders[buyer];
    }

    function _existing(uint64 orderId) private view returns (Order storage order) {
        order = _orders[orderId];
        if (order.state == State.None) revert UnknownOrder(orderId);
    }
}
