// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FreshPay} from "../src/FreshPay.sol";

/// Runs the checkout against the real Whitechain Sepolia USDT on a local fork.
/// Skipped unless WHITECHAIN_SEPOLIA_RPC_URL is set: `forge test --match-contract Fork`.
contract FreshPayForkTest is Test {
    IERC20 constant USDT = IERC20(0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7);

    function test_PayRefundReleaseWithOfficialUsdt() public {
        string memory rpc = vm.envOr("WHITECHAIN_SEPOLIA_RPC_URL", string(""));
        vm.skip(bytes(rpc).length == 0);
        vm.createSelectFork(rpc);
        assertEq(block.chainid, 1874);

        FreshPay pay = new FreshPay(USDT, 3 days);
        address buyer = makeAddr("buyer");
        address merchant = makeAddr("merchant");
        deal(address(USDT), buyer, 20_000_000);

        vm.startPrank(buyer);
        USDT.approve(address(pay), 12_500_000);
        uint64 id = pay.pay(merchant, keccak256("listing"), 12_500_000, block.timestamp + 15 minutes);
        vm.stopPrank();

        vm.prank(merchant);
        pay.refund(id, 2_500_000);
        vm.prank(buyer);
        pay.release(id);

        assertEq(USDT.balanceOf(merchant), 10_000_000);
        assertEq(USDT.balanceOf(buyer), 10_000_000);
        assertEq(USDT.balanceOf(address(pay)), 0);
    }
}
