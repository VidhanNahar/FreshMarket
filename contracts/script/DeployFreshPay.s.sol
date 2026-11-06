// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FreshPay} from "../src/FreshPay.sol";

/// Deploys FreshPay against the official Whitechain Sepolia test USDT.
contract DeployFreshPay is Script {
    // Official test USDT named by the Whitechain Operate track (TetherTokenV2 proxy, 6 decimals).
    address constant WHITECHAIN_SEPOLIA_USDT = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;
    uint256 constant WHITECHAIN_SEPOLIA_CHAIN_ID = 1874;

    function run() external returns (FreshPay freshPay) {
        require(block.chainid == WHITECHAIN_SEPOLIA_CHAIN_ID, "FreshPay: deploy to Whitechain Sepolia (1874)");
        address usdt = vm.envOr("FRESHPAY_TOKEN", WHITECHAIN_SEPOLIA_USDT);
        uint64 releaseDelay = uint64(vm.envOr("FRESHPAY_RELEASE_DELAY", uint256(3 days)));
        require(IERC20(usdt).totalSupply() > 0, "FreshPay: token has no supply");

        vm.startBroadcast();
        freshPay = new FreshPay(IERC20(usdt), releaseDelay);
        vm.stopBroadcast();

        console2.log("FreshPay", address(freshPay));
        console2.log("Token", usdt);
        console2.log("Release delay (s)", releaseDelay);
        console2.log("Deploy block", block.number);
    }
}
